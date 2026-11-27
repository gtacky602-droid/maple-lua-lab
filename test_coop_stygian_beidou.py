"""Drive Beidou's shared guard, follow-up and settlement through the room API."""
import json

from runtime import ROOT, native
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_farka import fixture, open_arena, place, strike


HUB, DECK, QUEST = 'liyue-harbor', 'liyue-stygian-deck', 'stygian-beidou-commission'


def room(url, difficulty):
    host, guest = Client(url), Client(url)
    for client in (host, guest):
        open_arena(client, 58, accept=client is guest, hub=HUB, arena=DECK, quest=QUEST, entrance_x=300)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client, set_id in ((host, 'troupe'), (guest, 'gladiator')):
        f = client.frame([f'stygian_start:beidou:{difficulty}:{set_id}'])
        assert f['endgameRun']['gathering'] > 0
        assert f['boss']['maxhp'] == {'normal': 690, 'hard': 1250}[difficulty]
    return host, guest, code


def sequence(url, difficulty):
    host, guest, code = room(url, difficulty)
    with LOCK:
        h, g = [SESSIONS[client.sid] for client in (host, guest)]
        s, t, core = h['state'], g['state'], h['core']
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        hp = boss.hp
        a, b = s.actors[1], t.actors[1]
        s.actors[2].hp = t.actors[2].hp = 0
        t.t += 120

        def advance(condition, bound=3000):
            for _ in range(bound):
                if condition():
                    return
                core.stepCoop(world, 1 / 60)
            raise AssertionError((boss.phase, boss.tick, boss.move and boss.move.key))

        def watch(phase, key=None):
            advance(lambda: boss.phase == phase and (key is None or boss.move.key == key))
            return [native(core.frame(party, 'sprite').endgameRun) for party in (s, t)]

        def cast(party, **fields):
            actor = party.actors[party.active]
            shot = dict(id=actor.id, key='normal', x=actor.x, y=480, dir=actor.dir,
                        element='physical', range=125, limit=1, color='#fff3e2', gain=0,
                        atk=12, mult=1, critRate=0, startedAt=party.t, playerInputAt=party.t)
            core.resolveCast(party, h['lua'].table(**(shot | fields)))

        def events(party, kind):
            return [e for e in party.events.values() if e.kind == 'stygian:beidou:' + kind]

        place(a, 490)
        place(b, 620)
        watch('guard')
        place(a, boss.x - 92)
        place(b, boss.x + 62)
        a.dir, b.dir = 1, -1
        # A packet on the guest's later clock can predate their guard even when
        # it looks new compared to the host's clock.
        cast(t, playerInputAt=t.t - .5)
        cast(t, startedAt=t.t - .5)
        cast(t, reaction=True)
        cast(t, growthAI=True)
        assert boss.hp == hp and not boss.guardOwner and not events(t, 'baited')

        if difficulty == 'normal':
            views = watch('tell', 'quiet')
            assert views[0]['area'] == views[1]['area']
            assert all(v['targetSlot'] == t.coopMember.id for v in views)
            assert len(events(s, 'waited')) == 1
            move = boss.move
            place(a, (move.lo + move.hi) / 2)
            place(b, move.lo - 20)
            a.inv = b.inv = 0
            start = [actor.hp for actor in (a, b)]
            host_result, guest_result = [v['guardReply'] for v in watch('recover')]
            assert boss.span == 174
            assert a.hp < start[0] and b.hp == start[1]
            assert host_result == {'kind': 'quiet', 'damage': start[0] - a.hp}
            assert guest_result == {'kind': 'quiet', 'damage': 0}
            assert len(events(s, 'impact:quiet')) == 1 and not events(t, 'impact:quiet')
            proof = dict(quietOpeningTicks=boss.span, outOfRangeEscaped=True)
        else:
            assert core.attack(t, b, 'normal')
            assert len(events(t, 'baited')) == 1
            locked = b.x
            cast(s)
            assert not events(s, 'baited') and boss.hp == hp

    if difficulty == 'hard':
        guest.release()
        with LOCK:
            # The first attack reservation stays with the guest even if the
            # guest moves or their browser goes away before the next room tick.
            place(b, 60)
            views = watch('tell', 'baited')
            assert boss.move.mark == locked
            assert views[0]['area'] == views[1]['area'] and views[0]['targetSlot'] == t.coopMember.id
        rejoined = guest.frame(resume=True)
        assert rejoined['coop']['code'] == code and rejoined['endgameRun']['targetSlot'] == t.coopMember.id
        with LOCK:
            move = boss.move
            for actor in (a, b):
                place(actor, move.mark)
                actor.inv = 0
            start = [actor.hp for actor in (a, b)]
            watch('tell', 'wake')
            assert all(actor.hp < before for actor, before in zip((a, b), start))
            assert all(len(events(party, 'impact:baited')) == 1 for party in (s, t))
            assert boss.move.mark == locked and boss.move.targetSlot == t.coopMember.id
            watch('strike', 'wake')
            place(a, boss.move.mark)
            place(b, boss.move.mark)
            a.y, a.ground = 384, False
            start = [actor.hp for actor in (a, b)]
            a.inv = b.inv = 0
            host_result, guest_result = [v['guardReply'] for v in watch('recover')]
            assert a.hp == start[0] and b.hp < start[1]
            assert host_result['kind'] == guest_result['kind'] == 'baited'
            assert host_result['waveDamage'] == 0 and guest_result['waveDamage'] == start[1] - b.hp
            assert not events(s, 'impact:wake') and len(events(t, 'impact:wake')) == 1
            assert boss.span == 83
            proof = dict(baitedOpeningTicks=boss.span, firstInputReserved=True,
                         lockSurvivedReconnect=True, oneHitPerPairActor=True, jumpEscapedWake=True)

    with LOCK:
        strike(g, boss, 90)
        strike(h, boss, 999999)
        advance(lambda: run.status == 'clear')
    paid = [client.frame(checkpoint=True) for client in (host, guest)]
    rewards = [f['endgameRun']['matchReward'] for f in paid]
    assert [r['set'] for r in rewards] == ['黄金の劇団', '剣闘士のフィナーレ']
    assert all(r['first'] and r['mora'] == (1210 if difficulty == 'normal' else 2270) for r in rewards)
    assert paid[1]['story']['quests'][QUEST]['count'] == 1 and QUEST not in paid[0]['story']['quests']
    key = 'beidou:' + difficulty
    for client, f in zip((host, guest), paid):
        restored = client.frame(restore=f['checkpoint'])
        assert restored['story']['node'] == HUB and restored['endgame']['stygian'][key]['clears'] == 1
    return dict(**proof, hp=hp, hostGuestClockOffset=120, staleAIAttacksIgnored=True,
                openingShared=True, individualGuardDamage=True, rewards=rewards, savedClears=1)


if __name__ == '__main__':
    with lab() as url:
        proof = dict(players=2, normal=sequence(url, 'normal'), hard=sequence(url, 'hard'))
    fixture(HUB, 'beidou', 58, 58)
    (ROOT / 'evidence/coop-stygian-beidou-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
