"""Check the short transfers outside the marker, hunt and voyage runtime ledgers."""

import json
from collections import Counter
from math import ceil

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
quests = {quest['id']: quest for quest in graph['quests']}
exits = {node['id']: node['exits'] for node in nodes.values()}
edges = {(origin, gate['to']): gate for origin, gates in exits.items() for gate in gates}
atlas = read('content/world-atlas.json')
regions = {point['id']: region['id'] for region in atlas['regions'] for point in region['points']}
covered = {row['stage_id'] for row in read('content/coverage.json')['map_catalog']['stage_links'].values()}
covered.update(row['stage'] for row in read('evidence/world-hunt-routes-lua.json')['stages'])
covered.update(row['stage'] for row in read('evidence/world-voyage-routes-lua.json')['voyages'])
durations = {'boatSeconds': 'boat', 'liftSeconds': 'lift', 'waterwaySeconds': 'water', 'phaseSeconds': 'phase'}
lua, core = runtime()
advance = lua.eval('function(C,s,ticks) for _=1,ticks do C.step(s,1/60,{}) end end')
approaches = {
    'sites-lookout-98500': [(250, 401), (250, 312)],
    'canopy-square-plateau': [(420, 412), (670, 343), (900, 275), (1160, 207)],
    'flower-feather-statue-back-cliff': [(420, 412), (695, 343), (1010, 274)],
}


def quest_progress(s, quest_id, count=None, plan=None):
    quest = quests[quest_id]
    if prerequisite := quest.get('requires'):
        quest_progress(s, prerequisite)
    complete = count is None
    count = quest['goal'] if complete else count
    progress = dict(status='complete' if complete else 'active', count=count, cycles=int(complete))
    for step in quest.get('itinerary', [])[:count]:
        s.story.visited[step['node']] = True
    if 'paths' in quest:
        progress['pathProgress'] = {path['id']: {'count': len(path['steps'])} for path in quest['paths']}
        for path in quest['paths']:
            for step in path['steps']:
                s.story.visited[step['node']] = True
    if plan:
        surveys = quest['construction']['surveys']
        progress['construction'] = {'plan': plan, 'surveyed': {survey['id']: True for survey in surveys}}
        for survey in surveys:
            s.story.visited[survey['node']] = True
    if quest_id == 'liyue-caravan-search':
        progress['inspected'] = {'cart-ruts': True, 'caravan': True}
    if quest_id == 'liyue-market-delivery':
        progress['delivery'] = {'guardCleared': True, 'recovered': True,
                                'delivered': {'pot': True, 'vessel': True, 'wheel': True}}
    s.story.visited[quest['hub']] = True
    s.story.quests[quest_id] = lua.table_from(progress, recursive=True)


def ready(origin, edge):
    destination = edge['to']
    s = core.new(12)
    core.action(s, 'story_start')
    level = max(nodes[origin]['level'], nodes[destination]['level'])
    if rule := edge.get('requires'):
        level = max(level, quests[rule['quest']].get('level', 1))
        quest_progress(s, rule['quest'], rule.get('count'), rule.get('construction'))
    core.grantExp(s, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    for stage in (origin, destination):
        if group := nodes[stage].get('hiddenGroup'):
            s.story.discovered[group] = True
        if rule := nodes[stage].get('revealAfter'):
            quest_progress(s, rule['quest'], rule.get('count'))
    core.enterStoryNode(s, nodes[origin]['checkpoint'])
    core.enterStoryNode(s, origin)
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def itinerary(s, destination):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[destination])
    core.action(s, 'world_map_select:' + destination)
    view = core.frame(s).worldMap
    assert view.selected.id == destination and view.guide, (s.story.node, destination)
    return native(view.guide)


def check_save(s, origin):
    saved = validate_save(native(core.checkpoint(s)))
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    checkpoint = nodes[origin]['checkpoint']
    assert restored.story.node == checkpoint and not restored.lift
    assert native(restored.story.visited) == native(s.story.visited)
    assert native(restored.story.quests) == native(s.story.quests)
    assert native(restored.story.discovered) == native(s.story.discovered)
    return checkpoint


