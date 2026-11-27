"""Follow the M map through the active field catalog on a completed adventure."""
from argparse import ArgumentParser
from collections import deque
import json
from pathlib import Path

from runtime import ROOT, runtime
from story_scope import suspended_stage_returns
from test_earned_branch_quests import graph
from test_earned_survey_itineraries import SurveyJourney, nodes


regions = json.loads((ROOT / 'content/world-atlas.json').read_bytes())['regions']
suspended = suspended_stage_returns(graph)
active = nodes.keys() - suspended.keys()


class AtlasJourney(SurveyJourney):
    def cross(self, target, gate_x=None):
        if self.state.story.node == 'natlan-flag-ledges' and target == 'natlan-flag-cleft':
            # Stay above the gaps by climbing the same ledges used in the flag course.
            if self.actor.y > 395:
                self.approach(350, 480, target)
                self.approach(352, 390, target)
            if self.actor.y > 308:
                self.approach(1007, 390, target)
                self.approach(1009, 302, target)
        super().cross(target, gate_x)


def visited(trip):
    return {key for key, value in trip.state.story.visited.items() if value and key in active}


def next_target(origin, targets):
    queue = deque([origin])
    seen = {origin}
    while queue:
        candidate = queue.popleft()
        if candidate in targets:
            return candidate
        node = nodes[candidate]
        neighbours = [edge['to'] for edge in node['exits']]
        if node.get('voyage'):
            neighbours.append(node['voyage']['destination'])
        for point in neighbours:
            if point in active and point not in seen:
                queue.append(point)
                seen.add(point)
    return min(targets)


def battle_room(trip, hub, x, boss, room):
    trip.warp(hub)
    guide = trip.guide(room)
    assert guide['status'] == 'battle' and guide['stops'][-1]['id'] == room, guide
    trip.approach(x, 480, boss)
    desk = trip.frame().weeklyDesk
    if desk.remaining > 0:
        trip.tick(round(desk.remaining * 60) + 1)
    trip.act('hold_ally_fire')
    trip.act(f'weekly_start:{boss}:entry')
    slot, spec = trip.core.currentWeeklyBoss(trip.state)
    assert slot and spec.innerNode == room
    if spec.rift:
        trip.approach(spec.rift.x, spec.floorY, room)
        for _ in range(18000):
            if trip.state.story.node == room:
                break
            if slot.cast and slot.cast.key == 'WM13' and slot.cast.t >= spec.rift.enterTick:
                trip.act('encounter_interact')
            dx = spec.rift.x - trip.actor.x
            trip.tick(1, trip.lua.table(left=dx < -8, right=dx > 8))
    else:
        for _ in range(180):
            if trip.state.story.node == room:
                break
            trip.tick(60)
    assert trip.state.story.node == room, (room, trip.state.story.node)
    trip.act('hold_ally_fire')
    fight = trip.lua.execute((ROOT / 'tools/earned_boss_driver.lua').read_text('utf-8'))
    result = fight(trip.core, trip.state, slot, 'weekly', 60 * 240, 'mechanics')
    assert result.status == 'clear', (room, result.status, result.hpRemaining)
    trip.warp(hub)
    trip.restore()
    assert trip.state.story.visited[room]
    return dict(room=room, authority='weekly fight', resumedAt=hub, clearTicks=result.ticks)


def scripted_routes(trip):
    result = []
    for hub, x, boss, room in (
        ('fontaine-hub', 700, 'boss-29090101', 'narwhal-inner-echo'),
        ('nod-town', 210, 'boss-29130201', 'nod-false-moon-rift'),
    ):
        result.append(battle_room(trip, hub, x, boss, room))

    for hub, legs in (
        ('veluriyam-hub', ('veluriyam-rail-end', 'veluriyam-hub',
                          'veluriyam-petal-stop', 'sites-vlm-06', 'sites-vlm-05',
                          'sites-vlm-07', 'sites-vlm-08', 'sites-mirage-fair-in', 'veluriyam-petal-stop')),
        ('simulanka-hub', ('sites-sim-05', 'sites-sim-06-side-arena', 'sites-sim-07',
                          'sites-sim-08-side-arena', 'sites-star-rail-in', 'sites-sim-04')),
    ):
        trip.warp(hub)
        for target in legs:
            if trip.state.story.node != target:
                stops = trip.travel(target)
                result.append(dict(room=target, authority='M map', stops=[
                    dict(origin=leg['from'], target=leg['id'], mode=leg['mode']) for leg in stops]))
        trip.restore()
    return result


