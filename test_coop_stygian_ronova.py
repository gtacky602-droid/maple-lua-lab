"""Check the shared Ronova timeline and each player's trial, return and rewards."""
import json

from runtime import ROOT, native
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_farka import fixture, open_arena, place, strike


HUB, ARENA, QUEST = 'snezhnaya-hub', 'sne-stygian-last-gate', 'stygian-ronova-commission'
KEY, NORMAL = 'ronova:normal', 'stygian_start:ronova:normal:'


def room(url):
    host, guest = Client(url), Client(url)
    for client in (host, guest):
        open_arena(client, 164, accept=client is guest, hub=HUB, arena=ARENA, quest=QUEST, entrance_x=1080)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    assert host.frame([NORMAL + 'troupe'])['endgameRun']['gathering'] > 0
    entered = guest.frame([NORMAL + 'gladiator'])
    assert entered['boss']['maxhp'] == 5460 and entered['endgameRun']['lamps'] == 5
    return host, guest, code


class Fight:
    def __init__(self, players):
        self.host, self.guest = [SESSIONS[client.sid] for client in players[:2]]
        self.s, self.t = self.host['state'], self.guest['state']
        self.parties = (self.s, self.t)
        self.world, self.core = self.s.coop, self.host['core']
        self.run = self.world.stygianRun
        self.boss = self.run.boss
        for party in self.parties:
            for actor in party.actors.values():
                actor.inv = 400
                for move in ('normal', 'skill1', 'skill2', 'skill3', 'skill4'):
                    actor.cd[move] = 400

    def step(self, ticks=1):
        for _ in range(ticks):
            self.core.stepCoop(self.world, 1 / 60)

    def until(self, condition, bound=6500):
        for _ in range(bound):
            if condition():
                return
            self.step()
        c = self.run.cast
        raise AssertionError((self.run.status, self.run.stage, self.run.phase, c and c.key, c and c.t))

    def at(self, key, tick):
        self.until(lambda: self.run.cast and self.run.cast.key == key and self.run.cast.t == tick)
        return self.run.cast

    def place(self, party, x, y=480):
        actor = party.actors[party.active]
        place(actor, x)
        actor.y = y
        return actor

    def collect(self, party, shadow):
        self.place(party, shadow.x, shadow.sole)
        self.step()

    def progress(self, party, cast):
        return cast.members[party.coopMember.id]

    def view(self, party):
        return native(self.core.frame(party, 'sprite').endgameRun)


def trials(url):
    players = room(url)
    with LOCK:
        f = Fight(players)
        s, t = f.parties
        a, b = s.endgameRun, t.endgameRun
        f.until(lambda: f.run.phase == 'ready')
        strike(f.guest, f.boss, 100)
        strike(f.host, f.boss, 999999)
        assert f.boss.hp == 4095 and a.skills.normal > 0 and b.skills.normal > 0

        wave = f.at('RN02', 65)
        for party in f.parties:
            f.place(party, f.boss.x + wave.dir * 25)
        f.step(7)
        assert a.life == b.life == 82
        assert [len(p.echoes) for p in (a, b)] == [1, 1]
        assert a.echoes[1].owner == s.coopMember.id and b.echoes[1].owner == t.coopMember.id
        f.collect(s, a.echoes[1])
        assert a.life == 100 and b.life == 82 and len(b.echoes) == 1
        f.collect(t, b.echoes[1])
        assert b.life == 100

        split = f.at('RN03', 77)
        x, y = [f.progress(party, split) for party in f.parties]
        assert a.life == b.life == 64
        for shadow in x.shadows.values():
            f.collect(s, shadow)
        assert a.life == 100 and b.life == 64 and split.stop == 702
        assert f.view(s)['found'] == 3 and f.view(t)['found'] == 0
        for shadow in y.shadows.values():
            f.collect(t, shadow)
        assert b.life == 100 and split.stop == split.t + 96

        f.until(lambda: f.run.phase == 'ready' and f.run.stage == 2)
        strike(f.host, f.boss, 999999)
        judge = f.at('RN05', 84)
        f.place(s, judge.mark)
        f.place(t, 910 if judge.mark < 480 else 50)
        assert f.view(s)['areas'] == f.view(t)['areas']
        f.step(54)
        assert s.actors[1].hp == 0 and s.active == 2 and t.actors[1].hp > 0 and a.lamps == b.lamps == 5
        assert sum(e.kind == 'stygian:ronova:authority_lethal' for e in s.events.values()) == 1
        f.place(t, s.actors[1].x)
        f.core.action(t, 'encounter_interact')
        assert not b.aid and s.actors[1].hp == 0
        f.place(s, s.actors[1].x)
        f.core.action(s, 'encounter_interact')
        f.step(180)
        assert s.actors[1].hp == s.actors[1].maxhp // 4 and a.lamps == 5 and a.aidCooldown > 3500

        trial = f.at('RN06', 90)
        x, y = [f.progress(party, trial) for party in f.parties]
        f.place(t, 50)
        for index in (1, 2):
            f.collect(s, x.shadows[index])
        assert x.done and not y.done and trial.stop == 852
        for index in (2, 3):
            f.collect(t, y.shadows[index])
        assert y.done and trial.stop == trial.t + 132

        f.until(lambda: f.run.phase == 'ready' and f.run.stage == 3)
        strike(f.host, f.boss, 999999)
        road = f.at('RN12', 89)
        f.place(t, 50)
        for point in f.run.spec.arena.road.values():
            f.place(s, point[1], point[2])
            f.step()
        assert f.view(s)['road']['passed'] == 4 and f.view(t)['road']['passed'] == 0 and road.stop == 900
        s.actors[s.active].inv = t.actors[t.active].inv = 0
        hp = [party.actors[party.active].hp for party in f.parties]
        f.at('RN12', 696)
        assert s.actors[s.active].hp == hp[0] and t.actors[t.active].hp < hp[1]

        t.actors[3-t.active].hp = 0
        final = f.at('RN08', 251)
        x, y = [f.progress(party, final) for party in f.parties]
        for party, p in zip(f.parties, (x, y)):
            for index in (1, 2):
                f.collect(party, p.shadows[index])
        f.place(s, 224)
        f.place(t, 736)
        f.at('RN08', 612)
        assert f.view(s)['gate']['x'] == 224 and f.view(t)['gate']['x'] == 736
        f.place(t, 224)
        f.at('RN08', 840)
        assert s.actors[s.active].hp > 0 and t.actors[t.active].hp == 0 and y.verdict
        assert f.view(s)['finalVerdict'] == 'gate' and f.view(t)['finalVerdict'] == 'down'
        f.step()
        assert b.wipe.wait == 120 and b.lamps == 4 and not a.wipe and not x.waived
        assert f.view(t)['finalVerdict'] == 'down'
        f.at('RN08', 864)
        assert f.run.finaleOpen
        strike(f.host, f.boss, 999999)
        s.actors[1].hp = s.actors[2].hp = 0
        f.step()
        assert f.run.status == 'clear' and a.lamps == 5 and b.wipe is None

    paid = [client.frame(checkpoint=True) for client in players[:2]]
    rewards = [p['endgameRun']['matchReward'] for p in paid]
    assert [r['set'] for r in rewards] == ['黄金の劇団', '剣闘士のフィナーレ']
    assert all(r['first'] and r['mora'] == 54300 for r in rewards)
    assert paid[1]['story']['quests'][QUEST]['count'] == 1 and QUEST not in paid[0]['story']['quests']
    restored = [c.frame(restore=p['checkpoint']) for c, p in zip(players, paid)]
    assert all(p['endgame']['stygian'][KEY]['clears'] == 1 for p in restored)
    return dict(hp=5460, lifeLossPerPair=18, ownEchoesAndAid=True, independentTrials=['RN03','RN06','RN08','RN12'],
                gatePositions=[224,736], clearBeforeWipe=True, rewards=rewards, savedClears=1)


