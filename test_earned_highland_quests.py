"""Play the remaining authored highland quest chains from earned saves."""

import json
import sys

from runtime import ROOT
from test_earned_branch_quests import Journey, quests
from test_earned_terrain_quests import battle, finish, start, verify_reports


def dragonspine(trip=None, *, on_shelter=None):
    camp = 'dragonspine-camp'
    shelf, notch, lee, shelter = 'spine-observation-shelf', 'spine-wind-notch', 'spine-lee-walk', 'spine-shelter'
    first, second, third = 'spine-noon-pattern', 'spine-wind-route', 'spine-ridge-record'
    trip = start(first, 'mond-town', trip=trip)
    trip.travel(shelf)
    battle(trip, first, 1)
    for index in (2, 3, 4):
        trip.mark(first, index)
    trip.restore()
    assert trip.state.story.node == camp and trip.state.story.quests[first].count == 4
    finish(trip, first)

    trip.act('story_accept:' + second)
    trip.travel(notch)
    trip.mark(second, 1)
    route = trip.travel(shelter)
    assert route[0]['mode'] == 'lift' and '風が弱い間に通る' in route[0]['hint']
    trip.mark(second, 2)
    if on_shelter:
        on_shelter(trip.snapshot())
    finish(trip, second)

    trip.travel(notch)
    trip.travel(lee)
    trip.travel(shelter)
    trip.act('story_accept:' + third)
    trip.travel('spine-trace-ridge')
    battle(trip, third, 1)
    trip.mark(third, 2)
    trip.travel(shelter)
    trip.mark(third, 3)
    finish(trip, third)
    return verify_reports(trip, first, second, third)


def chenyu(trip=None):
    camp, terrace, road = 'chenyu-camp', 'chenyu-tea-terraces', 'chenyu-cart-road'
    lift, pavilion = 'chenyu-tea-lift', 'chenyu-tea-pavilion'
    first, second, third = 'chenyu-tea-delivery', 'chenyu-loading-landing', 'chenyu-tea-with-friends'
    trip = start(first, 'liyue-harbor', trip=trip)
    trip.confirm_lock(lift, '報告')
    trip.travel(terrace)
    for index in (1, 2, 3):
        trip.mark(first, index)
    assert '展望亭への登り道' in trip.travel(pavilion)[0]['hint']
    trip.mark(first, 4)
    trip.travel(road)
    trip.mark(first, 5)
    finish(trip, first)

    trip.act('story_accept:' + second)
    trip.travel(lift)
    trip.mark(second, 1)
    trip.cross(lift)
    assert trip.actor.y == 312
    trip.mark(second, 2)
    trip.restore()
    assert trip.state.story.node == camp and trip.state.story.quests[second].count == 2
    trip.travel(lift)
    trip.mark(second, 3)
    assert [p.y for p in trip.state.platforms.values() if p.track == 'tea-landing'] == [385]
    assert trip.travel(pavilion)[0]['mode'] == 'lift' and trip.actor.y == 390
    trip.mark(second, 4)
    finish(trip, second)

    trip.travel(pavilion)
    trip.act('story_accept:' + third)
    trip.travel('chenyu-boulder-gully')
    battle(trip, third, 1)
    trip.travel(pavilion)
    trip.mark(third, 2)
    trip.mark(third, 3)
    finish(trip, third)
    return verify_reports(trip, first, second, third)


