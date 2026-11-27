"""Exercise shared fog, personal collection, the interlude and settlement in real rooms."""
import json

from runtime import ROOT, native
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_farka import fixture, open_arena, place, strike


HUB, ARENA, QUEST = 'nod-town', 'nod-stygian-hunt', 'stygian-rerir-commission'
NORMAL = 'stygian_start:rerir:normal:'
KEY = 'rerir:normal'


def play(url):
    host, guest = Client(url), Client(url)
    for client in (host, guest):
        open_arena(client, 124, client is guest, hub=HUB, arena=ARENA, quest=QUEST, entrance_x=750)
        with LOCK:
            env = SESSIONS[client.sid]
            for slot in (1, 2, 3):
                assert env['core'].giveArtifact(env['state'], slot, 69, 3)
                env['core'].action(env['state'], 'artifact_equip:' + str(slot))
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    assert host.frame([NORMAL + 'troupe'])['endgameRun']['gathering'] > 0
    assert guest.frame([NORMAL + 'gladiator'])['boss']['maxhp'] == 2180

    with LOCK:
        h, g = [SESSIONS[client.sid] for client in (host, guest)]
        s, t, core = h['state'], g['state'], h['core']
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss

        def advance(condition, bound=5500):
            for _ in range(bound):
                if condition():
                    return
                core.stepCoop(world, 1 / 60)
            raise AssertionError((run.status, run.phase, run.stage, run.cast and run.cast.key, run.elapsed))

        def watch(key, tick):
            advance(lambda: run.cast and run.cast.key == key and run.cast.t == tick)
            return run.cast

        def view(party):
            return native(core.frame(party, 'sprite').endgameRun)

        def begin_fight():
            for party in (s, t):
                party.actors[2].hp = 0
                party.actors[1].inv = 400
            advance(lambda: run.phase == 'ready')
            strike(h, boss, 99999)
            assert boss.hp == 1417 and run.fogPending
            t.coopMember.online = False
            t.effects[1] = h['lua'].table(life=60)
            advance(lambda: run.phase == 'fog-entry')
            assert len(t.effects) == 0
            t.coopMember.online = True
            first = watch('RR05', 43)
            core.action(t, 'encounter_interact')
            assert run.fog.ward == 2 and not first.lamp
            assert 'まだ霧' in view(t)['hint'] and 'まだ霧' not in view(s)['hint']
            watch('RR05', 84)
            core.action(t, 'encounter_interact')
            core.action(s, 'encounter_interact')
            assert run.fog.ward == 1 and first.lamp.owner == t.coopMember.id
            assert all(view(party)['lampOwner'] == t.coopMember.id for party in (s, t))
            assert boss.invulnerable
            watch('RR05', 96)
            assert not boss.invulnerable
            advance(lambda: run.fog.attempt == 2)
            watch('RR05', 84)
            core.action(s, 'encounter_interact')
            core.action(t, 'encounter_interact')
            assert run.fog.ward == 0 and run.cast.lamp.owner == s.coopMember.id
            advance(lambda: run.phase == 'ready' and run.firstAfterFog)
            strike(h, boss, 99999)
            assert run.phase == 'interlude' and boss.hp == 0
            advance(lambda: run.age == 89)
            assert all(view(party)['status'] == 'fighting' and 'matchReward' not in view(party) for party in (s, t))
            watch('RR12', 0)
            assert run.stage == 2 and boss.hp == boss.maxhp == 2470

        def queue_paths():
            advance(lambda: run.phase == 'ready')
            while boss.hp > boss.maxhp * .22:
                before = boss.hp
                strike(h, boss, 60)
                assert 0 < boss.hp < before
            assert native(run.trials) == ['queued', 'queued']

        def collect(party, pickup):
            actor = party.actors[1]
            actor.x, actor.y, actor.vy, actor.ground = pickup.x, pickup.sole, 0, True
            core.stepCoop(world, 1 / 60)

        def burst(key, winner=None, *, verify_individual_claim=False):
            c = watch(key, 120)
            if verify_individual_claim:
                assert winner is s
                collect(s, c.pickups[1])
                assert view(s)['collected'] == 1 and view(s)['pickups'][0]['owner'] == s.coopMember.id
                assert view(t)['collected'] == 0 and 'owner' not in view(t)['pickups'][0]
                collect(t, c.pickups[1])
                collect(t, c.pickups[1])
                assert view(s)['collected'] == view(t)['collected'] == 1
                assert view(t)['pickups'][0]['owner'] == t.coopMember.id
            if winner is not None:
                for pickup in c.pickups.values():
                    collect(winner, pickup)
                other = t if winner is s else s
                assert view(winner)['collected'] == 3 and view(other)['collected'] < 3
            for party in (s, t):
                place(party.actors[1], 900)
            watch(key, 1007)
            for party in (s, t):
                party.actors[1].inv = 0
            before = [party.actors[1].hp for party in (s, t)]
            watch(key, 1008)
            for i, party in enumerate((s, t)):
                frame = view(party)
                assert bool(frame.get('protected')) == (party is winner)
                assert frame['trialResult'] == {
                    'protected': party is winner, 'damage': before[i] - party.actors[1].hp,
                }
                if party is winner:
                    assert party.actors[1].hp == before[i]
                else:
                    assert party.actors[1].hp < before[i]
                party.actors[1].inv = 400
            watch(key, 1080)
            assert not boss.invulnerable
            return c

        begin_fight()
        queue_paths()
        burst('RR09', s, verify_individual_claim=True)
        second = burst('RR13', t)
        assert second.stop is None and second.data.total_ticks == 1320
        watch('RR13', 1319)
        strike(h, boss, 99999)
        advance(lambda: run.status == 'clear')

    paid = [client.frame(checkpoint=True) for client in (host, guest)]
    rewards = [f['endgameRun']['matchReward'] for f in paid]
    assert [reward['set'] for reward in rewards] == ['黄金の劇団', '剣闘士のフィナーレ']
    assert all(reward['first'] and reward['mora'] == 22300 for reward in rewards)
    assert all(f['checkpoint']['endgame']['stygian'][KEY]['clears'] == 1 for f in paid)
    assert paid[1]['checkpoint']['endgame']['stygian'][KEY]['mainSkill'] == 'support'
    assert paid[1]['story']['quests'][QUEST]['count'] == 1 and QUEST not in paid[0]['story']['quests']

    for client in (host, guest):
        client.frame(['endgame_exit'])
        with LOCK:
            place(SESSIONS[client.sid]['state'].actors[1], 84)
        assert client.frame(['story_nearby_portal'])['story']['node'] == HUB
    for client in (host, guest):
        with LOCK:
            place(SESSIONS[client.sid]['state'].actors[1], 750)
        assert client.frame(['story_nearby_portal'])['story']['node'] == ARENA
        assert client.frame([NORMAL + 'troupe'])['boss']['hp'] == 2180
    with LOCK:
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        begin_fight()
        queue_paths()
        burst('RR09')
        second = burst('RR13')
        assert second.stop == 1176
        watch('RR13', 1175)
        advance(lambda: run.cast is None)
        strike(h, boss, 99999)
        advance(lambda: run.status == 'clear')
    saved = host.frame(checkpoint=True)
    repeat = saved['endgameRun']['matchReward']
    assert not repeat['first'] and repeat['mora'] == 12500
    restored = host.frame(restore=saved['checkpoint'])
    assert restored['story']['node'] == HUB and restored['endgame']['stygian'][KEY]['clears'] == 2
    return dict(players=2, hpByAct=[2180, 2470], lampsDeduplicated=True, interludeWithoutRewards=True,
                offlinePartyEffectsResetAtPhaseChange=True,
                independentOrbsAndProtection=True, recoveryEndWithOneSuccess=1320,
                recoveryEndWithNoSuccess=1176, supportOnlyRewarded=True, personalQuest=True,
                rewards=rewards, repeatReward=repeat, savedClears=2)


if __name__ == '__main__':
    with lab() as url:
        proof = play(url)
    fixture(HUB, 'rerir', 69, 124)
    (ROOT / 'evidence/coop-stygian-rerir-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