def verify_regions(trip, subset):
    evidence = {}
    for area in regions:
        code = area['id']
        if subset and code not in subset:
            continue
        targets = {p['id'] for p in area['points']} & active
        if not targets:
            continue
        previous = visited(trip)
        failures = {}
        regional_hub = next((p['id'] for p in area['points']
                             if nodes[p['id']]['hub'] and p['id'] in previous), None)
        if regional_hub:
            trip.warp(regional_hub)
        while pending := targets - visited(trip) - failures.keys():
            target = next_target(trip.state.story.node, pending)
            try:
                if target == 'mond-old-canopy':
                    trip.travel('mond-old-road')
                    trip.approach(510, 390, target)
                    trip.approach(510, 300, target)
                trip.travel(target)
            except (AssertionError, StopIteration) as error:
                detail = error.args[0] if error.args else 'missing portal'
                failures[target] = str(detail)
                trip.restore()
                if regional_hub:
                    trip.warp(regional_hub)
        trip.restore()
        current = visited(trip)
        evidence[code] = dict(name=area['name'], catalog=len(targets), visited=len(current & targets),
                              newVisits=sorted((targets & current) - previous),
                              pending={qid: failures[qid] for qid in sorted(targets-current)})
        print(code, len(current & targets), '/', len(targets), flush=True)
    return evidence


def alternate_lift(source, directory):
    trip = SurveyJourney(source.resolve(), runtime(), select_traveler=True)
    quest = 'liyue-hauling-shortcut'
    lift = 'liyue-cart-lift'
    assert trip.state.story.quests[quest].construction.plan == 'lift'
    assert not trip.state.story.visited[lift]
    trip.warp('liyue-harbor')
    approach = trip.travel(lift)
    assert approach[-1]['mode'] == 'lift'
    trip.travel('liyue-field')
    trip.warp('liyue-harbor')
    trip.restore()
    assert trip.state.story.quests[quest].construction.plan == 'lift' and trip.state.story.visited[lift]
    (directory / 'alternate-lift-save.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False, sort_keys=True) + '\n', 'utf-8')
    return dict(visited=lift, sourceSha256=trip.source, level=trip.state.progression.level,
                approach=approach, restoredAt=trip.state.story.node)


def main(source, directory, scripts_only, subset, alternate):
    trip = AtlasJourney(source.resolve(), runtime(), select_traveler=True)
    original = trip.snapshot()
    begin = visited(trip)
    directory.mkdir(parents=True, exist_ok=True)
    special = scripted_routes(trip) if scripts_only or not subset else []
    after_special = visited(trip)
    print('Scripted transitions visited', len(after_special - begin), flush=True)
    areas = {} if scripts_only else verify_regions(trip, subset)
    trip.restore()
    save = trip.snapshot()
    finish = visited(trip)
    assert begin <= finish and save['story']['quests'] == original['story']['quests']
    assert all(save['endgame'][group][key]['clears'] >= record['clears']
               for group in ('bosses', 'weekly', 'stygian')
               for key, record in original['endgame'][group].items())
    route = dict(sourceSha256=trip.source, catalog=len(active), startVisited=len(begin), endVisited=len(finish),
                 newScriptedVisits=sorted(after_special-begin), newVisits=sorted(finish-begin),
                 scripted=special, regions=areas, missing=sorted(active-finish), crossings=len(trip.crossings))
    if alternate:
        assert trip.state.story.quests['liyue-hauling-shortcut'].construction.plan == 'ground'
        trip.warp('liyue-harbor')
        unavailable = trip.guide('liyue-cart-lift')
        assert unavailable['status'] == 'blocked' and 'もう一方' in unavailable['reason']
        route['alternateLift'] = alternate_lift(alternate, directory)
        route['alternateLift']['mainRestriction'] = unavailable['reason']
        route['visitedAcrossChoices'] = len(finish | {route['alternateLift']['visited']})
    for suffix, data in [('save', save), ('route', route)]:
        (directory / f'current-atlas-{suffix}.json').write_text(
            json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n', 'utf-8')
    print('Active atlas:', len(finish), '/', len(active), flush=True)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--scripts-only', action='store_true')
    parser.add_argument('--region', action='append', choices=[region['id'] for region in regions])
    parser.add_argument('--alternate-lift-save', type=Path)
    args = parser.parse_args()
    main(args.from_save, args.output_dir, args.scripts_only, args.region, args.alternate_lift_save)
