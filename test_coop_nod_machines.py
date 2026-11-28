"""Verify shared repair units and the cooling plate in the Nod-Krai arenas."""
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

    wait_cast(step, slot, 'FDK03', 76)
    ward = slot.cast
    left, right = ward.summons[1], ward.summons[2]
    initial = frames(core, states)
    assert all('repairWard' not in f and f['repairSequence'] == initial[0]['repairSequence'] for f in initial)
    assert all(f['summons'] == initial[0]['summons'] for f in initial)
    assert [unit['hp'] for unit in initial[0]['summons']] == [16, 16]
    assert (left.x-boss.x)*(right.x-boss.x)>0
    assert attack(lua, core, host, left, atk=50) == 16
    step()
    assert left.resolved == 'destroyed'
    assert all(f['repairSequence']['defeated'] == 1 and [u['id'] for u in f['summons']] == [right.id]
               for f in frames(core, states))
    wait_cast(step, slot, 'FDK03', 299)
    assert attack(lua, core, guest, right, atk=50) == 16
    step()
    assert boss.form == 'down' and ward.broken == 300
    assert all('summons' not in f and f['form'] == 'down' and f['recoveryTicks'] == 144
               and f['repairSequence']['defeated'] == 2 for f in frames(core, states))
    assert all(s.kills == s.mora == s.progression.killXp == 0 for s in states)
    assert boss.hp == boss.maxhp == 1135 and boss.coopHits is None
    finish(lua, core, DUCK, slot, states)
    check_adoption(core, DUCK, 'FDK01', 101, 18)
    return dict(participants=4, punchesAndStompHitIndividually=True, sameAirPosition=True,
                sharedDestroyedCounts=[0, 1, 2], interruptedOnTick=300,
                noRewardsForRepairUnits=True, individualRewards=True)


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

    for state in states:
        place(state, boss.x-92)
    wait_cast(step, slot, 'FBT03', 60)
    cold = slot.cast
    initial = frames(core, states)
    shared_plate = initial[0]['coolingPlate']
    assert all(f['coolingPlate'] == shared_plate and f['coolingLane'] == initial[0]['coolingLane'] for f in initial)
    assert shared_plate['layers'] == 5 and all('thermal' not in f for f in initial)

    x = cold.plate.x
    hp = boss.hp
    assert attack(lua, core, guest, boss, x=x, range=18, startedAt=guest.t) == 0
    assert cold.plateLayers == 4 and boss.hp == hp
    member = spectator.coopMember
    core.detachCoop(member)
    core.attachCoop(room, spectator, member)
    assert core.frame(spectator).fieldBoss.coolingPlate.layers == 4
    damage = attack(lua, core, host, boss, x=x, range=88, element='pyro', startedAt=host.t)
    assert damage > 0 and boss.hp == hp-damage
    assert all(f['coolingPlate']['layers'] == 2 for f in frames(core, states))

    marks = [state.seq for state in states]
    wait_cast(step, slot, 'FBT03', 299)
    assert attack(lua, core, guest, boss, x=x, range=18, element='pyro', startedAt=guest.t) == 0
    step()
    assert cold.broken == 300 and boss.form == 'down'
    assert all(f['coolingInterrupted'] and f['recoveryTicks'] == 168 and 'coolingPlate' not in f
               for f in frames(core, states))
    place(host, (cold.left+cold.right)/2)
    place(guest, (cold.left+cold.right)/2)
    wait_cast(step, slot, 'FBT03', 341)
    assert [hits(state, boss, mark) for state, mark in zip(states, marks)] == [[], [], [], []]
    finish(lua, core, SHIP, slot, states)
    check_adoption(core, SHIP, 'FBT01', 114, 24)
    return dict(participants=4, sawAndCannonsHitIndividually=True,
                sharedPlateLayers=[5, 4, 2, 0], rejoinPreservesPlate=True,
                plateHitAloneLeavesHpUnchanged=True, interruptedOnTick=300,
                interruptionCancelsDischarge=True, individualRewards=True)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'duckle': {'lua': check_duck(lua, core)}, 'battleship': {'lua': check_ship(lua, core)}}
    with lab() as url:
        result['duckle']['http'] = check_http(url, DUCK, 'FDK03', 76, 'summons', 100, gate=1110)
        result['battleship']['http'] = check_http(url, SHIP, 'FBT03', 60, 'coolingLane', 112, gate=945)
    (ROOT/'evidence/coop-nod-machines-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
