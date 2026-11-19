"""Exercise two independent parties through one authoritative local room."""
from contextlib import contextmanager
import json
from pathlib import Path
from statistics import median
from threading import Thread
from time import monotonic, sleep
from urllib.request import Request, urlopen
from uuid import uuid4

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

    def post(self, path, **body):
        request = Request(self.url + path, json.dumps(body).encode(),
                          {'Content-Type': 'application/json', 'Origin': self.url})
        started = monotonic()
        with urlopen(request, timeout=10) as response:
            data = response.read()
        self.replies.append((1000*(monotonic()-started), len(data)))
        return json.loads(data) if data else None

    def frame(self, actions=(), **extra):
        result = self.post('/api/frame', session=self.sid, owner=self.owner, steps=0, actions=actions,
                           storyGraphRevision=self.revision, **extra)
        self.sid = result['session']
        self.revision = result['storyGraphRevision']
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


with lab() as url:
    host, guest, extra = Client(url), Client(url), Client(url)
    solo = host.prepare(True)
    guest.prepare(False)
    opened = host.frame(['coop_create'])
    code = opened['coop']['code']
    joined = guest.frame(['coop_join:'+code])
    assert joined['coop']['peers'][0]['online']
    assert joined['coop']['enemies'] == opened['coop']['enemies']
    assert len(joined['coop']['enemies']) == solo['total'] == 6
    assert joined['coop']['enemies'][0]['maxhp'] == 15
    extra.prepare(False)
    assert '満員' in extra.frame(['coop_join:'+code])['coop']['notice']

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
    result = dict(
        twoPlayers=True, partyActors=4, sharedEnemies=6, unchangedEnemyMaxHp=15,
        contributionsFromBoth=True, sharedDeath=True, rewardOncePerParty=True,
        distinctStoryAndDailyProgress=True, personalDropTargetSets=True, openMapKeepsRoomTicking=True,
        reconnectPreservesSlotAndRewards=True, personalSaveRestores=True,
        httpSamples=len(samples), medianHttpMs=round(median(r[0] for r in samples), 2),
        medianFrameBytes=int(median(r[1] for r in samples)),
    )
Path('evidence/coop-local-http.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print('Two-party local room: shared kill, personal rewards, map menu, reconnect and save passed.')
