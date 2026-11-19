"""Traverse Snezhnaya gates and report each new survey through Lua actions."""

import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def on_platform(stage, x, y):
    return any(p['y'] == y and p['x'] <= x <= p['x'] + p['w'] for p in stage['platforms'])


graph = read('content/story-graph.json')
catalog = read('content/map-catalog.json')
review = read('sources/map-research/snezhnaya-marker-review.json')
coverage = read('content/coverage.json')['map_catalog']['stage_links']
nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
points = {p['id']: p for p in catalog['nodes'] if (p['map_id'], p['area_id']) == (2, 16)}
mapping = review['stage_by_marker']
stages = set(mapping.values())
assert set(points) == set(mapping) == {point for group in review['areas'].values() for point in group}
assert len(points) == len(stages) == 108
assert review['sources'][0]['map_version'] == next(m['map_version'] for m in catalog['maps'] if m['id'] == 2)
assert len(review['floor_markers']) == 37
assert review['floor_markers'] == {p: n['point_group'] for p, n in points.items() if 'point_group' in n}
for key, stage in mapping.items():
    node = nodes[stage]
    pin = node['waypoint']
    assert node['mapPoint'] == key and coverage[key]['stage_id'] == stage
    assert (pin['kind'], pin.get('floor')) == (points[key]['kind'], points[key].get('point_group'))
    assert on_platform(node, pin['x'], pin['y'])

exits = {name: node['exits'] for name, node in nodes.items()}
edges = {(a, edge['to']): edge for a in stages for edge in exits[a] if edge['to'] in stages}
station_return = ('white-pass-station', 'snezhnaya-hub')
assert edges.pop(station_return)['x'] == 52
assert len(edges) == 282 and set(edges) == {(b, a) for a, b in edges}
assert {(a, b) for (a, b), edge in edges.items() if edge.get('wind')} == {
    (entry['from'], entry['to']) for entry in review['wind_gates']
}
for (a, b), edge in edges.items():
    assert on_platform(nodes[a], edge['x'], edge.get('y', 480)), (a, b)
    if 'arrivalX' in edge:
        assert on_platform(nodes[b], edge['arrivalX'], edge.get('arrivalY', 480)), (a, b)
for link in review['floor_connections'] + [review['offshore_route']]:
    a, b, mode = link['from'], link['to'], link['mode']
    floor_a, floor_b = (nodes[k]['waypoint'].get('floor') for k in (a, b))
    if mode == 'walk':
        assert floor_a == floor_b and floor_a is not None
    elif mode in ('liftSeconds', 'boatSeconds'):
        assert mode in edges[a, b] and mode in edges[b, a]
    else:
        assert mode == 'existing_walk' and (a, b) == ('novokichev-camp', 'novokichev-depth')

lua, core = runtime()
state = core.new(16)
core.action(state, 'campaign')
core.grantExp(state, sum(core.expNeeded(level) for level in range(1, 160)), 'quest')
assert state.progression.level == 160
core.enterStoryNode(state, 'nod-town')
departure = next(edge for edge in exits['nod-town'] if edge['to'] == 'snezhnaya-entry')
TrailWalk(lua, core, state, {('nod-town', 'snezhnaya-entry'): departure}, exits).cross('snezhnaya-entry')
trail = TrailWalk(lua, core, state, edges, exits)
trail.cross('snezhnaya-hub')


def accept(id):
    core.action(state, 'story_accept:' + id)
    assert state.story.quests[id].status == 'active'


def complete(id):
    quest, record = quests[id], state.story.quests[id]
    for count, step in enumerate(quest['itinerary'], 1):
        if step['kind'] == 'arrive':
            assert state.story.node == step['from']
            trail.cross(step['node'])
        else:
            assert state.story.node == step['node']
            trail.approach(step['x'], step['y'], step['name'])
            core.action(state, 'story_collect')
        assert record.count == count, (id, count, state.storyNotice)
    core.action(state, 'story_fast:' + quest['hub'])
    assert state.story.node == quest['hub']
    xp, mora = state.progression.questXp, state.mora
    for _ in range(2):
        core.action(state, 'story_report:' + id)
    assert record.status == 'complete' and record.cycles == 1
    assert (state.progression.questXp - xp, state.mora - mora) == (quest['xp'], quest['mora'])


track = 'sne-mapped-track-walk'
tower = 'sne-mapped-four-tower-floors'
works = 'sne-mapped-works-wire'
wall = 'sne-mapped-east-wall'
accept(track)
complete(track)
accept(tower)
trail.cross('sne-wp-100674')
trail.cross('sne-wp-100679')
trail.cross('sne-wp-100680')
(ROOT / 'work').mkdir(exist_ok=True)
write('work/snezhnaya-waypoint-browser-save.json', validate_save(native(core.checkpoint(state))))
complete(tower)
trail.cross('snezhnaya-field')
trail.cross('novokichev-camp')
accept(works)
complete(works)
for stage in ('sne-wp-106204', 'sne-wp-106202', 'sne-wp-107298', 'sne-wp-106210',
              'sne-wp-106211', 'sne-wp-106212', 'sne-east-camp'):
    trail.cross(stage)
accept(wall)
complete(wall)

sweep = TrailWalk(lua, core, state, edges, exits)
assert sweep.explore() == stages and sweep.crossings == set(edges)
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status == 'complete' for q in (track, tower, works, wall))
core.action(restored, 'story_fast:sne-wp-100694')
assert restored.story.node == 'sne-wp-100694'
write('evidence/snezhnaya-waypoint-test.json', {
    'markers': len(stages), 'layered_markers': len(review['floor_markers']),
    'reciprocal_paths': len(edges) // 2, 'directed_paths': len(sweep.crossings),
    'stage_ids': sorted(stages), 'arrival_from_nod_krai': True,
    'wind_gates': review['wind_gates'], 'offshore_trip': review['offshore_route'],
    'reported_quests': [track, tower, works, wall], 'restored_visits_and_quests': True,
})
print(f'Snezhnaya passed {len(stages)} markers, {len(sweep.crossings)} directed gates and four surveys.')
