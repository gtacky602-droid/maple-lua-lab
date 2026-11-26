import json, sqlite3, time, uuid, threading
from email.utils import parsedate_to_datetime
from functools import lru_cache
from gzip import compress
from io import BytesIO
from http.cookies import CookieError, SimpleCookie
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from runtime import ROOT, runtime, native
from farka_idle import render_farka_idle
from firework_preview import firework_comparison
from savegame import validate_save
from daily_store import DailyStore, period_at, valid_profile
from ranking_store import COOKIE, RankingStore, default_path, week_start
from coop_rooms import CoopRooms

LAB_ACTIONS = {'campaign', 'accept', 'report', 'town', 'field', 'arena',
               'artifact_samples', 'projectile_trial'}
LAB_ACTION_PREFIXES = ('boss_', 'barrier_trial:')
SESSIONS = {}
LOCK = threading.RLock()
FRAME_COMPRESSION_BYTES = 4 * 1024
MAX_REQUEST_BYTES = 64 * 1024
# Restore requests carry the 256 KiB save along with the frame metadata.
MAX_RESTORE_REQUEST_BYTES = 272 * 1024


def accepts_gzip(header):
    for choice in header.lower().split(','):
        encoding, *options = choice.split(';')
        if encoding.strip() != 'gzip':
            continue
        try:
            for option in options:
                key, _, value = option.strip().partition('=')
                if key.strip() == 'q':
                    return float(value) > 0
        except ValueError:
            return False
        return True
    return False

# Large shared inputs used by the field preview, atlas and sprite galleries.
STATIC_JSON = frozenset(ROOT / directory / name for directory, names in (
    ('assets', ('boss-gallery-packed.json', 'character-gallery-packed.json', 'common-boss-packed.json',
                'placement-pose-index.json', 'slime-preview-packed.json')),
    ('content', ('story-graph.json', 'enemy-spawns.json', 'map-catalog.json', 'world-atlas.json',
                 'field-boss-spawns.json', 'weekly-boss-spawns.json', 'enemy-placement-drafts.json',
                 'enemy-art-layout.json', 'boss-arena-index.json', 'field-boss-openings.json',
                 'group-legend-openings.json', 'stygian-openings.json', 'weekly-opening-parts.json',
                 'worksite-props.json', 'toyac-quest-previews.json')),
) for name in names)


@lru_cache(maxsize=len(STATIC_JSON))
def compressed_asset(path, mtime_ns, size):
    # Metadata in the key invalidates the cached representation after a rebuild.
    return compress(path.read_bytes(), compresslevel=3, mtime=0)


