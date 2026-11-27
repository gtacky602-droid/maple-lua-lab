"""Run a room through Wanderer's separate marks and gates and a shared opening."""
import json

from runtime import ROOT, native
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_farka import fixture, open_arena, place, strike


HUB, ARENA, QUEST = 'sumeru-hub', 'sumeru-stygian-windcourt', 'stygian-wanderer-commission'
KEY, NORMAL = 'wanderer:normal', 'stygian_start:wanderer:normal:'


def play(url):
    host, guest = Client(url), Client(url)
    for client in (host, guest):
        open_arena(client, 66, accept=client is host, hub=HUB, arena=ARENA, quest=QUEST, entrance_x=443)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    assert host.frame([NORMAL + 'troupe'])['endgameRun']['gathering'] > 0
    assert guest.frame([NORMAL + 'gladiator'])['boss']['maxhp'] == 1550

    with LOCK:
        h, g = [SESSIONS[client.sid] for client in (host, guest)]
        s, t, core = h['state'], g['state'], h['core']
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        a, b = s.actors[1], t.actors[1]
        s.actors[2].hp = t.actors[2].hp = 0
        a.inv = b.inv = 900

        def step():
            core.stepCoop(world, 1 / 60)

        def advance(condition, bound=6500):
            for _ in range(bound):
                if condition():
                    return
                step()
            c = run.cast
            raise AssertionError((run.phase, run.stage, c and c.key, c and c.t))

        def watch(key, tick):
            advance(lambda: run.cast and run.cast.key == key and run.cast.t == tick)
            return run.cast

        def view(party):
            return native(core.frame(party, 'sprite').endgameRun)

        def collect(actor, mark):
            place(actor, mark.x)
            actor.y = mark.y
            step()

        advance(lambda: run.phase == 'ready')
        strike(g, boss, 999999)
        assert boss.hp == 1039
        dash = watch('WD02', 30)
        shared = [view(party) for party in (s, t)]
        locked = shared[0]['destination']
        assert all(v['destination'] == locked for v in shared)
        target_id = shared[0]['targetSlot']
        assert target_id in (s.coopMember.id, t.coopMember.id)
        for actor in (a, b):
            place(actor, locked)
        watch('WD02', 90)
        assert dash.stopX == locked and a.y == b.y == 480
        advance(lambda: run.stage == 2 and run.phase == 'ready')

        wind = watch('WD03', 71)
        place(a, wind.marks[1].x)
        step()
        assert view(s)['windMarks'] == 0  # The ground below the marker is insufficient.
        collect(a, wind.marks[1])
        assert view(s)['windMarks'] == 1 and view(t)['windMarks'] == 0
        collect(b, wind.marks[1])
        assert view(s)['windMarks'] == view(t)['windMarks'] == 1 and not wind.drop
        collect(a, wind.marks[2])
        assert wind.drop and not next(iter(s.endgameRun.skills.keys()), None)
        watch('WD03', wind.recover)
        landing = wind.drop.toY
        assert boss.y == landing == 372 and wind.untilTick - wind.recover == 156
        assert all(view(party)['phase'] == 'recover' for party in (s, t))
        strike(g, boss, 999999)
        assert boss.hp == 527 and s.endgameRun.mechanicContribution

        final = watch('WD06', 115)
        for mark in final.marks.values():
            collect(a, mark)
        place(a, 220)
        place(b, 740)
        watch('WD06', 438)
        gates = [view(party)['safe'] for party in (s, t)]
        assert [(g['x'], g['half']) for g in gates] == [(220, 80), (740, 56)]
        assert [view(party)['windMarks'] for party in (s, t)] == [2, 0]
        assert final.untilTick - final.recover == 240
        place(b, 220)
        a.inv = b.inv = 0
        hp = [actor.hp for actor in (a, b)]
        watch('WD06', 574)
        assert a.hp == hp[0] and b.hp < hp[1]
        assert view(s)['finalWind'] == {'width': 160, 'damage': 0}
        assert view(t)['finalWind'] == {'width': 112, 'damage': hp[1] - b.hp}
        assert sum(e.kind == 'stygian:wanderer:WD06:contact' and e.tick >= 560 for e in t.events.values()) == 1

        advance(lambda: run.cast is None)
        miss = watch('WD06', 438)
        assert [view(party)['safe']['half'] for party in (s, t)] == [56, 56]
        assert miss.untilTick - miss.recover == 150
        watch('WD06', 600)
        strike(g, boss, 999999)
        advance(lambda: run.status == 'clear')

    paid = [client.frame(checkpoint=True) for client in (host, guest)]
    rewards = [f['endgameRun']['matchReward'] for f in paid]
    assert [r['set'] for r in rewards] == ['黄金の劇団', '剣闘士のフィナーレ']
    assert all(r['first'] and r['mora'] == 8400 for r in rewards)
    assert paid[0]['checkpoint']['endgame']['stygian'][KEY]['mainSkill'] == 'support'
    assert paid[0]['story']['quests'][QUEST]['count'] == 1 and QUEST not in paid[1]['story']['quests']
    for client, f in zip((host, guest), paid):
        restored = client.frame(restore=f['checkpoint'])
        assert restored['story']['node'] == HUB and restored['endgame']['stygian'][KEY]['clears'] == 1
    return dict(players=2, hp=1550, sharedLockedDash=True, personalMarkProgress=True,
                landingY=landing, landingRecoveryTicks=156, gates=gates, finaleRecoveryTicks=[240,150],
                damageUsesPersonalGate=True, supportOnlyReward=True, rewards=rewards, savedClears=1)


if __name__ == '__main__':
    with lab() as url:
        proof = play(url)
    fixture(HUB, 'wanderer', 82, 66)
    (ROOT / 'evidence/coop-stygian-wanderer-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
