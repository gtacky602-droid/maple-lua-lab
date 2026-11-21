"""Exercise the Spiritspeaker's shared reflections through Lua and HTTP."""
import json

from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, party, share


CASE = ('boss-25520101', 'natlan-hub', 'natlan-field', 'spiritspeaker-commission')
ART = 'spiritspeaker-field-poses-source-v1.png'


def swing(lua, party, unit, **options):
    return lua.table_from(dict(id=1, atk=24, x=unit.x, y=480, dir=1, radial=True, range=24,
                               limit=1, mult=1, color='#60dbed', gain=0, element='physical',
                               startedAt=party.t, critRate=0, targetId=unit.id) | options)


def layout(core, state, count):
    frame = core.frame(state, 'sprite')
    assert frame.fieldBoss.underground
    units = native(frame.fieldBoss.summons)
    assert len(units) == count
    sprites = [d for d in frame.draws.values() if d.source == ART]
    assert len(sprites) == count
    assert all(abs(sprite.x + frame.camera - unit['x']) < .001
               for sprite, unit in zip(sprites, units))
    return units


def check_reflections(lua, core):
    room, states, step = share(core, CASE)
    host, guest, observer, spectator = states
    room.time, host.t, guest.t, observer.t, spectator.t = 200, 200, 2, 920, 40
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.hp == boss.maxhp == 1060
    for state in states[:2]:
        place(state, boss.x - 93)
    for state in states[2:]:
        place(state, boss.x + 230)
    wait_cast(step, slot, 'FSP01', 115)
    assert [hits(s, boss) for s in states] == [[19], [19], [], []]
    wait_cast(step, slot, 'FSP02', 54)
    for state in states[:2]:
        place(state, slot.cast.centers[1])
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FSP02', 125)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[21], [21], [], []]

    wait_cast(step, slot, 'FSP03', 64)
    cast = slot.cast
    assert len(room.enemies) == 5
    initial = layout(core, host, 4)
    assert all(layout(core, s, 4) == initial for s in states)
    unit = cast.summons[1]
    for state in states:
        core.resolveCast(state, swing(lua, state, unit, startedAt=state.t-2*TICK))
        core.resolveCast(state, swing(lua, state, unit, reaction=True))
        core.resolveCast(state, swing(lua, state, boss))
    assert boss.hp == 1060 and unit.hp == 3

    direct = swing(lua, guest, unit)
    core.resolveCast(guest, direct)
    core.resolveCast(guest, direct)
    assert unit.hp == 2
    core.resolveCast(observer, swing(lua, observer, unit, element='pyro'))
    step()
    remaining = layout(core, host, 3)
    assert remaining == initial[1:] and all(layout(core, s, 3) == remaining for s in states)
    assert len(room.enemies) == 4 and boss.hp == 1060 and boss.coopHits is None

    # A rejoining participant sees the same live reflection objects and layer counts.
    member = spectator.coopMember
    core.detachCoop(member)
    core.attachCoop(room, spectator, member)
    assert layout(core, spectator, 3) == remaining
    for i in (2, 3, 4):
        unit = cast.summons[i]
        core.resolveCast(host, swing(lua, host, unit, element='pyro'))
        core.resolveCast(guest, swing(lua, guest, unit))
    assert all((s.kills, s.mora, s.progression.killXp) == (0, 0, 0) for s in states)
    step()
    assert boss.form == 'down' and not boss.underground and cast.summons is None
    assert len(room.enemies) == 1
    assert all(core.frame(s).fieldBoss.form == 'down' for s in states)
    finish(lua, core, CASE, slot, states)
    return dict(participants=4, sharedHp=1060, sharedLanes=True, sharedLayers=True,
                rejectsPrewindowAndReaction=True, dedupesCastAcrossHits=True,
                preservesLayerStateOnRejoin=True, individualRewards=True)


def check_adopted_reflection(core):
    host, guest = party(core, CASE), party(core, CASE)
    slot = host.fieldSlots[CASE[0]]
    step = lambda: core.step(host, TICK)
    wait_cast(step, slot, 'FSP03', 64)
    wait_cast(step, slot, 'FSP03', 180)
    cast = slot.cast
    shot = cast.shots[1]
    x = (shot.left + shot.right) / 2
    place(host, x)
    wait_cast(step, slot, 'FSP03', 240)
    assert hits(host, cast.summons[1]) == [22]
    room = core.newCoop(host)
    for state in (host, guest):
        core.attachCoop(room, state)
        place(state, x)
    mark = host.seq
    core.stepCoop(room, TICK)
    assert hits(host, cast.summons[1], mark) == []
    assert hits(guest, cast.summons[1]) == [22]
    assert layout(core, host, 4) == layout(core, guest, 4)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'lua': check_reflections(lua, core)}
    check_adoption(core, CASE, 'FSP01', 104, 19)
    check_adopted_reflection(core)
    result['lua']['adoptionPreservesBodyAndReflectionHits'] = True
    with lab() as url:
        result['http'] = check_http(url, CASE, 'FSP03', 64, 'summons', 661, gate=850)
    (ROOT/'evidence/coop-spiritspeaker-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
