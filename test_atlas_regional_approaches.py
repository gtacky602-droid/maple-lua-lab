"""Follow the atlas itinerary in both directions on the two regional approaches."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


atlas = read('content/world-atlas.json')
regions = {point['id']: region['id'] for region in atlas['regions'] for point in region['points']}
graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
edges = {(node['id'], edge['to']): edge for node in graph['nodes'] for edge in node['exits']}
plan = read('design/world/atlas-route-plan.json')['sites_only_route_review']
entry = next(row for row in plan if set(row['fields']) == {'map37:96380', 'teyvat:95801'})
assert 'runtime_paths' not in entry
approaches = entry['regional_approaches']
sky, port = [row['stages'][-1] for row in approaches]
assert (sky, port) not in edges and (port, sky) not in edges
lua, core = runtime()


def guide(state, target):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_region:' + regions[target])
    core.action(state, 'world_map_select:' + target)
    view = core.frame(state, 'sprite', 'legacy').worldMap
    assert view.selected.id == target
    if target in (sky,port):
        route = next(a['stages'] for a in approaches if a['stages'][-1]==target)
        gate = view.selected.approachGate
        assert (gate['from'],gate.id,gate.previewX)==(route[0],route[1],edges[route[0],route[1]]['x'])
    itinerary = native(view.guide)
    core.action(state, 'world_map_close')
    return itinerary


def check_approach(approach):
    route = approach['stages']
    origin, target = route[0], route[-1]
    level = nodes[target]['level']
    assert level == max(nodes[id]['level'] for id in route)

    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level - 2]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, origin)
    assert not s.story.visited[target]
    blocked = guide(s, target)
    assert blocked['status'] == 'blocked' and blocked['reason'] == f'必要Lv{level}'
    assert [leg['id'] for leg in blocked['stops']] == route[1:]

    walk = TrailWalk(lua, core, s, edges, {})
    for leg in blocked['stops'][:-1]:
        walk.cross(leg['id'])
    last = edges[route[-2], target]
    walk.approach(last['x'], last.get('y', 480), target)
    portal = core.frame(s, 'sprite', 'legacy').storyNearbyPortal
    assert portal.to == target and not portal.available and portal.level == level
    core.action(s, 'story_nearby_portal')
    assert s.story.node == route[-2] and not s.lift and not s.story.visited[target]

    # The browser fixture starts at the regional entrance before either trip.
    fresh = core.new(12)
    core.action(fresh, 'story_start')
    core.grantExp(fresh, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    checkpoint = nodes[origin]['checkpoint']
    core.enterStoryNode(fresh, checkpoint)
    core.enterStoryNode(fresh, origin)
    fixture = validate_save(native(core.checkpoint(fresh)))
    assert fixture['story']['node'] == origin and fixture['story']['visited'][origin]
    write(f'work/atlas-regional-{origin}.json', fixture)

    walk = TrailWalk(lua, core, fresh, edges, {})
    itineraries = []
    for path in (route, route[::-1]):
        itinerary = guide(fresh, path[-1])
        assert itinerary['status'] == 'ready'
        assert [leg['from'] for leg in itinerary['stops']] == path[:-1]
        assert [leg['id'] for leg in itinerary['stops']] == path[1:]
        for leg in itinerary['stops']:
            edge = edges[leg['from'], leg['id']]
            hint = leg.get('hint', '')
            if edge.get('liftSeconds'):
                assert edge['rideLabel'] in hint and leg['label'] == '昇降機'
            if edge.get('y', 480) < 480:
                assert '上段の入口' in hint
            walk.cross(leg['id'])
        itineraries.append(itinerary['stops'])

    assert fresh.story.node == origin and len(walk.crossings) == 2 * (len(route) - 1)
    saved = validate_save(native(core.checkpoint(fresh)))
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    assert restored.story.node == checkpoint and all(restored.story.visited[id] for id in route)
    return dict(field=approach['field'], level=level, itinerary=itineraries, resumeHub=checkpoint,
                directedCrossings=len(walk.crossings), underleveledGateRejected=True, visitsRestored=True)


evidence = [check_approach(approach) for approach in approaches]
sky_legs, port_legs = [report['itinerary'] for report in evidence]
assert sky_legs[1][0]['hint'] == '南東の小島へ上がる昇降機・移動に2秒'
assert sky_legs[1][-1]['hint'] == '古の聖山へ戻る昇降機・移動に3.2秒'
assert port_legs[0][1]['hint'] == '上段の入口'
write('evidence/atlas-regional-approaches-lua.json', {
    'method': 'Walked and used the in-game gates in order from the atlas itinerary with level fixtures.',
    'regionalApproaches': evidence, 'noDirectCrossRegionGate': True,
})
print('Atlas Lua:', sum(case['directedCrossings'] for case in evidence),
      'guided crossings, two level checks, and both return trips passed.')
