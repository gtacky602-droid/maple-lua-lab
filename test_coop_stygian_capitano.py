"""Verify locked targets, shared ice attacks, timers, and settlement in real rooms."""
import json

from runtime import ROOT, native
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_farka import fixture, open_arena, place, strike


HUB, ARENA, QUEST = 'snezhnaya-hub', 'sne-stygian-frost-court', 'stygian-capitano-commission'
NORMAL = 'stygian_start:capitano:normal:'


def play(url):
    host, guest, reserve = (Client(url) for _ in range(3))
    for client in (host, guest, reserve):
        open_arena(client, 200 if client is reserve else 144, client is host,
                   hub=HUB, arena=ARENA, quest=QUEST, entrance_x=650)
    code = host.frame(['coop_create'])['coop']['code']
    for client in (guest, reserve):
        assert client.frame(['coop_join:' + code])['coop']['code'] == code
    assert 'endgameRun' not in guest.frame(['stygian_start:capitano:hard:gladiator'])
    assert host.frame([NORMAL + 'troupe'])['endgameRun']['gathering'] > 0
    assert guest.frame([NORMAL + 'gladiator'])['boss']['maxhp'] == 2430

    with LOCK:
        h, g = [SESSIONS[client.sid] for client in (host, guest)]
        s, t, core = h['state'], g['state'], h['core']
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss

        def until(condition, move=None, bound=2200):
            for _ in range(bound):
                if condition():
                    return
                if move:
                    move()
                core.stepCoop(world, 1 / 60)
            raise AssertionError((run.phase, run.stage, run.cast and run.cast.key, run.elapsed))

        def watch(key, tick, move=None):
            until(lambda: run.cast and run.cast.key == key and run.cast.t == tick, move)
            return run.cast

        def contact(party, key, serial):
            return [event for event in party.events.values() if event.kind == f'stygian:capitano:{key}:contact'
                    and event.cast == serial and event.actor == 1]

        for party in (s, t):
            party.actors[2].hp = 0
            party.actors[1].inv = 400

        def guest_closer():
            place(s.actors[1], max(44, boss.x - 270))
            place(t.actors[1], min(904, boss.x + 82))

        dash = watch('CP03', 0, guest_closer)
        assert dash.targetMember.id == t.coopMember.id
        place(t.actors[1], min(904, boss.x + 115))
        watch('CP03', 24)
        locked = [native(core.frame(p, 'sprite').endgameRun) for p in (s, t)]
        assert locked[0]['road'] == locked[1]['road'] and locked[0]['areas'] == locked[1]['areas']
        assert all(frame['locked'] and frame['targetSlot'] == t.coopMember.id for frame in locked)
        landing = dash.land
        place(t.actors[1], max(46, boss.x - 193))
        place(s.actors[1], max(46, boss.x - 30))
        watch('CP03', 80)
        assert dash.land == landing and not contact(s, 'CP03', dash.serial) and not contact(t, 'CP03', dash.serial)
        zone = dash.shapes[1]
        place(s.actors[1], (zone.left + zone.right) / 2)
        place(t.actors[1], min(dash.origin, landing) - 28)
        for party in (s, t):
            party.actors[1].inv = 0
        before = s.actors[1].hp, t.actors[1].hp
        watch('CP03', 87)
        assert len(contact(s, 'CP03', dash.serial)) == 1 and not contact(t, 'CP03', dash.serial)
        assert s.actors[1].hp < before[0] and t.actors[1].hp == before[1]

        strike(g, boss, 100)
        strike(h, boss, 99999)
        assert run.pendingStage == 2 and boss.hp == 1580
        for party in (s, t):
            place(party.actors[1], max(55, boss.x - 120))
        wave = watch('CP05', 18)
        for party in (s, t):
            place(party.actors[1], wave.origin + wave.dir * 108)
            party.actors[1].inv = 0
        watch('CP05', 144)
        assert all(len(contact(party, 'CP05', wave.serial)) == 1 for party in (s, t))
        assert all(contact(party, 'CP05', wave.serial)[0].group == 'projectiles' for party in (s, t))
        for party in (s, t):
            party.actors[1].inv = 400
        strike(h, boss, 99999)
        assert run.pendingStage == 3 and boss.hp == 729
        final = watch('CP09', 360)
        windows = [e.tick for e in s.events.values() if e.kind == 'stygian:capitano:CP09:window' and e.cast == final.serial]
        assert windows == [138, 210, 282, 348]
        strike(h, boss, 99999)
        until(lambda: run.status == 'clear')

    paid = [client.frame(checkpoint=True) for client in (host, guest)]
    rewards = [f['endgameRun']['matchReward'] for f in paid]
    assert [reward['set'] for reward in rewards] == ['黄金の劇団', '剣闘士のフィナーレ']
    assert all(reward['mora'] == 4200 and reward['first'] for reward in rewards)
    assert all(f['checkpoint']['endgame']['stygian']['capitano:normal']['clears'] == 1 for f in paid)
    assert paid[0]['story']['quests'][QUEST]['count'] == 1 and QUEST not in paid[1]['story']['quests']
    for client in (host, guest):
        client.frame(['endgame_exit'])
    assert host.frame([NORMAL + 'troupe'])['boss']['hp'] == 2430
    assert reserve.frame(['stygian_start:capitano:extreme:troupe'])['boss']['hp'] == 5400

    with LOCK:
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        s.actors[1].inv = 400
        watch('CP01', 0)
        strike(h, boss, 99999)
        watch('CP05', 0)
        strike(h, boss, 99999)
        watch('CP09', 360)
        strike(h, boss, 99999)
        until(lambda: run.status == 'clear')
        other = SESSIONS[reserve.sid]['state'].coop
        late = other.stygianRun
        late.launched, late.elapsed = True, late.rules.limit - 1 / 60
        core.stepCoop(other, 1 / 60)
        assert late.status == 'failed'
    again = host.frame(checkpoint=True)
    prize = again['endgameRun']['matchReward']
    assert not prize['first'] and prize['mora'] == 2750
    timed_out = reserve.frame()
    assert timed_out['endgameRun']['remaining'] == 0 and 'matchReward' not in timed_out['endgameRun']
    restored = host.frame(restore=again['checkpoint'])
    assert restored['story']['node'] == HUB and restored['endgame']['stygian']['capitano:normal']['clears'] == 2
    return dict(players=2, normalHP=2430, extremeHP=5400, targetSlot=locked[0]['targetSlot'],
                dashRoad=locked[0]['road'], landingHitOnly=True, waveHitsPerPlayer=[1, 1], finaleWindows=windows,
                rewards=rewards, repeatReward=prize, personalQuest=True, timeoutWithoutReward=True, savedClears=2)


if __name__ == '__main__':
    with lab() as url:
        proof = play(url)
    fixture(HUB, 'capitano', 170)
    (ROOT / 'evidence/coop-stygian-capitano-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
