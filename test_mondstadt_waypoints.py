"""Exercise the 51 Mondstadt markers, linked gates, itineraries and fast travel in Lua."""

import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
catalog = read('content/map-catalog.json')
coverage = read('content/coverage.json')['map_catalog']['stage_links']
reference = read('sources/map-research/mondstadt-marker-review.json')
points = {p['id']: p for p in catalog['nodes'] if p['map_id'] == 2 and p['area_id'] == 1}
mapping = reference['stage_by_marker']
assert set(points) == set(mapping) == {p for area in reference['areas'].values() for p in area}
assert sorted(map(len, reference['areas'].values())) == [13, 13, 25]
assert len(set(mapping.values())) == len(points) == 51
assert reference['map_version'] == next(m['map_version'] for m in catalog['maps'] if m['id'] == 2)
stages = set(mapping.values())
edges = {(a, e['to']): e for a in stages for e in nodes[a]['exits'] if e['to'] in stages}
assert len(edges) == 124
assert 'boatSeconds' in edges['mond-wp-95799','mond-wp-95797']
assert 'liftSeconds' in edges['mond-wp-95798','mond-wp-95803']
assert ('mond-wp-95799','mond-wp-95803') not in edges
assert ('mond-wp-95797','mond-wp-95803') not in edges
assert [nodes[f'mond-wp-{id}']['level'] for id in (95794,95795,95782,95798,95803)] == [155,158,160,162,169]
assert sum('boatSeconds' in e for e in edges.values()) == 6
assert sum('liftSeconds' in e for e in edges.values()) == 2
assert sum(e.get('y', 480) < 480 for e in edges.values()) == 4


def on_platform(stage, x, y):
    return any(p['y'] == y and p['x'] <= x <= p['x'] + p['w'] for p in nodes[stage]['platforms'])


for (a, b), edge in edges.items():
    assert (b, a) in edges
    assert on_platform(a, edge['x'], edge.get('y', 480)), (a, b)
    if 'arrivalX' in edge:
        assert on_platform(b, edge['arrivalX'], edge.get('arrivalY', 480)), (a, b)
for key, stage in mapping.items():
    point, node = points[key], nodes[stage]
    pin = node['waypoint']
    assert node['mapPoint'] == key and coverage[key]['stage_id'] == stage
    assert pin['kind'] == point['kind']
    assert {nodes[e['to']]['mapPoint'] for e in node['exits'] if 'mapPoint' in nodes[e['to']]} == set(coverage[key]['gates'])
    assert on_platform(stage, pin['x'], pin['y'])
assert {p for p, spec in points.items() if spec.get('point_group')} == {reference['grouped_marker']}
assert nodes[mapping[reference['grouped_marker']]]['waypoint']['floor'] == points[reference['grouped_marker']]['point_group']

lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, sum(core.expNeeded(lv) for lv in range(1, 175)), 'quest')
assert state.progression.level == 175
(ROOT / 'work').mkdir(exist_ok=True)
write('work/mondstadt-waypoint-browser-save.json', validate_save(native(core.checkpoint(state))))
# The only existing quest-locked door between pins stays locked until the legacy quest is accepted.
core.action(state, 'story_fast:mond-wp-55')
assert state.story.node == 'mond-town' and not state.story.visited['mond-wp-55']
state.story.quests['amber-join'] = lua.table_from({'status': 'complete', 'count': quests['amber-join']['goal'], 'cycles': 1})
core.action(state, 'story_accept:mond-rest-stop')
assert state.story.quests['mond-rest-stop'].status == 'active'

trail = TrailWalk(lua, core, state, edges, {k: n['exits'] for k, n in nodes.items()})
visited = trail.explore()
walked = trail.crossings
assert visited == stages and walked == set(edges)
quest_ids = ('mond-mapped-lakeside', 'mond-mapped-snowline', 'mond-mapped-islet')
for quest_id in quest_ids:
    quest = quests[quest_id]
    core.action(state, 'story_fast:' + quest['hub'])
    assert state.story.node == quest['hub']
    core.action(state, 'story_accept:' + quest_id)
    assert state.story.quests[quest_id].status == 'active'
    first = quest['itinerary'][0]['node']
    core.action(state, 'story_fast:' + first)
    assert state.story.node == first and state.story.quests[quest_id].count == 0
    pin = nodes[first]['waypoint']
    actor = state.actors[state.active]
    assert (actor.x, actor.y) == (pin['x'], pin['y'])
    core.action(state, 'story_fast:' + quest['hub'])
    for i, step in enumerate(quest['itinerary'], 1):
        if step['kind'] == 'arrive':
            assert state.story.node == step['from']
            trail.cross(step['node'])
        else:
            assert state.story.node == step['node']
            trail.approach(step['x'], step['y'], quest_id)
            core.action(state, 'story_collect')
        assert state.story.quests[quest_id].count == i, (quest_id, step, state.storyNotice)
    core.action(state, 'story_fast:' + quest['hub'])
    xp, mora = state.progression.questXp, state.mora
    for _ in range(2):
        core.action(state, 'story_report:' + quest_id)
    assert state.story.quests[quest_id].status == 'complete'
    assert state.story.quests[quest_id].cycles == 1
    assert state.progression.questXp == xp + quest['xp'] and state.mora == mora + quest['mora']

checkpoint = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(checkpoint, recursive=True))
assert all(restored.story.visited[stage] for stage in stages)
assert all(restored.story.quests[q].status == 'complete' for q in quest_ids)

low = core.new(14)
core.action(low, 'story_start')
core.enterStoryNode(low, 'dornman-camp')
floor = 'mond-wp-95797'
for _ in range(450):
    if abs(low.actors[low.active].x - edges['dornman-camp', floor]['x']) < 35:
        break
    core.step(low, 1 / 60, trail.inputs['right'])
core.action(low, 'story_portal:' + floor)
assert low.story.node == 'dornman-camp' and '必要レベル' in low.storyNotice

write('evidence/mondstadt-waypoint-test.json', {
    'markers': len(mapping),
    'visited_stages': sorted(visited),
    'directed_gates_walked': [list(pair) for pair in sorted(walked)],
    'reported_quests': list(quest_ids),
    'save_restored': True,
    'unvisited_fast_travel_rejected': True,
    'fast_travel_does_not_advance_arrival_steps': True,
    'underleveled_gate_rejected': True,
})
print(f'Walked {len(walked)} directed gates across {len(visited)} markers and reported {len(quest_ids)} itineraries.')
