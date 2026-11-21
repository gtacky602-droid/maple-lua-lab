"""Verify the shared drink, courage and anchor windows."""
import json

from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share


CASE = ('boss-25134601', 'novokichev-camp', 'novokichev-depth', 'wavebinder-commission')


def cast(lua, state, boss, **changes):
    return lua.table_from(dict(id=1, atk=1, x=boss.x, y=480, radial=True, range=24,
                               limit=1, mult=1, color='#52e3c1', gain=0, element='physical',
                               startedAt=state.t, critRate=0, targetId=boss.id) | changes)


def strike(lua, core, state, boss, **changes):
    core.resolveCast(state, cast(lua, state, boss, **changes))


def measure(states, boss):
    marks = [s.seq for s in states]
    return lambda: [hits(s, boss, mark) for s, mark in zip(states, marks)]


def check_anchor(step, slot, states, damage):
    boss = slot.enemy
    place_all(states, boss.x, (-190, -219, 240, 265))
    wait_cast(step, slot, 'WB02', 54)
    anchor = slot.cast
    center = anchor.center
    assert center < anchor.origin - 150
    place_all(states, center, (-5, 6, 340, 460))
    hit = measure(states, boss)
    wait_cast(step, slot, 'WB02', 139)
    assert hit() == [[damage], [damage], [], []]
    place_all(states, (anchor.origin + center) / 2, (-5, 6, 240, 340))
    hit = measure(states, boss)
    wait_cast(step, slot, 'WB02', 210)
    assert hit() == [[damage], [damage], [], []] and anchor.center == center


def view(core, state):
    return core.frame(state).fieldBoss.wavebinder


def check_drink(lua, core):
    room, states, step = share(core, CASE)
    host, guest, observer, _ = states
    room.time, host.t, guest.t, observer.t = 250, 250, 2, 900
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    assert boss.hp == boss.maxhp == 1160
    place_all(states, boss.x, (-89, -94, 163, 228))
    wait_cast(step, slot, 'WB01', 185)
    assert [hits(s, boss) for s in states] == [[21, 21], [21, 21], [], []]
    check_anchor(step, slot, states, 23)
    wait_cast(step, slot, 'WB03', 60)
    old = cast(lua, guest, boss, element='electro', startedAt=guest.t-TICK)
    wait_cast(step, slot, 'WB03', 100)
    core.resolveCast(guest, old)
    strike(lua, core, observer, boss, element='electro', startedAt=observer.t-1)
    strike(lua, core, host, boss, element='electro', reaction=True)
    assert boss.courage == 4 and slot.cast.hits == 0
    pulse = cast(lua, guest, boss, element='electro')
    core.resolveCast(guest, pulse)
    core.resolveCast(guest, pulse)
    strike(lua, core, host, boss)
    assert all((v.drinkOpen, v.courage, v.drinkHits) == (True, 1, 3)
               for v in (view(core, s) for s in states))
    strike(lua, core, guest, boss)
    step()
    assert slot.cast is None and boss.form == 'down'
    assert all((v.drinkOpen, v.courage, v.drinkInterrupts, v.downReason) == (False, 1, 1, 'drink')
               for v in (view(core, s) for s in states))
    place(observer, boss.x + 460)
    finish(lua, core, CASE, slot, states)


def check_valiant(lua, core):
    room, states, step = share(core, CASE)
    host, guest, observer, _ = states
    room.time, host.t, guest.t, observer.t = 450, 450, 8, 1200
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    # Stand on the safe side until the first drink completes.
    place_all(states, boss.x, (-233, 161, 270, 305))
    wait_cast(step, slot, 'WB03', 60)
    wait_cast(step, slot, 'WB03', 219)
    old = cast(lua, guest, boss, element='electro')
    step()
    core.resolveCast(guest, old)
    assert all((v.valiant, v.courage, v.drinkOpen) == (True, 12, False)
               for v in (view(core, s) for s in states))

    place_all(states, boss.x, (-90, -95, 155, 223))
    for state in states[:2]:
        state.actors[1].hp = state.actors[1].maxhp
    hit = measure(states, boss)
    wait_cast(step, slot, 'WB01', 255)
    assert hit() == [[26, 26, 26], [26, 26, 26], [], []]
    for state in states[:2]:
        state.actors[1].hp = state.actors[1].maxhp
    check_anchor(step, slot, states, 29)
    courage = boss.courage
    assert 0 < courage <= 3
    strike(lua, core, guest, boss, element='electro')
    step()
    assert slot.cast is None and boss.form == 'down'
    assert all(not v.valiant and v.courage == 0 and v.downReason == 'valiant'
               for v in (view(core, s) for s in states))
    finish(lua, core, CASE, slot, states)


if __name__ == '__main__':
    lua, core = runtime()
    check_drink(lua, core)
    check_valiant(lua, core)
    check_adoption(core, CASE, 'WB01', 104, 21)
    result = {'lua': dict(participants=4, independentSweepsAndAnchor=True, distinctPartyClocks=True,
                          oldCastReactionAndMultihitRejected=True, sharedCourageAndDrinkInterrupt=True,
                          strongerValiantSweepsAndAnchor=True, freshElectroEndsValiant=True,
                          liveHitPreservedOnJoin=True, individualRewards=True)}
    del lua, core
    with lab() as url:
        result['http'] = check_http(url, CASE, 'WB03', 100, 'wavebinder', 160, gate=1030)
    (ROOT/'evidence/coop-wavebinder-lua-http.json').write_text(json.dumps(result, indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
