"""Check a shared gravity field with individual player physics and rewards."""
import json
import math

from runtime import ROOT, native, runtime
from test_coop_anemo import place, wait_cast
from test_coop_inazuma_flight import check_adoption, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share


GENERATOR = ('boss-24080101', 'fontaine-hub', 'fontaine-field', 'field-generator-commission')


def check_lua(lua, core):
    room, states, step = share(core, GENERATOR)
    host, guest, observer, spectator = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1020
    place_all(states, boss.x, (-100, -97, 155, -235))
    wait_cast(step, slot, 'FFG01', 42)
    assert slot.cast.dir == -1
    place(guest, boss.x + 92)
    wait_cast(step, slot, 'FFG01', 104)
    assert [hits(s, boss) for s in states] == [[17], [], [], []]
    place(host, boss.x - 100)
    place(guest, boss.x - 97)
    wait_cast(step, slot, 'FFG01', 155)
    assert [hits(s, boss) for s in states] == [[17, 17], [17], [], []]

    wait_cast(step, slot, 'FFG02', 48)
    cast = slot.cast
    origin, direction = cast.origin, cast.dir
    place_all(states, origin, (95 * direction, -105 * direction, -120 * direction, -210 * direction))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FFG02', 113)
    assert cast.shots[1] and not cast.shots[2]
    place(host, origin - 105 * direction)
    place(guest, origin + 95 * direction)
    wait_cast(step, slot, 'FFG02', 169)
    assert cast.shots[2]
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[18], [18], [], []]

    place_all(states, boss.x, (-94, -87, 150, 215))
    wait_cast(step, slot, 'FFG03', 71)
    zone = slot.cast.field
    place(host, boss.x - 93)
    place(guest, zone.left - 25)
    place(observer, zone.right - 24)
    place(spectator, zone.right + 26)
    assert all(core.fieldGravityFactor(s, s.actors[1]) == 1 for s in states)
    step()
    assert [core.fieldGravityFactor(s, s.actors[1]) for s in states] == [.55, 1, .55, 1]
    place(host, zone.left - 25)
    place(guest, boss.x - 93)
    assert [core.fieldGravityFactor(s, s.actors[1]) for s in (host, guest)] == [1, .55]
    place(host, boss.x - 93)
    place(guest, zone.left - 25)
    for s in states:
        frame = core.frame(s, 'sprite')
        assert native(frame.fieldBoss.gravity) == native(zone)
        strip = next(d for d in frame.draws.values() if d.color == '#a9deeb' and d.y == 477)
        assert math.isclose(strip.x + frame.camera, zone.left)
        assert math.isclose(strip.x + strip.w + frame.camera, zone.right)

    wait_cast(step, slot, 'FFG03', 90)
    jumpers = (host, guest)
    actors = [s.actors[1] for s in jumpers]
    for member, s in zip(room.members.values(), jumpers):
        core.action(s, 'jump')
        member.input = lua.table_from({'jump': True})
    apex = [480, 480]
    marks = [s.seq for s in states]
    for _ in range(115):
        step()
        apex = [min(top, actor.y) for top, actor in zip(apex, actors)]
    height = [round(480 - top, 2) for top in apex]
    assert 280 < height[0] < 300 and 150 < height[1] < 165
    # The stationary observer's hurt invulnerability covers the middle pulse.
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[], [], [19, 19], []]
    assert all(group[observer.actors[1]] for group in slot.cast.seen.values())
    wait_cast(step, slot, 'FFG03', 215)
    assert core.fieldGravityFactor(host, host.actors[1]) == .55
    step()
    assert all(core.fieldGravityFactor(s, s.actors[1]) == 1 for s in states)
    assert all(core.frame(s).fieldBoss.gravity is None for s in states)
    finish(lua, core, GENERATOR, slot, states)
    check_adoption(core, GENERATOR, 'FFG01', 90, 17)
    return dict(participants=4, hp=boss.maxhp, jumpHeight=dict(inside=height[0], outside=height[1]),
                syncedFieldAndGroundCue=True, individualSweepAndQuakes=True,
                stonesHitDifferentPlayers=True, gravityClearsForEveryone=True,
                priorSoloHitSurvivesAdoption=True, rewardsOnlyForContributors=True)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'lua': check_lua(lua, core)}
    with lab() as url:
        result['http'] = check_http(url, GENERATOR, 'FFG03', 108, 'gravity', 126, gate=1165)
    (ROOT / 'evidence/coop-generator-lua-http.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result))
