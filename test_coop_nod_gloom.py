"""Exercise shared waves and the Nightmare's shield and fishers."""
import json

from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, party, share
from test_coop_sumeru_field import attack


HERRA = ('boss-20081001', 'nod-town', 'nod-field', 'frostnight-herra-commission')
NIGHTMARE = ('boss-22150101', 'nod-town', 'nod-field', 'whisperer-nightmares-commission')


def view(core, state):
    return native(core.frame(state, 'sprite').fieldBoss)


def initial_positions(states, boss):
    for state, offset in zip(states, (-93, -96, 162, 235)):
        place(state, boss.x+offset)


def check_herra(lua, core):
    room, states, step = share(core, HERRA)
    host, guest, late, observer = states
    room.time, host.t, guest.t, late.t, observer.t = 200, 200, 2, 950, 40
    slot = room.fieldSlot
    boss = slot.enemy
    initial_positions(states, boss)
    wait_cast(step, slot, 'FHR01', 185)
    assert [hits(s, boss) for s in states] == [[19, 19], [19, 19], [], []]
    wait_cast(step, slot, 'FHR02', 114)
    assert boss.form == 'airborne' and abs(boss.y-(480-1.48*88))<.001
    dest = slot.cast.center
    for state, offset in zip(states, (0, 12, -140, 155)):
        place(state, dest+offset)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FHR02', 144)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[27], [27], [], []]
    assert boss.x == dest and boss.y == 480

    initial_positions(states, boss)
    wait_cast(step, slot, 'FHR03', 59)
    white = attack(lua, core, host, boss, atk=100)
    step()
    cast = slot.cast
    assert boss.form == 'shadow' and cast.center is not None
    assert attack(lua, core, host, boss, atk=100) == white > 0
    for _ in range(3):
        attack(lua, core, guest, boss, element='cryo')
    assert cast.broken is None and boss.gloomCharges == 0
    first_lane = view(core, host)['lockedWave']
    assert all(view(core, s)['lockedWave'] == first_lane for s in states)
    left, right = cast.left, cast.right
    for state, x in zip(states, (cast.center, cast.center+12, left-36, right+40)):
        place(state, x)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FHR03', 197)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[24], [24], [], []]

    member = late.coopMember
    core.detachCoop(member)
    core.attachCoop(room, late, member)
    assert view(core, late)['lockedWave'] == first_lane
    for state, x in zip(states, (left-36, cast.center, cast.center+12, right+40)):
        place(state, x)
    wait_cast(step, slot, 'FHR03', 285)
    wave_hits = [hits(s, boss, mark) for s, mark in zip(states, marks)]
    assert wave_hits == [[24], [24, 24], [24], []]
    wait_cast(step, slot, 'FHR03', 324)
    for state in states:
        frame = view(core,state)
        assert frame['recoveryTicks'] == 144 and frame['lockedWave'] == first_lane
        assert 'gloom' not in frame and frame['hp'] == boss.hp
    assert boss.adaptedElement is None and boss.maxhp == 1200
    finish(lua, core, HERRA, slot, states)
    check_adoption(core, HERRA, 'FHR01', 108, 19)
    return dict(participants=4, airTicks=36, damageByParticipant=wave_hits, sharedRecoveryTicks=144,
                sharedLaneOnRejoin=True, noDispel=True, individualRewards=True)


def check_nightmare(lua, core):
    room, states, step = share(core, NIGHTMARE)
    host, guest, late, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    initial_positions(states, boss)
    wait_cast(step, slot, 'FWN01', 125)
    assert [hits(s, boss) for s in states] == [[24], [24], [], []]
    wait_cast(step, slot, 'FWN02', 110)
    assert all(view(core, s)['underground'] for s in states)
    assert attack(lua, core, host, boss) == 0
    for state, offset in zip(states, (0, 12, -155, 160)):
        place(state, slot.cast.destination+offset)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FWN02', 151)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[28], [28], [], []]

    wait_cast(step, slot, 'FWN03', 64)
    cast = slot.cast
    layout = view(core, host)['summons']
    assert [unit['hp'] for unit in layout] == [60]*4
    assert all(view(core, s)['summons'] == layout for s in states)
    place(host, cast.summons[1].x)
    place(guest, cast.summons[1].x+8)
    place(late, boss.x)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FWN03', 243)
    assert [hits(s, cast.summons[1], mark) for s, mark in zip(states, marks)] == [[9], [9], [], []]
    for state in states:
        assert view(core, state)['darkShield'] == dict(hp=400, maxhp=400)
    assert attack(lua, core, host, boss, atk=24) == 0 and boss.damageShield == 400
    attack(lua, core, host, boss, element='pyro', atk=24)
    attack(lua, core, guest, boss, element='lunar', atk=24)
    assert boss.damageShield == 312 and boss.hp == 1340
    for state, index in ((host, 1), (guest, 2), (late, 3)):
        assert attack(lua, core, state, cast.summons[index], atk=100) == 60
        step()
    member = late.coopMember
    core.detachCoop(member)
    core.attachCoop(room, late, member)
    for state in states:
        f = view(core, state)
        assert f['darkShield']['hp'] == 12 and f['summons'] == layout[3:]
    attack(lua, core, guest, boss, element='pyro', atk=24)
    assert boss.form == 'down' and boss.damageShield == 0 and boss.hp == boss.maxhp == 1340
    assert len(room.enemies) == 1 and cast.summons is None
    assert all(s.kills == s.mora == s.progression.killXp == 0 for s in states)
    finish(lua, core, NIGHTMARE, slot, states)
    return dict(participants=4, separateAreaHits=True, sharedSummons=True, individualFisherHits=True,
                lunarDamageToShield=True, shieldStates=[400, 312, 12, 0], lateJoinPreservesShield=True,
                shieldBreakDespawnsLivingFisher=True, individualRewards=True)


def check_fisher_adoption(core):
    host, guest = party(core, NIGHTMARE), party(core, NIGHTMARE)
    slot = host.fieldSlots[NIGHTMARE[0]]
    step = lambda: core.step(host, TICK)
    wait_cast(step, slot, 'FWN03', 64)
    fisher = slot.cast.summons[1]
    place(host, fisher.x)
    wait_cast(step, slot, 'FWN03', 232)
    assert hits(host, fisher) == [9]
    room = core.newCoop(host)
    for state in (host, guest):
        core.attachCoop(room, state)
        place(state, fisher.x)
    mark = host.seq
    core.stepCoop(room, TICK)
    assert hits(host, fisher, mark) == [] and hits(guest, fisher) == [9]


if __name__ == '__main__':
    lua, core = runtime()
    result = {'herra': {'lua': check_herra(lua, core)}, 'nightmare': {'lua': check_nightmare(lua, core)}}
    check_fisher_adoption(core)
    result['nightmare']['lua']['soloFisherHitPreservedOnJoin'] = True
    with lab() as url:
        result['herra']['http'] = check_http(url, HERRA, 'FHR03', 60, 'lockedWave', 328, gate=510)
        result['nightmare']['http'] = check_http(url, NIGHTMARE, 'FWN03', 64, 'summons', 881, gate=330)
    (ROOT/'evidence/coop-nod-gloom-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
