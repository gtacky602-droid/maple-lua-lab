"""Use Icevine Tether through the story loadout and normal gate transitions."""

import json

from runtime import ROOT
from test_earned_branch_quests import Journey, lua


FIELDS = ('white-pass-woods', 'aurora-ice-cut', 'aurora-ice-shelf')
STATION = 'white-pass-station'


def cast(trip):
    trip.act('slot1')
    trip.tick(1)


def select(trip, index):
    if trip.state.selectedGrapple != index:
        trip.act('grapple_next')
    assert trip.state.selectedGrapple == index
    return trip.state.grappleNodes[index]


def landed(trip, index):
    target = trip.state.grappleNodes[index]
    start = trip.actor.x, trip.actor.y
    cast(trip)
    assert trip.actor.grapple and trip.actor.y < start[1] and trip.actor.cd.SK46 > 11
    assert (trip.actor.x, trip.actor.y) != (target.x, target.y)
    assert sum(d.color == '#c1f4dc' for d in trip.frame().draws.values()) == 16
    for tick in range(1, 46):
        if not trip.actor.grapple:
            break
        trip.tick(1)
    assert (trip.actor.x, trip.actor.y, trip.actor.ground) == (target.x, target.y, True)
    return {'target': target.name, 'start': start, 'landing': [target.x, target.y], 'ticks': tick}


trip = Journey('lv165-save.json')
assert trip.state.progression.level == 165 and trip.core.growthSkillCondition(trip.state, 'SK46') is True
trip.warp(STATION)
assert trip.core.configure(trip.state, lua.table_from([['SK46']] + [[] for _ in range(7)], recursive=True))[0]
cast(trip)
assert trip.state.macro is None and trip.actor.cd.SK46 is None and '結節点はありません' in trip.state.skillNotice
assert not trip.state.grappleNodes[1]
trip.act('grapple_next')
assert trip.state.selectedGrapple is None
checkpoint = trip.snapshot()
(ROOT / 'work/earned-story-grapple.json').write_text(json.dumps(checkpoint)+'\n', encoding='utf8')

notes = []
for field in FIELDS:
    trip.state = trip.core.restore(lua.table_from(checkpoint, recursive=True), 12)
    trip.travel(field)
    assert len(trip.state.grappleNodes) == 2
    for node in trip.state.grappleNodes.values():
        assert any(p.x + 20 <= node.x <= p.x + p.w - 20 and p.y == node.y for p in trip.state.platforms.values())
    target = select(trip, 2)
    cast(trip)
    assert trip.state.macro is None and trip.actor.cd.SK46 is None and '近づくか' in trip.state.skillNotice
    select(trip, 1)
    west = landed(trip, 1)
    trip.approach(target.x - 240, 480, '東の結節点')
    for _ in range(15):
        if trip.actor.cd.SK46 <= 0:
            break
        trip.tick(60)
    assert trip.actor.cd.SK46 == 0
    select(trip, 2)
    east = landed(trip, 2)
    trip.travel(STATION)
    assert not trip.state.grappleNodes[1] and trip.actor.grapple is None
    assert trip.state.returns == 0
    notes.append({'field': field, 'landings': [west, east], 'farTargetRejected': True, 'gateReturn': True})

(ROOT / 'evidence/earned-story-grapple-lua.json').write_text(
    json.dumps({'sourceSha256': trip.source, 'level': 165, 'emptyMapRejected': True, 'fields': notes},
               ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print('Six story tether landings, three return routes and unavailable-target feedback passed.')
