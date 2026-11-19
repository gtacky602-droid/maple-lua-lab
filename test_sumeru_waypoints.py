"""Walk all mapped Sumeru stages and verify floor transitions, wind gates and quests."""

import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf8'))


def write(name, data):
    (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
catalog = read('content/map-catalog.json')
cover = read('content/coverage.json')['map_catalog']
review = read('sources/map-research/sumeru-marker-review.json')
points = {p['id']: p for p in catalog['nodes'] if p['area_id'] == 4 and p['map_id'] == 2}
mapping = review['stage_by_marker']
assert set(mapping) == set(points) == {p for pins in review['areas'].values() for p in pins}
assert len(set(mapping.values())) == len(points) == 125
assert sorted(map(len, review['areas'].values())) == [3, 20, 22, 29, 51]
floors = {p['id']: p['point_group'] for p in points.values() if p.get('point_group')}
assert floors == review['floor_groups'] and len(floors) == 32
stages = set(mapping.values())
exits = {name: node['exits'] for name, node in nodes.items()}
edges = {(n, e['to']): e for n in stages for e in exits[n] if e['to'] in stages}
assert len(edges) == 338 and set(edges) == {(b, a) for a, b in edges}
for field, expected in [('boatSeconds', 6), ('waterwaySeconds', 6), ('liftSeconds', 46), ('y', 7), ('wind', 2)]:
    assert sum(field in e for e in edges.values()) == expected


def on_platform(stage, x, y):
    return any(p['y'] == y and p['x'] <= x <= p['x'] + p['w'] for p in nodes[stage]['platforms'])


for (a, b), edge in edges.items():
    assert on_platform(a, edge['x'], edge.get('y', 480)), (a, b)
    if 'arrivalX' in edge:
        assert on_platform(b, edge['arrivalX'], edge.get('arrivalY', 480)), (a, b)
for key, stage in mapping.items():
    node = nodes[stage]
    pin = node['waypoint']
    assert cover['stage_links'][key]['stage_id'] == stage and node['mapPoint'] == key
    assert (pin['kind'], pin.get('floor')) == (points[key]['kind'], floors.get(key))
    assert on_platform(stage, pin['x'], pin['y'])
    assert {nodes[e['to']]['mapPoint'] for e in exits[stage] if 'mapPoint' in nodes[e['to']]} == (
        set(cover['stage_links'][key]['gates']))

layer_paths = {(row['from'], row['to']): row['mode'] for row in review['floor_connections']}
grouped_stages = {mapping[key]: spec for key, spec in floors.items()}
tunnel = ('sum-wp-46523', 'sum-wp-46530')
assert all(stage in grouped_stages for stage in tunnel)
assert edges[tunnel]['rideLabel'] == '工場下層の保守坑道へ'
assert set(map(frozenset, layer_paths)) | {frozenset(tunnel)} == {
    frozenset((a, b)) for a, b in edges if a in grouped_stages or b in grouped_stages}
for (a, b), mode in layer_paths.items():
    assert b in grouped_stages
    if a in grouped_stages:
        assert grouped_stages[a]['group_id'] == grouped_stages[b]['group_id']
    if mode == 'walk':
        assert grouped_stages[a] == grouped_stages[b]
    else:
        assert mode in edges[a, b] and mode in edges[b, a]

lua, core = runtime()
state = core.new(16)
core.action(state, 'campaign')
core.grantExp(state, sum(core.expNeeded(lv) for lv in range(1, 80)), 'quest')
assert state.progression.level == 80
core.enterStoryNode(state, 'sumeru-hub')
(ROOT / 'work').mkdir(exist_ok=True)
write('work/sumeru-waypoint-browser-save.json', validate_save(native(core.checkpoint(state))))
trail = TrailWalk(lua, core, state, edges, exits)


def follow(*stages):
    for stage in stages:
        trail.cross(stage)


def warp(destination):
    core.action(state, 'story_fast:' + destination)
    assert state.story.node == destination


def accept(q):
    core.action(state, 'story_accept:' + q)
    assert state.story.quests[q].status == 'active'


def check_wind_lock(target):
    origin = state.story.node
    edge = edges[origin, target]
    trail.approach(edge['x'], edge['y'], target)
    for _ in range(500):
        portal = core.frame(state, 'sprite', 'legacy').storyNearbyPortal
        if portal.to == target and not portal.available:
            break
        core.step(state, 1 / 60, trail.idle)
    else:
        raise AssertionError('The upper gate never closed in the wind')
    core.action(state, 'story_nearby_portal')
    assert state.story.node == origin and state.lift is None and '風が弱まるまで' in state.storyNotice


def run_itinerary(q, observe_wind=False):
    quest, record = quests[q], state.story.quests[q]
    for i, step in enumerate(quest['itinerary'], 1):
        if step['kind'] == 'arrive':
            assert state.story.node == step['from']
            if observe_wind and step['node'] == 'sum-wp-41836':
                check_wind_lock(step['node'])
            trail.cross(step['node'])
        else:
            assert state.story.node == step['node']
            trail.approach(step['x'], step['y'], q)
            core.action(state, 'story_collect')
        assert record.count == i, (q, i, step, state.storyNotice)
    warp(quest['hub'])
    xp, mora = state.progression.questXp, state.mora
    for _ in range(2):
        core.action(state, 'story_report:' + q)
    assert record.status == 'complete' and record.cycles == 1
    assert (state.progression.questXp - xp, state.mora - mora) == (quest['xp'], quest['mora'])


port, nursery, wind, water = ('sum-mapped-north-quay', 'sum-mapped-twin-shaft',
                              'sum-mapped-desert-wind', 'sum-mapped-tunigi-water')
core.action(state, 'story_fast:sum-wp-28709')
assert state.story.node == 'sumeru-hub' and not state.story.visited['sum-wp-28709']
accept(port)
run_itinerary(port)
accept(nursery)
follow('sum-wp-28740', 'sum-wp-28743', 'sum-wp-28708', 'sum-wp-32451')
run_itinerary(nursery)
follow('sumeru-field', 'tunigi-camp')
accept(wind)
follow('sum-wp-46517', 'sum-wp-46516', 'sum-wp-46515', 'sum-wp-41834', 'sum-wp-41835')
run_itinerary(wind, observe_wind=True)
accept(water)
run_itinerary(water)

sweep = TrailWalk(lua, core, state, edges, exits)
assert sweep.explore() == stages and sweep.crossings == set(edges)
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status == 'complete' for q in [port, nursery, wind, water])

