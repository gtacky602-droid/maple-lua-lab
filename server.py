import json, sqlite3, time, uuid, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from runtime import ROOT, runtime, native
from farka_idle import render_farka_idle
from savegame import validate_save
from daily_store import DailyStore, period_at, valid_profile
SESSIONS = {}
LOCK = threading.RLock()

class LabServer(ThreadingHTTPServer):
    # The map and sprite views load several image and JSON groups in parallel.
    request_queue_size = 64

    def __init__(self, *args, daily_path=None, daily_period=period_at, **kwargs):
        super().__init__(*args, **kwargs)
        self.daily_store = DailyStore(daily_path if daily_path is not None else ROOT/'work/daily-board.sqlite3')
        self.daily_period = daily_period

    def server_close(self):
        super().server_close()
        if hasattr(self, 'daily_store'):
            self.daily_store.close()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a): pass
    def send_json(self,status,result):
        data=json.dumps(result,ensure_ascii=False).encode('utf8')
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_POST(self):
        if self.path not in ('/api/frame','/api/release','/api/farka-idle'): self.send_error(404); return
        if self.headers.get('Origin') not in (None, f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            self.send_error(403); return
        try:
            size=int(self.headers.get('Content-Length',0))
            if not 0<=size<=65536: raise ValueError('invalid request size')
            req=json.loads(self.rfile.read(size))
            if not isinstance(req,dict): raise ValueError('request must be an object')
            if self.path=='/api/farka-idle':
                self.send_json(200,render_farka_idle(req));return
            owner=req.get('owner')
            if owner is not None and (not isinstance(owner,str) or len(owner)>80): raise ValueError('invalid owner')
            if self.path == '/api/release':
                with LOCK:
                    env=SESSIONS.get(req.get('session'))
                    if env and owner and env.get('owner')==owner:
                        env['retire_at']=time.monotonic()+60
                self.send_response(204);self.end_headers();return
            saved=validate_save(req['restore']) if 'restore' in req else None
            requested_profile=req.get('dailyProfile')
            if requested_profile is not None and not valid_profile(requested_profile):
                raise ValueError('日次依頼のプロフィールが不正です')
            with LOCK:
                now=time.monotonic()
                period=self.server.daily_period()
                saved_daily=saved.get('daily') if saved else None
                if (saved_daily and saved_daily['ledger']['period']>period
                        and self.server.daily_store.load(saved_daily['profile']) is None):
                    raise ValueError('日次依頼の保存日時がラボの更新日より先です')
                for old in list(SESSIONS):
                    if now-SESSIONS[old]['last']>1800 or SESSIONS[old].get('retire_at',float('inf'))<=now: del SESSIONS[old]
                sid=req.get('session')
                if sid in SESSIONS and owner and SESSIONS[sid].get('owner') not in (None,owner):
                    if req.get('resume'):
                        if 'retire_at' not in SESSIONS[sid]: sid=None  # Duplicated active tab gets its own state.
                    else: raise ValueError('This page no longer owns the session; reload to reconnect')
                if sid not in SESSIONS or req.get('reset') or saved is not None:
                    prior_profile=SESSIONS[sid]['dailyProfile'] if sid in SESSIONS else None
                    saved_profile=saved_daily['profile'] if saved_daily else None
                    profile=saved_profile or prior_profile or requested_profile or uuid.uuid4().hex
                    if sid in SESSIONS: del SESSIONS[sid]
                    if len(SESSIONS)>=12: raise ValueError('Too many sessions')
                    lua,core=runtime();sid=uuid.uuid4().hex
                    density=int(req.get('density',16));density=density if density in (12,16,20,40) else 16
                    SESSIONS[sid]={'lua':lua,'core':core,'state':core.new(density),'last':now,'dailyProfile':profile}
                    if saved is not None:
                        SESSIONS[sid]['state']=core.restore(lua.table_from(saved,recursive=True),density)
                env=SESSIONS[sid];env['last']=now
                if owner: env['owner']=owner
                if req.get('resume'): env.pop('retire_at',None)
                lua,core,state=env['lua'],env['core'],env['state']
                profile=env['dailyProfile']
                started=time.perf_counter()
                configuration=None
                with self.server.daily_store.transaction():
                    ledger=self.server.daily_store.load(profile)
                    canonical=lua.table_from(ledger,recursive=True) if ledger is not None else None
                    core.dailyBind(state,profile,period,canonical)
                    if ledger is not None: core.dailySettle(state)
                    if 'loadout' in req:
                        if not isinstance(req['loadout'],list): raise ValueError('loadout must be an array')
                        ok,message=core.configure(state,lua.table_from(req['loadout'],recursive=True))
                        configuration={'ok':ok,'message':message}
                    for action in req.get('actions',[])[:10]: core.action(state,str(action))
                    inp=lua.table_from({k:bool(v) for k,v in req.get('input',{}).items() if k in ('left','right','up','down','jump','attack','interact')})
                    steps=max(0,min(6,int(req.get('steps',2))))
                    for _ in range(steps): core.step(state,1/60,inp)
                    next_ledger=native(state.daily.ledger)
                    if next_ledger!=ledger and (ledger is not None or next_ledger['seen']):
                        self.server.daily_store.save(profile,next_ledger)
                core.dailySettle(state)
                frame=core.frame(state,'rect' if req.get('render')=='rect' else 'sprite',req.get('profile'))
                elapsed=(time.perf_counter()-started)*1000
                # Scope the graph revision to this runtime so a reset or restore cannot reuse a stale graph.
                graph_revision = f'{sid}:{frame.storyGraphRevision}'
                frame.storyGraphRevision = None
                accepts_revision = 'storyGraphRevision' in req
                if accepts_revision and req['storyGraphRevision'] == graph_revision:
                    # Drop it before conversion, while the graph itself stays cached in Lua.
                    frame.storyGraph = None
                out=native(frame);out['session']=sid;out['lua_ms']=elapsed;out['lua_kb']=lua.eval("collectgarbage('count')")
                if accepts_revision:
                    out['storyGraphRevision'] = graph_revision
                # An empty Lua table has no array type. Story nodes still expose an exit list.
                for node in out.get('storyGraph', {}).get('nodes', []):
                    if not node['exits']:
                        node['exits'] = []
                if configuration is not None: out['configuration']=configuration
                if req.get('checkpoint'): out['checkpoint']=native(core.checkpoint(state))
                if req.get('compare'):
                    comparisons=[]
                    for profile in req.get('profiles',['legacy','h48c32'])[:2]:
                        start=time.perf_counter()
                        f=core.frame(state,'sprite' if profile=='png' else 'rect',profile)
                        ms=(time.perf_counter()-start)*1000
                        comparisons.append({'profile':profile,'draw_ms':ms,'commands':f.commands,'draws':native(f.draws),'t':state.t})
                    out['comparisons']=comparisons
            self.send_json(200,out)
        except (ValueError,TypeError,KeyError) as e:
            self.send_json(400,{'error':str(e)})
        except sqlite3.Error:
            self.send_json(503,{'error':'日次依頼のローカル記録に接続できません'})

if __name__=='__main__':
    from argparse import ArgumentParser

    parser=ArgumentParser(description='Run the local Lua lab.')
    parser.add_argument('--port',type=int,default=8769,help='Loopback port (default: 8769)')
    parser.add_argument('--daily-store',type=Path,help='Override the local daily SQLite database path')
    args=parser.parse_args()
    with LabServer(('127.0.0.1',args.port),Handler,daily_path=args.daily_store) as server:
        print(f'Lua lab: http://127.0.0.1:{server.server_port}',flush=True)
        server.serve_forever()