def ochkanatlan(trip=None):
    port, ferry, dock, nod_port = 'natlan-port', 'natlan-voyage', 'ochkanatlan-dock', 'nod-port'
    steps, court, kiln = 'ochka-tide-stairs', 'ochka-patched-court', 'ochka-sifting-kiln'
    first, second, third = 'ochka-stopover-survey', 'ochka-wall-marks', 'ochka-sifter-clear'
    standalone = trip is None

    def survey(trip, level):
        assert trip.state.progression.level == level
        trip.warp('natlan-hub')
        trip.travel(port)
        trip.travel(ferry)
        assert trip.state.voyage and trip.state.voyage.arrives - trip.state.t == 90
        approach = trip.travel(dock)
        assert '30〜50秒の間に途中下船' in approach[0]['hint']
        trip.act('story_accept:' + first)
        trip.travel(steps)
        for index in (1, 2, 3):
            trip.mark(first, index)
        finish(trip, first)
        return trip

    low_proof = None
    if standalone:
        low = survey(Journey('lv180-save.json'), 180)
        assert low.state.progression.level < 182
        gate = low.guide(court)
        assert gate['status'] == 'blocked' and gate['requiredLevel'] == 182
        low_proof = verify_reports(low, first) | {'requiredLevelForCourt': gate['requiredLevel']}
        trip = Journey('lv200-save.json')
    trip = survey(trip, 200)

    trip.act('story_accept:' + second)
    trip.travel(court)
    trip.mark(second, 1)
    battle(trip, second, 2)
    if standalone:
        (ROOT / 'work/earned-ochka-carrier-checkpoint.json').write_text(
            json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    trip.restore()
    assert trip.state.story.node == dock and trip.state.story.quests[second].count == 2
    trip.travel(court)
    assert not any(e.spawnId == 'ochka-court-blocking-carrier' for e in trip.state.enemies.values())
    assert len(trip.state.enemies) == 4
    trip.mark(second, 3)
    finish(trip, second)

    trip.act('story_accept:' + third)
    trip.travel(court)
    assert len(trip.state.enemies) == 4
    assert not any(e.spawnId == 'ochka-court-blocking-carrier' for e in trip.state.enemies.values())
    trip.travel(kiln)
    battle(trip, third, 1)
    trip.mark(third, 2)
    finish(trip, third)
    proof = verify_reports(trip, first, second, third)
    reboard = trip.travel(ferry)[0]
    assert '乗り直してから40秒で' in reboard['hint'] and 'に到着' in reboard['hint']
    remaining = trip.state.voyage.arrives - trip.state.t
    assert abs(remaining - 40) < 1e-7
    trip.tick(round(remaining * 60) + 1)
    assert trip.state.story.node == nod_port
    return proof | {
        'surveyAtLv180': low_proof,
        'resumedFerryArrivedAt': nod_port,
        'remainingVoyageSeconds': 40,
        'blockingCarrierAbsentAfterRestoreAndReport': True,
        'ordinaryEnemiesInCourt': 4,
    }


def moonlit(trip=None):
    town, camp = 'nod-town', 'nod-special-camp'
    water, garden, rim = 'nod-reflector-shore', 'nod-reflection-garden', 'nod-quiet-rim'
    first, second, third = 'nod-light-path', 'nod-light-record', 'nod-rim-return'
    trip = start(first, town, 'lv200-save.json', trip=trip)
    trip.travel(water)
    for index, turns in enumerate((2, 3, 1), start=1):
        mark = quests[first]['itinerary'][index - 1]
        trip.approach(mark['x'], mark['y'], first)
        for _ in range(turns):
            trip.act('story_collect')
        assert trip.state.story.quests[first].count == index
    trip.restore()
    assert trip.state.story.node == camp and trip.state.story.quests[first].count == 3
    trip.travel(water)
    assert any((p.x, p.y, p.w) == (1370, 390, 290) for p in trip.state.platforms.values())
    trip.travel(garden)
    trip.mark(first, 4)
    finish(trip, first)

    trip.act('story_accept:' + second)
    trip.travel(garden)
    trip.approach(568, 480, second)
    for index, turns in enumerate((3, 1, 2), start=1):
        for _ in range(turns):
            trip.act('story_collect')
        trip.act('story_reflection_light')
        trip.act('story_reflection_confirm')
        assert trip.state.story.quests[second].count == index - 1
        trip.act('story_reflection_light')
        trip.act('story_reflection_confirm')
        assert trip.state.story.quests[second].count == index
    trip.mark(second, 4)
    trip.confirm_lock(rim, '報告')
    finish(trip, second)

    trip.travel(town)
    trip.act('story_accept:' + third)
    trip.travel(rim)
    battle(trip, third, 1)
    trip.mark(third, 2)
    assert not trip.core.canEquipWeapon(trip.state, 'traveler', 'SW08')
    assert len(finish(trip, third)) == 1
    proof = verify_reports(trip, first, second, third)
    assert trip.core.canEquipWeapon(trip.state, 'traveler', 'SW08')
    return proof | {'fixedWeaponReward': 'SW08'}


if __name__ == '__main__':
    routes = {run.__name__: run for run in (dragonspine, chenyu, ochkanatlan, moonlit)}
    selected = sys.argv[1:] or list(routes)
    proof = {}
    for name in selected:
        proof[name] = routes[name]()
        print(name, len(proof[name]['reports']), 'quests reported', flush=True)
    if selected == list(routes):
        (ROOT / 'evidence/earned-highland-quests-lua.json').write_text(
            json.dumps(proof, ensure_ascii=False, indent=2, sort_keys=True)+'\n', encoding='utf8')
