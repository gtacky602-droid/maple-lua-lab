"""Verify shared repair units and thermal shielding in the Nod-Krai arenas."""
import json

from runtime import ROOT, native, runtime
from test_coop_anemo import place, wait_cast
from test_coop_inazuma_flight import check_adoption
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack


DUCK = ('boss-24100101', 'nod-town', 'nod-field', 'knuckle-duckle-commission')
SHIP = ('boss-23090101', 'nod-town', 'nod-field', 'battleship-commission')


def frames(core, states):
    return [native(core.frame(state, 'sprite').fieldBoss) for state in states]


def check_duck(lua, core):
    room, states, step = share(core, DUCK)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    for state, offset in zip(states, (-88, -90, 155, 230)):
        place(state, boss.x+offset)
    wait_cast(step, slot, 'FDK01', 182)
    assert [hits(s, boss) for s in states] == [[18, 18], [18, 18], [], []]

    wait_cast(step, slot, 'FDK02', 110)
    flight = slot.cast
    assert boss.form == 'airborne' and boss.y < 430
    assert all(f['y'] == boss.y and f['x'] == boss.x for f in frames(core, states))
    for state, offset in zip(states, (0, 12, -132, 190)):
        place(state, flight.dest+offset)
    marks = [state.seq for state in states]
    wait_cast(step, slot, 'FDK02', 143)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[26], [26], [], []]

    wait_cast(step, slot, 'FDK03', 64)
    ward = slot.cast
    left, right = ward.summons[1], ward.summons[2]
    initial = frames(core, states)
    assert all(f['repairWard'] == {'hp': 100, 'maxhp': 100} for f in initial)
    assert all(f['summons'] == initial[0]['summons'] for f in initial)
    assert [unit['hp'] for unit in initial[0]['summons']] == [16, 16]
    assert attack(lua, core, host, left, atk=50) == 16
    step()
    assert left.resolved == 'destroyed' and boss.duckWard == 40
    assert all(f['repairWard']['hp'] == 40 and [u['id'] for u in f['summons']] == [right.id]
               for f in frames(core, states))
    assert attack(lua, core, guest, right, atk=50) == 16
    step()
    assert boss.duckWard == 0 and boss.form == 'down' and ward.broken < 340
    assert all('summons' not in f and f['form'] == 'down' for f in frames(core, states))
    assert all(s.kills == s.mora == s.progression.killXp == 0 for s in states)
    assert boss.hp == boss.maxhp == 1135 and boss.coopHits is None
    finish(lua, core, DUCK, slot, states)
    check_adoption(core, DUCK, 'FDK01', 101, 18)
    return dict(participants=4, punchesAndStompHitIndividually=True, sameAirPosition=True,
                sharedRepairStates=[100, 40, 0], noRewardsForRepairUnits=True, individualRewards=True)


def check_ship(lua, core):
    room, states, step = share(core, SHIP)
    host, guest, spectator, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    for state, offset in zip(states, (-88, -90, 163, 231)):
        place(state, boss.x+offset)
    wait_cast(step, slot, 'FBT01', 129)
    assert [hits(s, boss) for s in states] == [[24], [24], [], []]

    wait_cast(step, slot, 'FBT02', 56)
    cannon = slot.cast
    place(host, cannon.centers[1])
    place(guest, cannon.centers[2])
    marks = [state.seq for state in states]
    wait_cast(step, slot, 'FBT02', 197)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[21], [21], [], []]

    flame = lua.table_from(dict(id=1, atk=20, x=boss.x, y=480, dir=1, radial=True, range=24, limit=1,
                                mult=1, color='#ffddb3', gain=0, element='pyro', critRate=0))
    core.resolveCast(host, flame)
    core.resolveCast(host, flame)
    attack(lua, core, guest, boss, element='pyro', reaction=True, key='reaction:swirl')
    assert boss.heat == 1
    for state in (guest, host, guest):
        attack(lua, core, state, boss, element='pyro')
    ward = slot.cast
    assert boss.form == 'shield' and ward.move.id == 'FBT03' and boss.iceWard == 5
    member = spectator.coopMember
    core.detachCoop(member)
    core.attachCoop(room, spectator, member)
    assert all(f['thermal'] == {'heat': 4, 'maxHeat': 4, 'ward': 5, 'maxWard': 5} for f in frames(core, states))
    attack(lua, core, host, boss)
    attack(lua, core, guest, boss, element='pyro')
    assert all(f['thermal']['ward'] == 2 for f in frames(core, states))
    wait_cast(step, slot, 'FBT03', 250)
    attack(lua, core, host, boss, element='pyro')
    marks = [state.seq for state in states]
    place(host, (ward.left+ward.right)/2)
    place(guest, (ward.left+ward.right)/2)
    wait_cast(step, slot, 'FBT03', 268)
    assert boss.form == 'down' and boss.iceWard == boss.heat == 0 and ward.broken == 251
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[], [], [], []]
    finish(lua, core, SHIP, slot, states)
    check_adoption(core, SHIP, 'FBT01', 114, 24)
    return dict(participants=4, sawAndCannonsHitIndividually=True, distinctPartiesShareHeat=True,
                repeatAndSwirlDoNotHeat=True, rejoinPreservesShield=True,
                sharedShieldStates=[5, 2, 0], breakCancelsDischarge=True, individualRewards=True)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'duckle': {'lua': check_duck(lua, core)}, 'battleship': {'lua': check_ship(lua, core)}}
    with lab() as url:
        result['duckle']['http'] = check_http(url, DUCK, 'FDK03', 64, 'summons', 100, gate=1110)
        result['battleship']['http'] = check_http(url, SHIP, 'FBT02', 56, 'thermal', 115, gate=945)
    (ROOT/'evidence/coop-nod-machines-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
