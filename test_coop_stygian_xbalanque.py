"""Check shared fireballs, split fire lanes, and the two target locks in the solar court."""
import json

from runtime import ROOT, native
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_farka import fixture, open_arena, place, strike


HUB, ARENA, QUEST = 'natlan-hub', 'natlan-solar-court', 'stygian-xbalanque-commission'
NORMAL = 'stygian_start:xbalanque:normal:'
KEY = 'xbalanque:normal'


def play(url):
    host, guest = Client(url), Client(url)
    for client in (host, guest):
        open_arena(client, 112, client is guest, hub=HUB, arena=ARENA, quest=QUEST, entrance_x=648)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    assert host.frame([NORMAL + 'troupe'])['endgameRun']['gathering'] > 0
    assert guest.frame([NORMAL + 'gladiator'])['boss']['maxhp'] == 1780

    with LOCK:
        h, g = [SESSIONS[c.sid] for c in (host, guest)]
        s, t, core = h['state'], g['state'], h['core']
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss

        def until(condition, bound=8000):
            for _ in range(bound):
                if condition():
                    return
                core.stepCoop(world, 1 / 60)
            raise AssertionError((run.phase, run.stage, run.cast and run.cast.key, run.elapsed))

        def at(key, tick=0, variant=None):
            until(lambda: run.cast and run.cast.key == key and run.cast.t == tick and run.cast.variant == variant)
            return run.cast

        def contacts(party, label, c):
            return [e.group for e in party.events.values() if e.kind == f'stygian:xbalanque:{label}:contact'
                    and e.cast == c.serial and e.actor == 1]

        for party in (s, t):
            party.actors[2].hp = 0
            party.actors[1].inv = 400
            place(party.actors[1], boss.x - 145)
        fireballs = at('XB03', 18)
        for party in (s, t):
            place(party.actors[1], fireballs.child.origin + fireballs.child.dir * 155)
            party.actors[1].inv = 0
        before = [p.actors[1].hp for p in (s, t)]
        at('XB03', 119)
        counts = [contacts(p, 'XB03', fireballs) for p in (s, t)]
        assert counts == [[1, 2, 3], [1, 2, 3]]
        assert all(p.actors[1].hp < previous for p, previous in zip((s, t), before))
        strike(g, boss, 105)
        strike(h, boss, 99999)
        assert run.pendingStage == 2 and boss.hp == 1157
        for party in (s, t):
            party.actors[1].inv = 400
        jump = at('XB05', 18)
        landing = jump.child.landing
        jumper = jump.child.targetMember.id
        actor = s.actors[1] if jumper == s.coopMember.id else t.actors[1]
        place(actor, 890 if landing < 480 else 90)
        at('XB05', 83)
        assert boss.y < 480 and jump.child.landing == landing
        for party in (s, t):
            f = core.frame(party, 'sprite').endgameRun
            assert f.targetSlot == jumper and f.locked
        at('XB05', 84)
        assert boss.y == 480 and boss.x == landing
        strike(h, boss, 99999)
        assert run.pendingStage == 3 and boss.hp == 534

        final = at('XB08', 60)
        marked = final.child.targetMember.id
        place(s.actors[1], 480)
        place(t.actors[1], 200)
        at('XB08', 220)
        bands = [native(core.frame(p, 'sprite').endgameRun.safe) for p in (s, t)]
        assert bands[0] == bands[1] and bands[0]['left'] < 480 < bands[0]['right']
        for party in (s, t):
            party.actors[1].inv = 0
        at('XB08', 240)
        place(t.actors[1], 760)
        at('XB08', 299)
        t.actors[1].inv = 0
        at('XB08', 312)
        assert not ({2, 3} & set(contacts(s, 'XB08', final)))
        assert [step for step in contacts(t, 'XB08', final) if step in (2, 3)] == [2, 3]
        target = s if marked == s.coopMember.id else t
        place(target.actors[1], 890 if boss.x < 780 else 65)
        at('XB08', 329)
        assert not core.frame(s, 'sprite').endgameRun.locked
        at('XB08', 330)
        direction = final.child.dir
        saved_zone = final.child.areas[4].left, final.child.areas[4].right
        place(target.actors[1], 55 if direction > 0 else 900)
        at('XB08', 389)
        assert final.child.dir == direction and saved_zone == (final.child.areas[4].left, final.child.areas[4].right)
        assert all(core.frame(p, 'sprite').endgameRun.targetSlot == marked for p in (s, t))
        place(s.actors[1], sum(saved_zone) / 2)
        place(t.actors[1], 50 if direction > 0 else 910)
        s.actors[1].inv = 0
        at('XB08', 420)
        assert 4 in contacts(s, 'XB08', final) and 4 not in contacts(t, 'XB08', final)

        for party in (s, t):
            party.actors[1].inv = 400
        combo = at('XB07', 108, 'A')
        assert combo.childIndex == 2 and combo.child.key == 'XB02' and combo.child.offset == 108
        pair = [native(core.frame(p, 'sprite').endgameRun) for p in (s, t)]
        assert all(f['variant'] == 'A' and f['childTick'] == 0 for f in pair)
        assert pair[0]['targetSlot'] == pair[1]['targetSlot'] and pair[0]['areas'] == pair[1]['areas']
        strike(h, boss, 99999)
        until(lambda: run.status == 'clear')

    paid = [client.frame(checkpoint=True) for client in (host, guest)]
    results = [data['endgameRun']['matchReward'] for data in paid]
    assert [result['set'] for result in results] == ['黄金の劇団', '剣闘士のフィナーレ']
    assert all(result['first'] and result['mora'] == 2530 for result in results)
    assert all(data['checkpoint']['endgame']['stygian'][KEY]['clears'] == 1 for data in paid)
    assert QUEST not in paid[0]['story']['quests'] and paid[1]['story']['quests'][QUEST]['count'] == 1
    for client in (host, guest):
        client.frame(['endgame_exit'])
    assert host.frame([NORMAL + 'troupe'])['boss']['hp'] == 1780
    with LOCK:
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        s.actors[1].inv = 400
        at('XB01')
        strike(h, boss, 99999)
        at('XB04')
        strike(h, boss, 99999)
        at('XB08', 420)
        strike(h, boss, 99999)
        until(lambda: run.status == 'clear')
    saved = host.frame(checkpoint=True)
    repeat = saved['endgameRun']['matchReward']
    assert not repeat['first'] and repeat['mora'] == 1640
    restored = host.frame(restore=saved['checkpoint'])
    assert restored['story']['node'] == HUB and restored['endgame']['stygian'][KEY]['clears'] == 2
    return dict(players=2, normalHP=1780, fireballsPerPlayer=counts, landingLockSlot=jumper,
                sharedSafeLane=bands[0], fireBandsHitGroups=[2, 3], finalPunchOnlyHitsFront=True,
                finaleTargetSlot=marked, lockedFinalDirection=direction, comboSecondChild=combo.child.key,
                rewards=results, repeatReward=repeat, personalQuest=True, savedClears=2)


if __name__ == '__main__':
    with lab() as url:
        proof = play(url)
    fixture(HUB, 'xbalanque', 150)
    (ROOT / 'evidence/coop-stygian-xbalanque-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
