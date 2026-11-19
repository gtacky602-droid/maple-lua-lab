"""Exercise both ranking periods through the localhost HTTP and checkpoint paths."""
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import threading
from urllib.request import Request, urlopen

from experience import CAP_EXP
from ranking_store import week_start
from server import Handler, LabServer, LOCK, SESSIONS


@contextmanager
def lab(folder, clock):
    http = LabServer(('127.0.0.1', 0), Handler, daily_path=folder/'daily.sqlite3',
                     ranking_path=folder/'rank.sqlite3', ranking_week=lambda: clock[0])
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{http.server_port}'
    finally:
        http.shutdown()
        thread.join()
        http.server_close()
        SESSIONS.clear()


class Browser:
    def __init__(self, url):
        self.url = url
        self.cookie = ''
        self.session = None

    def request(self, path, body=None):
        headers = {'Cookie': self.cookie, 'Origin': self.url}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        request = Request(self.url+path, None if body is None else json.dumps(body).encode(), headers)
        with urlopen(request, timeout=15) as reply:
            cookie = reply.headers.get('Set-Cookie')
            if cookie:
                assert 'HttpOnly' in cookie and 'SameSite=Strict' in cookie
                self.cookie = cookie.split(';', 1)[0]
            return json.load(reply)

    def frame(self, **fields):
        result = self.request('/api/frame', {'session': self.session, 'steps': 0, **fields})
        self.session = result['session']
        return result

    def award(self, xp, bonus=0):
        # Precision fixture for an award already decided by the authoritative Lua runtime.
        # Progress and leaderboard reads still use the same HTTP handlers as the game.
        with LOCK:
            env = SESSIONS[self.session]
            env['core'].grantExp(env['state'], xp, 'kill', bonus)
        return self.frame()

    def rank(self):
        return self.request('/api/exp-ranking')


reset = datetime(2026, 11, 15, 19, tzinfo=timezone.utc).timestamp()  # Monday 04:00 JST
assert week_start(reset - 1) == week_start(reset) - 7
assert week_start(reset) == week_start(reset + 1)
week = [week_start(reset)]
first = CAP_EXP + 50
with tempfile.TemporaryDirectory(prefix='maple-ranking-test-') as folder:
    path = Path(folder)
    with lab(path, week) as url:
        a, b = Browser(url), Browser(url)
        assert not a.rank()['total']['entries']
        assert a.frame(rankedStart=True)['rankedAdventure']
        assert a.award(first, 333)['progression']['total'] == first + 333
        checkpoint = a.frame(checkpoint=True)['checkpoint']
        assert 'rankProof' in checkpoint
        assert a.rank()['total']['own']['score'] == a.rank()['weekly']['own']['score'] == first
        assert b.frame(rankedStart=True)['rankedAdventure']
        b.award(first)
        rows = a.rank()['total']['entries']
        assert len(rows) == 2 and all(row['place'] == 1 for row in rows)
        assert sum(row['own'] for row in rows) == 1
        b.frame(restore=checkpoint)
        assert not b.frame()['rankedAdventure']
        b.award(2_000)
        assert b.rank()['total']['own']['score'] == first

        # A normal restored adventure can keep its daily ledger without changing
        # the ranked adventure's entitlement for the same daily profile.
        ordinary = deepcopy(checkpoint)
        daily = ordinary['daily']
        daily['ledger']['seen']['daily-mond-safety'] = True
        daily['ledger']['earnedXp'] = 1000
        regular = b.frame(restore=ordinary, checkpoint=True)
        assert regular['checkpoint']['daily']['ledger']['earnedXp'] == 1000
        restored = a.frame(restore=checkpoint, checkpoint=True)
        assert restored['rankedAdventure']
        assert restored['checkpoint']['daily']['ledger']['earnedXp'] == 0
        assert a.rank()['total']['own']['score'] == first

        saved_score = a.rank()['total']['own']['score']
        a.frame(restore={**checkpoint, 'mora': checkpoint['mora']+1})
        assert not a.frame()['rankedAdventure']
        a.award(5_000)
        assert a.rank()['total']['own']['score'] == saved_score
        assert a.frame(restore=checkpoint)['rankedAdventure']
        assert not a.frame(actions=['barrier_trial:50'])['rankedAdventure']
        assert 'rankProof' not in a.frame(checkpoint=True)['checkpoint']
        a.award(8_000)
        assert a.rank()['total']['own']['score'] == saved_score
        assert a.frame(restore=checkpoint)['rankedAdventure']
        assert not a.frame(actions=['boss_geo'])['rankedAdventure']
        a_cookie = a.cookie
        b_cookie = b.cookie

    week[0] += 7
    with lab(path, week) as url:
        a, b = Browser(url), Browser(url)
        a.cookie, b.cookie = a_cookie, b_cookie
        assert a.rank()['total']['own']['score'] == first and a.rank()['weekly']['own'] is None
        assert a.frame(restore=checkpoint)['rankedAdventure']
        a.award(150)
        assert a.rank()['weekly']['own']['score'] == 150
        a.frame(restore=checkpoint)
        a.award(121)
        assert a.rank()['weekly']['own']['score'] == 150
        a.award(80)
        assert a.rank()['weekly']['own']['score'] == 201
        assert a.rank()['total']['own']['score'] == first + 201
        assert b.rank()['total']['own']['score'] == first and b.rank()['weekly']['own'] is None
        assert a.frame(restore={key: item for key, item in checkpoint.items() if key != 'rankProof'})['rankedAdventure'] is False
        rankings = a.rank()

proof = dict(twoProfiles=True, rankedBaseXP=first, boostedTotal=first+333, sharedRankTie=True,
             unsignedAndAlteredSavesStayPlayable=True, otherProfileCannotRankWithSave=True,
             effectiveLabActionsEndEligibility=True, dailyLedgersIsolated=True,
             restartPersistence=True, weekChange=True, monday0400Jst=True,
             replayUsesHighWater=True, standings=rankings)
Path('evidence/exp-ranking-local-http.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print('Local lifetime and weekly ranks passed save, profile, restart and large EXP checks.')
