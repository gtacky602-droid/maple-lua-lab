"""Exercise two- and four-player rooms through the local HTTP surface."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from gzip import decompress
import json
from pathlib import Path
from statistics import median
from threading import Thread
from time import monotonic, process_time, sleep
from urllib.request import Request, urlopen
from uuid import uuid4

from runtime import native
from server import Handler, LabServer, LOCK, SESSIONS


@contextmanager
def lab():
    server = LabServer(('127.0.0.1', 0), Handler, daily_path=':memory:')
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}'
    finally:
        server.shutdown()
        worker.join()
        server.server_close()
        SESSIONS.clear()


class Client:
    def __init__(self, url):
        self.url = url
        self.owner = uuid4().hex
        self.sid = None
        self.revision = None
        self.replies = []
        self.accept_encoding = 'identity'

    def post(self, path, **body):
        request = Request(self.url + path, json.dumps(body).encode(),
                          {'Content-Type': 'application/json', 'Origin': self.url,
                           'Accept-Encoding': self.accept_encoding})
        started = monotonic()
        with urlopen(request, timeout=10) as response:
            data = response.read()
            encoding = response.headers.get('Content-Encoding')
        self.replies.append((1000*(monotonic()-started), len(data), encoding))
        if encoding == 'gzip':
            data = decompress(data)
        return json.loads(data) if data else None

    def frame(self, actions=(), *, steps=0, **extra):
        result = self.post('/api/frame', session=self.sid, owner=self.owner, steps=steps, actions=actions,
                           storyGraphRevision=self.revision, **extra)
        self.sid = result['session']
        self.revision = result['storyGraphRevision']
        self.last_frame = result
        return result

    def release(self):
        self.post('/api/release', session=self.sid, owner=self.owner)

    def prepare(self, accept):
        actions = ['story_start']
        if accept:
            actions += ['story_accept:mond-patrol', 'daily_accept:daily-mond-safety', 'target_set:troupe']
        self.frame(actions)
        with LOCK:
            state = SESSIONS[self.sid]['state']
            state.actors[1].x = 1380
        frame = self.frame(['story_portal:mond-road'])
        assert frame['story']['node'] == 'mond-road'
        return frame


def advance(first, second, seconds):
    until = monotonic()+seconds
    while monotonic()<until:
        sleep(.025)
        first_frame = first.frame()
        second_frame = second.frame()
    return first_frame, second_frame


def run_party_transition(url):
    host, guest = Client(url), Client(url)
    host.prepare(False)
    guest.prepare(False)
    guest.frame(steps=6)
    code = host.frame(['coop_create'])['coop']['code']
    with LOCK:
        env = SESSIONS[guest.sid]
        state, core = env['state'], env['core']
        core.enterStoryNode(state, 'mond-town')
        state.actors[2].hp = 61
        state.actors[2].cd.skill1 = 12
        core.action(state, 'companion:beidou')
        assert state.companion == 'beidou' and state.companionRest.amber.hp == 61
        core.enterStoryNode(state, 'mond-road')
        state.actors[1].hp, state.actors[2].hp = 72, 85
        state.gauge = 57
        reserve_time = state.t - state.companionRest.amber.time
    dodged = guest.frame(['dodge', 'swap', 'dodge'])
    assert all(0 < actor['cd']['dodge'] <= 2 for actor in dodged['actors'])
    assert dodged['t'] > 0
    with LOCK:
        SESSIONS[guest.sid]['state'].actors[1].lock = 4
    joined = guest.frame(['coop_join:' + code])
    assert joined['coop']['code'] == code and joined['gauge'] == 57, joined['gauge']
    assert [actor['hp'] for actor in joined['actors']] == [72, 85]
    assert joined['active'] == 2
    assert all(0 < actor['cd']['dodge'] <= 2 for actor in joined['actors'])
    assert 3 < joined['actors'][0]['lock'] <= 4
    with LOCK:
        state = SESSIONS[guest.sid]['state']
        assert state.companion == 'beidou'
        assert 0 < state.swap <= .8
        reserve = state.companionRest.amber
        assert reserve.hp == 61 and reserve.cd.skill1 == 12
        assert reserve_time <= state.t - reserve.time < reserve_time + .5

    guest.release()
    guest.owner = uuid4().hex
    recovered = guest.frame(resume=True)
    assert recovered['coop']['slot'] == joined['coop']['slot']
    assert all(0 < actor['cd']['dodge'] <= 2 for actor in recovered['actors'])
    left = guest.frame(['coop_leave'])
    assert 'code' not in left['coop'] and left['gauge'] == 57
    assert all(0 < actor['cd']['dodge'] <= 2 for actor in left['actors'])
    with LOCK:
        env = SESSIONS[guest.sid]
        state, core = env['state'], env['core']
        remaining = 12 - (state.t - state.companionRest.amber.time)
        core.enterStoryNode(state, 'mond-town')
        core.action(state, 'companion:amber')
        assert state.actors[2].hp == 61
        assert state.actors[2].cd.skill1 == remaining
    return dict(joinedWithBothDodgeCooldowns=True, swapCooldownPreserved=True,
                hpGaugeAndActiveActorPreserved=True, reservesKeptHpAndCooldownAge=True,
                resumedOriginalRoomSlot=True, leftWithBothDodgeCooldowns=True)


def run_two_players(url):
    host, guest = Client(url), Client(url)
    solo = host.prepare(True)
    guest.prepare(False)
    opened = host.frame(['coop_create'])
    code = opened['coop']['code']
    joined = guest.frame(['coop_join:'+code])
    assert joined['coop']['peers'][0]['online']
    assert joined['coop']['enemies'] == opened['coop']['enemies']
    assert len(joined['coop']['enemies']) == solo['total'] == 6
    assert joined['coop']['enemies'][0]['maxhp'] == 15

    with LOCK:
        for i, client in enumerate((host, guest), 1):
            s = SESSIONS[client.sid]['state']
            s.actors[1].x = 210
            s.actors[2].lock = 60  # Keep the two manual contributions independently observable.
            s.inventory.rng = i * 100  # Observe each player's drop without waiting for a rare roll.

    host.frame(['normal'])
    a, b = advance(host, guest, .3)
    before = a['coop']['enemies'][0]['hp']
    assert 0 < before < 15 and b['coop']['enemies'][0]['hp'] == before, (
        before, b['coop']['enemies'][0]['hp'], a['coop']['tick'], a['events'][-6:])
    assert a['kills'] == b['kills'] == 0
    guest.frame(['normal'])
    a, b = advance(host, guest, .38)
    assert a['coop']['enemies'][0]['hp'] == b['coop']['enemies'][0]['hp'] == 0
    assert a['kills'] == b['kills'] == 1
    assert a['progression']['baseXp'] == b['progression']['baseXp'] > 0
    assert a['mora'] == b['mora'] > 0
    assert a['story']['quests']['mond-patrol']['count'] == 1
    assert 'mond-patrol' not in b['story']['quests']
    assert a['daily']['activeSlots'][0]['count'] == 1 and not b['daily']['activeSlots']
    left_drops = a['inventory']['items'] + [drop['item'] for drop in a['inventory']['ground']]
    right_drops = b['inventory']['items'] + [drop['item'] for drop in b['inventory']['ground']]
    assert [item['setId'] for item in left_drops] == ['troupe']
    assert [item['setId'] for item in right_drops] == ['gladiator']
    grant = a['progression']['baseXp']
    a, b = advance(host, guest, .2)
    assert a['progression']['baseXp'] == b['progression']['baseXp'] == grant

    frame = host.frame(['world_map_toggle'])
    assert frame['worldMap'] and not frame['paused']
    tick = frame['coop']['tick']
    sleep(.075)
    assert guest.frame()['coop']['tick'] > tick

    guest.release()
    assert not host.frame()['coop']['peers'][0]['online']
    guest.owner = uuid4().hex
    recovered = guest.frame(resume=True)
    assert recovered['coop']['code'] == code and recovered['kills'] == 1
    assert host.frame()['coop']['peers'][0]['online']

    # Browser restores leave the room and preserve personal records.
    snapshot = guest.frame(checkpoint=True)['checkpoint']
    restored = guest.frame(restore=snapshot)
    assert 'code' not in restored['coop'] and restored['story']['node'] == 'mond-town'
    assert restored['kills'] == 1 and restored['progression']['baseXp'] == grant
    a = host.frame(['coop_leave'])
    assert 'code' not in a['coop'] and a['progression']['baseXp'] == grant
    a = host.frame(checkpoint=True)
    assert a['checkpoint']['story']['quests']['mond-patrol']['count'] == 1
    assert a['checkpoint']['daily']['ledger']['activeSlots'][0]['count'] == 1

    samples = host.replies[3:-4] + guest.replies[3:-4]
    return dict(
        twoPlayers=True, partyActors=4, sharedEnemies=6, unchangedEnemyMaxHp=15,
        contributionsFromBoth=True, sharedDeath=True, rewardOncePerParty=True,
        distinctStoryAndDailyProgress=True, personalDropTargetSets=True, openMapKeepsRoomTicking=True,
        reconnectPreservesSlotAndRewards=True, personalSaveRestores=True,
        httpSamples=len(samples), medianHttpMs=round(median(r[0] for r in samples), 2),
        medianFrameBytes=int(median(r[1] for r in samples)),
    )


def create_room(url, count):
    clients = [Client(url) for _ in range(count)]
    for i, client in enumerate(clients):
        client.prepare(i % 2 == 0)
    code = clients[0].frame(['coop_create'])['coop']['code']
    for client in clients[1:]:
        assert client.frame(['coop_join:'+code])['coop']['code'] == code
    with LOCK:
        for i, client in enumerate(clients, 1):
            env = SESSIONS[client.sid]
            s = env['state']
            s.actors[1].x = 160 + 15*i
            s.actors[2].lock = 60
            s.pending = env['lua'].table()
    return code, clients


def sample_frames(clients, network, duration, **options):
    start_cpu = process_time()
    start = monotonic()
    rounds = 0
    next_frame = start
    while monotonic() < start+duration:
        list(network.map(lambda client: client.frame(**options), clients))
        rounds += 1
        next_frame += 1/30
        sleep(max(0, next_frame-monotonic()))
    return rounds, monotonic()-start, process_time()-start_cpu


def profile_room(clients, network, mode, accept_encoding='identity', **options):
    for client in clients:
        client.accept_encoding = accept_encoding
    sample_frames(clients, network, .2, **options)
    start_tick = clients[0].last_frame['coop']['tick']
    starts = [len(c.replies) for c in clients]
    rounds, seconds, cpu = sample_frames(clients, network, 1.6, **options)
    end_tick = clients[0].last_frame['coop']['tick']
    samples = sorted(sample for c, start in zip(clients, starts) for sample in c.replies[start:])
    encodings = {row[2] for row in samples}
    if accept_encoding == 'gzip':
        assert 'gzip' in encodings
    else:
        assert encodings == {None}
    return dict(
        mode=mode, seconds=round(seconds, 2), samples=len(samples),
        framesPerPlayerSecond=round(rounds/seconds, 1), roomTicksPerSecond=round((end_tick-start_tick)/seconds, 1),
        medianHttpMs=round(median(r[0] for r in samples), 2),
        p95HttpMs=round(samples[(len(samples)-1)*95//100][0], 2),
        medianFrameBytes=int(median(r[1] for r in samples)),
        processCpuMsPerSecond=round(1000*cpu/seconds, 1),
        drawCommands=clients[0].last_frame['commands'],
        gzipFrames=sum(row[2] == 'gzip' for row in samples),
        packedRectangles=options.get('packRectArt', False),
    )


def expand_rectangles(frame):
    for draw in frame['draws']:
        if draw['kind'] != 'rect_runs':
            yield draw
            continue
        for x, y, width, height, color in frame['rectBatches'][draw['batch']-1]:
            if 'palette' in draw:
                color = draw['palette'][color-1]
            if 'rotation' in draw:
                sx, sy = draw['w']/draw['gridWidth'], draw['h']/draw['gridHeight']
                left = -draw['w']*draw['anchorX']+x*sx
                if draw['flip']:
                    left = -left-width*sx
                top = -draw['h']*draw['anchorY']+y*sy
                cos, sin = draw['rotationCos'], draw['rotationSin']
                rectangle = dict(kind='rect', x=draw['x']+cos*left-sin*top,
                                 y=draw['y']+sin*left+cos*top, w=width*sx+.05, h=height*sy+.05,
                                 color=color, rotation=draw['rotation'])
            else:
                column = draw['gridWidth']-x-width if draw['flip'] else x
                rectangle = dict(
                    kind='rect',
                    x=draw['x']+column*draw['w']/draw['gridWidth'],
                    y=draw['y']+y*draw['h']/draw['gridHeight'],
                    w=width*draw['w']/draw['gridWidth']+.05,
                    h=height*draw['h']/draw['gridHeight']+.05, color=color,
                )
            for key in ('opacity', 'motionOnly', 'translucentFill'):
                if key in draw:
                    rectangle[key] = draw[key]
            yield rectangle


def verify_rectangles(clients):
    for profile in ('legacy', 'h48c32', 'h32c16'):
        with LOCK:
            for client in clients:
                env = SESSIONS[client.sid]
                state, core = env['state'], env['core']
                raw = native(core.frame(state, 'rect', profile))
                state.packRectArt = True
                try:
                    packed = native(core.frame(state, 'rect', profile))
                finally:
                    state.packRectArt = None
                assert len(packed['draws']) < len(raw['draws'])
                assert list(expand_rectangles(packed)) == raw['draws']


def run_four_players(url):
    code, clients = create_room(url, 4)
    fifth = Client(url)
    fifth.prepare(False)
    assert '満員' in fifth.frame(['coop_join:'+code])['coop']['notice']
    with ThreadPoolExecutor(max_workers=4) as network:
        sample_frames(clients, network, .2)
        for client in clients:
            party = client.last_frame['coop']
            assert party['capacity'] == 4
            assert len(party['peers']) == 3 and all(len(peer['actors']) == 2 for peer in party['peers'])
            assert len(party['enemies']) == 6 and party['enemies'][0]['maxhp'] == 15
        verify_rectangles(clients)
        with LOCK:
            for i, client in enumerate(clients, 1):
                s = SESSIONS[client.sid]['state']
                s.actors[1].x, s.actors[1].atk = 420, 2
                s.actors[1].dir = 1
                s.inventory.rng = i*100
        for i, client in enumerate(clients, 1):
            client.frame(['normal'])
            sample_frames(clients, network, .32)
            for peer in clients:
                frame = peer.last_frame
                assert frame['coop']['enemies'][1]['hp'] == max(0, 15 - 4*i), frame['events'][-6:]
                assert frame['kills'] == int(i == 4)
        snapshots = [c.frame(checkpoint=True) for c in clients]
        for i, frame in enumerate(snapshots):
            rpt = frame['checkpoint']
            assert frame['kills'] == 1 and frame['progression']['baseXp'] == 1 and frame['mora'] == 10
            drops = frame['inventory']['items'] + [row['item'] for row in frame['inventory']['ground']]
            assert [item['setId'] for item in drops] == ['troupe' if i % 2 == 0 else 'gladiator']
            if i % 2 == 0:
                assert rpt['story']['quests']['mond-patrol']['count'] == 1
                assert rpt['daily']['ledger']['activeSlots'][0]['count'] == 1
            else:
                assert 'mond-patrol' not in rpt['story']['quests']
                assert not rpt['daily']['ledger']['activeSlots']
        returning = clients[-1]
        slot = returning.last_frame['coop']['slot']
        returning.release()
        sample_frames(clients[:-1], network, .2)
        assert not clients[0].last_frame['coop']['peers'][-1]['online']
        returning.owner = uuid4().hex
        rejoined = returning.frame(resume=True)
        assert rejoined['coop']['slot'] == slot and rejoined['progression']['baseXp'] == 1
        assert rejoined['coop']['enemies'][1]['hp'] == 0
        sample_frames(clients, network, .2)
        assert all(c.last_frame['kills'] == 1 for c in clients)
    return dict(
        fourPlayers=True, partyActors=8, sharedEnemies=6, fixedEnemyMaxHp=15,
        fullRoomRejectsFifth=True, sequentialFourContributions=True, rewardOncePerParty=True,
        independentStoryAndDailyProgress=True, independentDropSets=True, fourthPlayerRejoined=True,
        livingActorsInAnotherView=6,
        packedDrawsMatchEveryRectangleInThreeProfiles=True,
    )


if __name__ == '__main__':
    with lab() as url:
        party = run_party_transition(url)
        Path('evidence/coop-party-transition-http.json').write_text(
            json.dumps(party, indent=2)+'\n', encoding='utf8')
    with lab() as url:
        two = run_two_players(url)
    with lab() as url:
        four = run_four_players(url)
    comparisons = {}
    for count in (2, 4):
        with lab() as url, ThreadPoolExecutor(max_workers=count) as network:
            _, clients = create_room(url, count)
            comparisons[str(count)] = [
                profile_room(clients, network, 'png', render='sprite', profile='sprite'),
                profile_room(clients, network, 'h32c16', render='rect', profile='h32c16'),
                profile_room(clients, network, 'h32c16', accept_encoding='gzip', render='rect', profile='h32c16'),
                profile_room(clients, network, 'h32c16', accept_encoding='gzip', render='rect',
                             profile='h32c16', packRectArt=True),
            ]
            clients[0].accept_encoding = 'gzip;q=0, identity'
            clients[0].frame(render='rect', profile='h32c16')
            assert clients[0].replies[-1][2] is None
    evidence = {'two': two, 'four': four, 'loopbackComparison': comparisons}
    Path('evidence/coop-local-http.json').write_text(json.dumps(evidence, indent=2)+'\n', encoding='utf8')
    print('Two- and four-player Lua rooms, personal progress, reload and capacity checks passed.')