placement = read('content/enemy-spawns.json')['nodes']
for name in review['populated_stages']:
    core.action(restored, 'story_fast:' + name)
    assert restored.story.node == name
    assert [e.art for e in restored.enemies.values()] == [p['art'] for p in placement[name]]

sample = {}
core.action(restored, 'story_fast:sum-wp-28707')
for mode, profile in [('sprite','legacy'), ('rect','legacy'), ('rect','h32c16')]:
    frame = core.frame(restored, mode, profile)
    sample[mode + ':' + profile] = len(frame.draws)
assert sample['rect:h32c16'] < sample['rect:legacy']

write('evidence/sumeru-waypoint-test.json', {
    'marker_count': len(mapping),
    'reciprocal_routes': len(sweep.crossings) // 2,
    'directed_crossings': len(sweep.crossings),
    'mapped_stage_ids': sorted(stages),
    'layered_markers': len(floors),
    'layer_connections': len(layer_paths),
    'lab_maintenance_tunnel': list(tunnel),
    'wind_closed_then_open': True,
    'reported_quests': [port, nursery, wind, water],
    'completed_and_visits_restored': True,
    'ordinary_enemy_stages': review['populated_stages'],
    'sumeru_28707_lua_draw_commands': sample,
})
print(f'Walked {len(sweep.crossings)} directed gates, including the lab tunnel, and reported four quests.')