def returns(url):
    players = room(url)
    host, _, code = players
    with LOCK:
        f = Fight(players)
        s, t = f.parties
        a, b = s.endgameRun, t.endgameRun
        f.until(lambda: f.run.phase == 'ready')
        strike(f.host, f.boss, 999999)
        f.at('RN05', 127)
        both = f.run.cast
        for actor in s.actors.values():
            actor.hp, actor.cd.skill1 = 0, 12
        f.step()
        assert a.wipe.wait == 120 and a.lamps == 4 and b.lamps == 5
        assert both.t == 128 and f.progress(s, both).waived and not f.progress(t, both).waived
        for actor in t.actors.values():
            actor.hp = 0
        f.step()
        assert both.t == 128 and b.wipe.wait == 120 and b.lamps == 4
        hp, age, elapsed = f.boss.hp, f.run.age, f.run.elapsed

    host.release()
    resumed = host.frame(resume=True)
    assert resumed['coop']['code'] == code and resumed['endgameRun']['lamps'] == 4
    assert resumed['endgameRun']['phase'] == 'returning'
    with LOCK:
        assert f.boss.hp == hp and f.run.age == age and f.run.elapsed == elapsed
        f.until(lambda: a.wipe.wait == 1)
        assert f.run.age == age and f.run.elapsed == elapsed
        f.step()
        assert a.wipe is None and a.life == 100 and a.protected == 120 and a.lamps == 4
        assert all(x.hp == x.maxhp and 9.9 < x.cd.skill1 < 10.1 for x in s.actors.values())
        assert f.core.damageActor(s, s.actors[s.active], 40, None, False, True) == 0
        f.step(10)
        assert b.wipe is None and b.protected > 0 and f.run.age > age
        assert all(p.actors[p.active].hp > 0 for p in f.parties)
        s.actors[s.active].cd.normal = 0
        f.core.action(s, 'normal')
        assert a.protected == 0 and b.protected > 0

        for expected in range(3, -1, -1):
            for actor in s.actors.values():
                actor.hp = 0
            f.step()
            assert a.lamps == expected and a.wipe.wait == 120
            f.until(lambda: a.wipe is None, bound=250)
            assert s.actors[s.active].hp > 0 and b.lamps == 4 and f.boss.hp == hp
        for actor in s.actors.values():
            actor.hp = 0
        f.step()
        assert f.run.status == 'fighting' and f.view(s)['status'] == 'spectate'
        b.lamps = 0
        for actor in t.actors.values():
            actor.hp = 0
        f.step()
        assert f.run.status == 'failed' and a.wipe is None and b.wipe is None
        assert all(not f.view(p).get('matchReward') for p in f.parties)
    return dict(lampsPerPair=5, finalReturnAtZero=True, blockedOldVerdict=True, protectedReturn=True,
                sharedClockHeldWhileAllDown=True, clockActiveWithSurvivor=True, reconnectPreservedLamps=True,
                spectateThenFail=True)


if __name__ == '__main__':
    with lab() as url:
        proof = dict(players=2, trials=trials(url), returns=returns(url))
    fixture(HUB, 'ronova', 190)
    (ROOT / 'evidence/coop-stygian-ronova-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