class LabServer(ThreadingHTTPServer):
    # The map and sprite views load several image and JSON groups in parallel.
    request_queue_size = 64

    def __init__(self, *args, daily_path=None, daily_period=period_at,
                 ranking_path=None, ranking_week=week_start, draft_balance=False, draft_field_moves=False, **kwargs):
        self.draft_balance = draft_balance or draft_field_moves
        self.draft_field_moves = draft_field_moves
        if self.draft_balance:
            daily_path = ranking_path = ':memory:'
        if ranking_path is None:
            ranking_path = ':memory:' if daily_path == ':memory:' else default_path()
        if daily_path is None:
            daily_path = ROOT/'work/daily-board.sqlite3'
        if ranking_path != ':memory:' and Path(ranking_path).resolve().is_relative_to(ROOT):
            raise ValueError('ランキングDBは配信フォルダの外に指定してください')
        persistent_paths = ranking_path != ':memory:' and daily_path != ':memory:'
        if persistent_paths and Path(daily_path).resolve() == Path(ranking_path).resolve():
            raise ValueError('通常の日次依頼DBとランキングDBは別のファイルを指定してください')
        super().__init__(*args, **kwargs)
        self.ranking_store = RankingStore(ranking_path)
        self.ranked_daily_store = DailyStore(ranking_path)
        self.ranking_week = ranking_week
        self.daily_store = DailyStore(daily_path)
        self.daily_period = daily_period
        self.coop = CoopRooms()

    def server_close(self):
        super().server_close()
        if hasattr(self, 'ranking_store'):
            self.ranking_store.close()
        if hasattr(self, 'ranked_daily_store'):
            self.ranked_daily_store.close()
        if hasattr(self, 'daily_store'):
            self.daily_store.close()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a): pass
    def end_headers(self):
        if getattr(self, 'vary_asset_encoding', False):
            self.send_header('Vary', 'Accept-Encoding')
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path))
        self.vary_asset_encoding = path in STATIC_JSON
        if not self.vary_asset_encoding or not accepts_gzip(self.headers.get('Accept-Encoding', '')):
            return super().send_head()
        try:
            stat = path.stat()
            since = self.headers.get('If-Modified-Since')
            if since and 'If-None-Match' not in self.headers:
                try:
                    modified = parsedate_to_datetime(since)
                    if modified.tzinfo and int(stat.st_mtime) <= modified.timestamp():
                        self.send_response(304)
                        self.end_headers()
                        return None
                except (ValueError, TypeError, OverflowError):
                    pass
            data = compressed_asset(path, stat.st_mtime_ns, stat.st_size)
        except OSError:
            return super().send_head()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Last-Modified', self.date_time_string(stat.st_mtime))
        self.end_headers()
        return BytesIO(data)

    def send_json(self, status, result, ranking_cookie=None, *, frame=False):
        data = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        large = frame and len(data) >= FRAME_COMPRESSION_BYTES
        encoded = large and accepts_gzip(self.headers.get('Accept-Encoding', ''))
        if encoded:
            data = compress(data, compresslevel=1)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        if large:
            self.send_header('Vary', 'Accept-Encoding')
        if encoded:
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if ranking_cookie:
            self.send_header('Set-Cookie', f'{COOKIE}={ranking_cookie}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict')
        self.end_headers()
        self.wfile.write(data)

    def ranking_account(self):
        try:
            cookies = SimpleCookie(self.headers.get('Cookie', ''))
        except CookieError:
            return None
        return self.server.ranking_store.account(cookies[COOKIE].value) if COOKIE in cookies else None

    def do_GET(self):
        if self.path == '/api/lab-info':
            self.send_json(200, {'draftBalance': self.server.draft_balance,
                                 'draftFieldMoves': self.server.draft_field_moves})
            return
        if self.path != '/api/exp-ranking':
            super().do_GET()
            return
        try:
            with LOCK:
                result = self.server.ranking_store.standings(self.ranking_account(), self.server.ranking_week())
            self.send_json(200, result)
        except sqlite3.Error:
            self.send_json(503, {'error': 'ランキングの記録に接続できません'})

    def do_POST(self):
        if self.path not in ('/api/frame','/api/release','/api/farka-idle','/api/firework-preview'): self.send_error(404); return
        if self.headers.get('Origin') not in (None, f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            self.send_error(403); return
        try:
            size=int(self.headers.get('Content-Length',0))
            limit = MAX_RESTORE_REQUEST_BYTES if self.path == '/api/frame' else MAX_REQUEST_BYTES
            if not 0 <= size <= limit: raise ValueError('invalid request size')
            req=json.loads(self.rfile.read(size))
            if not isinstance(req,dict): raise ValueError('request must be an object')
            if size > MAX_REQUEST_BYTES and 'restore' not in req:
                raise ValueError('invalid request size')
            if self.path=='/api/firework-preview':
                self.send_json(200,firework_comparison(req));return
            if self.path=='/api/farka-idle':
                self.send_json(200,render_farka_idle(req));return
            owner=req.get('owner')
            if owner is not None and (not isinstance(owner,str) or len(owner)>80): raise ValueError('invalid owner')
            if self.path == '/api/release':
                with LOCK:
                    env=SESSIONS.get(req.get('session'))
                    if env and owner and env.get('owner')==owner:
                        env['retire_at']=time.monotonic()+60
                        if env.get('coop_member'):
                            env['coop_member'].online = False
                            env['coop_member'].input = None
                self.send_response(204);self.end_headers();return
            raw_save = req.get('restore')
            saved = validate_save(raw_save) if 'restore' in req else None
            proof = raw_save.get('rankProof') if saved is not None else None
            ranked_start = req.get('rankedStart') is True
            if self.server.draft_balance and ranked_start:
                raise ValueError('バランス比較版の冒険はランキング集計対象外です')
            if ranked_start and saved is not None:
                raise ValueError('ランキングの新規冒険と保存再開は個別に行ってください')
            actions = [str(action) for action in req.get('actions', [])[:10]]
            lab_mode = any(action in LAB_ACTIONS or action.startswith(LAB_ACTION_PREFIXES) for action in actions)
            ranking_cookie = None
            requested_profile=req.get('dailyProfile')
            if requested_profile is not None and not valid_profile(requested_profile):
                raise ValueError('日次依頼のプロフィールが不正です')
            with LOCK:
                now=time.monotonic()
                coop = self.server.coop
                period=self.server.daily_period()
                saved_daily=saved.get('daily') if saved else None
                for old in list(SESSIONS):
                    env = SESSIONS[old]
                    if now-env['last']>1800 or env.get('retire_at',float('inf'))<=now:
                        coop.detach(env)
                        del SESSIONS[old]
                sid=req.get('session')
                rank_store = self.server.ranking_store
                current = SESSIONS.get(sid)
                needs_account = ranked_start or proof or (current and current['rank_player'])
                player = self.ranking_account() if needs_account else None
                if current and current['rank_player'] and current['rank_player'] != player:
                    sid = None
                if current and current.get('coop_room') and not owner:
                    raise ValueError('協力部屋では現在の画面から操作してください')
                if sid in SESSIONS and owner and SESSIONS[sid].get('owner') not in (None,owner):
                    if req.get('resume'):
                        if 'retire_at' not in SESSIONS[sid]: sid=None  # Duplicated active tab gets its own state.
                    else: raise ValueError('This page no longer owns the session; reload to reconnect')
                if sid not in SESSIONS or req.get('reset') or saved is not None or ranked_start:
                    prior_profile=SESSIONS[sid]['dailyProfile'] if sid in SESSIONS else None
                    saved_profile=saved_daily['profile'] if saved_daily else None
                    profile=saved_profile or prior_profile or requested_profile or uuid.uuid4().hex
                    if len(SESSIONS) - int(sid in SESSIONS) >= 12:
                        raise ValueError('Too many sessions')
                    verified_save = saved is not None and rank_store.verify(player, saved, proof)
                    ranked_restore = verified_save and not lab_mode
                    restore_daily_store = self.server.ranked_daily_store if ranked_restore else self.server.daily_store
                    if (saved_daily and saved_daily['ledger']['period'] > period
                            and restore_daily_store.load(saved_profile) is None):
                        raise ValueError('日次依頼の保存日時がラボの更新日より先です')
                    lua,core=runtime(draft_balance=self.server.draft_balance,
                                     draft_field_moves=self.server.draft_field_moves)
                    density=int(req.get('density',16));density=density if density in (12,16,20,40) else 16
                    state = core.restore(lua.table_from(saved, recursive=True), density) if saved is not None else core.new(density)
                    rank_player = None
                    if ranked_start:
                        if player is None:
                            player, ranking_cookie = rank_store.register()
                        rank_player = player
                        profile = uuid.uuid4().hex
                        core.action(state, 'story_start')
                    elif ranked_restore:
                        rank_player = player
                    if sid in SESSIONS:
                        coop.detach(SESSIONS[sid])
                        del SESSIONS[sid]
                    sid = uuid.uuid4().hex
                    SESSIONS[sid] = dict(lua=lua, core=core, state=state, last=now, dailyProfile=profile,
                                         rank_player=rank_player, rank_seen=0)
                env=SESSIONS[sid];env['last']=now
                if owner: env['owner']=owner
                if req.get('resume'): env.pop('retire_at',None)
                if lab_mode:
                    env['rank_player'] = None
                    coop.detach(env)
                if owner:
                    actions = [action for action in actions if not coop.command(env, action, now)]
                daily_store = self.server.ranked_daily_store if env['rank_player'] else self.server.daily_store
                lua,core,state=env['lua'],env['core'],env['state']
                started=time.perf_counter()
                configuration=None
                inp=lua.table_from({k:bool(v) for k,v in req.get('input',{}).items() if k in ('left','right','up','down','jump','attack','interact')})
                steps=max(0,min(6,int(req.get('steps',2))))
                with daily_store.transaction():
                    ledgers = []
                    for row in coop.participants(env, now):
                        profile, party = row['dailyProfile'], row['state']
                        ledger = daily_store.load(profile)
                        canonical = lua.table_from(ledger, recursive=True) if ledger is not None else None
                        core.dailyBind(party, profile, period, canonical)
                        if ledger is not None:
                            core.dailySettle(party)
                        ledgers.append((profile, party, ledger))
                    if 'loadout' in req:
                        if not isinstance(req['loadout'],list): raise ValueError('loadout must be an array')
                        ok,message=core.configure(state,lua.table_from(req['loadout'],recursive=True))
                        configuration={'ok':ok,'message':message}
                    for action in actions:
                        if action != 'pause' or not core.sharesCoopField(state):
                            core.action(state, action)
                            coop.update_location(env)
                    if room := env.get('coop_room'):
                        env['coop_member'].input = inp
                        coop.advance(room, now)
                    else:
                        for _ in range(steps):
                            core.step(state, 1/60, inp)
                    for profile, party, ledger in ledgers:
                        next_ledger = native(party.daily.ledger)
                        if next_ledger != ledger and (ledger is not None or next_ledger['seen']):
                            daily_store.save(profile, next_ledger)
                for _, party, _ in ledgers:
                    core.dailySettle(party)
                if env['rank_player'] and state.progression:
                    score = state.progression.baseXp
                    if score > env['rank_seen']:
                        rank_store.record(env['rank_player'], score, self.server.ranking_week())
                        env['rank_seen'] = score
                mode = 'rect' if req.get('render')=='rect' else 'sprite'
                state.packRectArt = req.get('packRectArt') is True
                state.packFireworks = req.get('packFireworks') is True
                try:
                    frame = core.frame(state, mode, req.get('profile'))
                finally:
                    state.packRectArt = None
                    state.packFireworks = None
                coop_view = coop.view(env)
                elapsed=(time.perf_counter()-started)*1000
                # Scope the graph revision to this runtime so a reset or restore cannot reuse a stale graph.
                graph_revision = f'{sid}:{frame.storyGraphRevision}'
                frame.storyGraphRevision = None
                accepts_revision = 'storyGraphRevision' in req
                if accepts_revision and req['storyGraphRevision'] == graph_revision:
                    # Drop it before conversion, while the graph itself stays cached in Lua.
                    frame.storyGraph = None
                out=native(frame);out['session']=sid;out['lua_ms']=elapsed;out['lua_kb']=lua.eval("collectgarbage('count')")
                if batches := out.get('rectBatches'):
                    out['commands'] += sum(len(batches[draw['batch']-1]) - 1
                                           for draw in out['draws'] if draw['kind'] == 'rect_runs')
                if req.get('packFireworks') is True and (frame.storyFireworkStatus or frame.storyFireworkDesign):
                    out['commands'] += sum(2 * (len(d['points']) // 3) - 1 for d in out['draws']
                                           if d['kind'] == 'firework_sparks')
                out['coop'] = coop_view
                if accepts_revision:
                    out['storyGraphRevision'] = graph_revision
                # An empty Lua table has no array type. Story nodes still expose an exit list.
                for node in out.get('storyGraph', {}).get('nodes', []):
                    if not node['exits']:
                        node['exits'] = []
                if configuration is not None: out['configuration']=configuration
                out['rankedAdventure'] = bool(env['rank_player'])
                if req.get('checkpoint'):
                    out['checkpoint'] = native(core.checkpoint(state))
                    if env['rank_player'] and out['checkpoint']:
                        # Validate and strip the same way as on import before signing.
                        checkpoint = validate_save(out['checkpoint'])
                        out['checkpoint']['rankProof'] = rank_store.proof(env['rank_player'], checkpoint)
                if req.get('compare'):
                    comparisons=[]
                    for profile in req.get('profiles',['legacy','h48c32'])[:2]:
                        start=time.perf_counter()
                        f=core.frame(state,'sprite' if profile=='png' else 'rect',profile)
                        ms=(time.perf_counter()-start)*1000
                        comparisons.append({'profile':profile,'draw_ms':ms,'commands':f.commands,'draws':native(f.draws),'t':state.t})
                    out['comparisons']=comparisons
            self.send_json(200, out, ranking_cookie, frame=True)
        except (ValueError,TypeError,KeyError) as e:
            self.send_json(400,{'error':str(e)})
        except sqlite3.Error:
            self.send_json(503,{'error':'ラボのローカル記録に接続できません'})

if __name__=='__main__':
    from argparse import ArgumentParser

    parser=ArgumentParser(description='Run the local Lua lab.')
    parser.add_argument('--port',type=int,default=8769,help='Loopback port (default: 8769)')
    parser.add_argument('--daily-store',type=Path,help='Override the local daily SQLite database path')
    parser.add_argument('--ranking-store', type=Path, help='Override the private ranking SQLite database path')
    parser.add_argument('--draft-balance', action='store_true', help='Use provisional enemy HP and weapon ATK')
    parser.add_argument('--draft-field-moves', action='store_true',
                        help='Use provisional balance and alternate field boss moves')
    args=parser.parse_args()
    with LabServer(('127.0.0.1',args.port),Handler,daily_path=args.daily_store, ranking_path=args.ranking_store,
                   draft_balance=args.draft_balance, draft_field_moves=args.draft_field_moves) as server:
        print(f'Lua lab: http://127.0.0.1:{server.server_port}',flush=True)
        server.serve_forever()