def verify(origin, edge, time_key):
    dest = edge['to']
    walk = ready(origin, edge)
    s = walk.state
    plan = itinerary(s, dest)
    if origin != dest:
        assert plan['status'] == 'ready' and plan['stops'][0]['id'] == dest, (origin, dest, plan)
        assert f'移動に{edge[time_key]:g}秒' in plan['stops'][0]['hint'], (origin, dest, plan)
    core.action(s, 'world_map_close')
    for x, y in approaches.get(origin, []):
        walk.approach(x, y, dest)
    walk.approach(edge['x'], edge.get('y', 480), dest)
    if wind := edge.get('wind'):
        for _ in range(ceil(wind['period'] * 60)):
            if core.frame(s).storyNearbyPortal.available:
                break
            advance(core, s, 1)
    portal = core.frame(s).storyNearbyPortal
    assert portal and portal.to == dest and portal.available, (origin, dest, native(portal))
    core.action(s, 'story_nearby_portal')
    ride = s.lift
    assert ride and ride.destination == dest and s.story.node == origin, (origin, dest, s.storyNotice)
    assert ride.seconds == edge[time_key]
    assert (bool(ride.boat), bool(ride.waterway), bool(ride.phase)) == (
        time_key == 'boatSeconds', time_key == 'waterwaySeconds', time_key == 'phaseSeconds')
    start = (walk.actor.x, walk.actor.y)
    advance(core, s, 1)
    before = ride.remaining
    pos = (walk.actor.x, walk.actor.y)
    if edge.get('animatedLift'):
        assert ride.riders and pos != start and not walk.actor.ground
    during = itinerary(s, dest)
    assert during['status'] == 'arriving' and during['paused']
    advance(core, s, 10)
    assert s.lift.remaining == before and (walk.actor.x, walk.actor.y) == pos
    core.action(s, 'world_map_close')
    checkpoint = check_save(s, origin)

    ticks = ceil(ride.seconds * 60 - 1e-8)
    advance(core, s, ticks - 2)
    assert s.lift and s.story.node == origin
    advance(core, s, 1)
    assert not s.lift and s.story.node == dest and s.story.visited[dest]
    expected = (ride.x, ride.y)
    if nodes[dest].get('swim'):
        expected = (max(20, expected[0]), expected[1])
    assert (walk.actor.x, walk.actor.y) == expected, (origin, dest, expected, walk.actor.x, walk.actor.y)
    return dict(origin=origin, destination=dest, kind=durations[time_key], seconds=edge[time_key],
                usedF=True, beforeArrivalDidNotMoveStage=True, landing=list(expected),
                restoredDuringTransferAt=checkpoint, atlasShowsDestinationDuringTransfer=True,
                atlasPausesTransfer=True)


def verify_wind_gates():
    checked = []
    for (origin, destination), gate in edges.items():
        if 'wind' not in gate:
            continue
        state = ready(origin, gate).state
        phases = []
        for calm, seconds in ((False, 0.1), (True, gate['wind']['calmStart'] + 0.1)):
            state.t = state.storyEnteredAt + seconds
            portal = next(p for p in core.frame(state).storyPortals.values() if p.to == destination)
            expected = native(portal.wind)
            assert expected['calm'] == calm and expected['seconds'] > 0
            core.action(state, 'world_map_focus:' + origin)
            row = next(r for r in core.frame(state).worldMap.routes.values() if r.id == destination)
            assert native(row.wind) == expected
            core.action(state, 'world_map_focus:' + destination)
            leg = core.frame(state).worldMap.guide.stops[1]
            assert leg.id == destination and native(leg.wind) == expected
            advance(core, state, 90)
            assert native(core.frame(state).worldMap.guide.stops[1].wind) == expected
            core.action(state, 'world_map_close')
            phases.append(expected)
        checked.append(dict(origin=origin, destination=destination, phases=phases))
    return checked


def main():
    checked = [verify(origin, gate, time_key) for (origin, destination), gate in edges.items()
               if {origin, destination} - covered for time_key in durations if time_key in gate]
    counts = Counter(row['kind'] for row in checked)
    assert counts == dict(boat=12, lift=37, water=10, phase=24), counts
    result = {'scope': 'Timed gates with at least one endpoint outside the marker, hunt and voyage ledgers.',
              'setup': 'Each trial starts at its source with the required level and quest state; all gate approaches use movement.',
              'counts': dict(counts), 'directions': checked, 'windWindows': verify_wind_gates()}
    (ROOT / 'evidence/world-timed-gates-lua.json').write_text(
        json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(f'{len(checked)} short transfers exercised with the in-game portal action.')
    fixtures = ROOT / 'work/world-timed-gates'
    fixtures.mkdir(parents=True, exist_ok=True)
    for source, target in [('golden-hub', 'sites-gaa-03'), ('bygone-camp', 'bygone-waterway-pier')]:
        s = ready(source, edges[source, target]).state
        checkpoint = validate_save(native(core.checkpoint(s)))
        (fixtures / f'{source}.json').write_text(json.dumps(checkpoint) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
