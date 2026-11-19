"""Walk the Inazuma and Enkanomiya map pins, including the locked outer beacons."""

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
coverage = read('content/coverage.json')['map_catalog']['stage_links']
review = read('sources/map-research/inazuma-marker-review.json')
mapping = review['stage_by_marker']
points = {p['id']: p for p in catalog['nodes'] if
          (p['map_id'] == 2 and p['area_id'] == 3) or p['map_id'] == 7}
assert set(points) == set(mapping) == {p for area in review['areas'].values() for p in area}
assert sum(p['map_id'] == 2 for p in points.values()) == 53
assert sum(p['map_id'] == 7 for p in points.values()) == 24
assert len(set(mapping.values())) == 77
area_by_pin = {p: area for area, pins in review['areas'].items() for p in pins}
assert len(area_by_pin) == sum(map(len, review['areas'].values()))
stages = set(mapping.values())
exits = {k: n['exits'] for k, n in nodes.items()}
edges = {(a, e['to']): e for a in stages for e in exits[a] if e['to'] in stages}
assert len(edges) == 212 and set(edges) == {(b, a) for a, b in edges}
for key, count in {'boatSeconds': 24, 'liftSeconds': 18, 'waterwaySeconds': 2, 'phaseSeconds': 6, 'y': 10}.items():
    assert sum(key in e for e in edges.values()) == count


def on_ledge(stage, x, y):
    return any(p['y'] == y and p['x'] <= x <= p['x'] + p['w'] for p in nodes[stage]['platforms'])


for (a, b), gate in edges.items():
    assert on_ledge(a, gate['x'], gate.get('y', 480)), (a, b)
    if 'arrivalX' in gate:
        assert on_ledge(b, gate['arrivalX'], gate.get('arrivalY', 480)), (a, b)
for key, stage in mapping.items():
    n, point = nodes[stage], points[key]
    pin = n['waypoint']
    assert n['mapPoint'] == key and coverage[key]['stage_id'] == stage
    assert (pin['kind'], pin['area'], pin.get('floor')) == (
        point['kind'], area_by_pin[key], point.get('point_group'))
    assert on_ledge(stage, pin['x'], pin['y'])
    assert {nodes[e['to']]['mapPoint'] for e in exits[stage] if 'mapPoint' in nodes[e['to']]} == (
        set(coverage[key]['gates']))
assert [k for k, p in points.items() if p.get('point_group')] == [review['floor_marker']]
floor_gates = exits[mapping[review['floor_marker']]]
assert len([gate for gate in floor_gates if gate['to'] in stages]) == 1
assert all(gate.get('liftSeconds') or gate['to'].startswith('sites-hunt-') for gate in floor_gates)

lua, core = runtime()
state = core.new(15)
core.action(state, 'campaign')
core.grantExp(state, sum(core.expNeeded(lv) for lv in range(1, 61)), 'quest')
assert state.progression.level == 61
core.enterStoryNode(state, 'inazuma-town')
(ROOT / 'work').mkdir(exist_ok=True)
write('work/inazuma-waypoint-browser-save.json', validate_save(native(core.checkpoint(state))))
trail = TrailWalk(lua, core, state, edges, exits)


def follow(*route):
    for place in route:
        trail.cross(place)


def inspect(step, q):
    assert state.story.node == step['node']
    trail.approach(step['x'], step['y'], q)
    core.action(state, 'story_collect')


def warp(destination):
    core.action(state, 'story_fast:' + destination)
    assert state.story.node == destination


def report(q):
    quest = quests[q]
    warp(quest['hub'])
    xp, mora = state.progression.questXp, state.mora
    for _ in range(2):
        core.action(state, 'story_report:' + q)
    record = state.story.quests[q]
    assert record.status == 'complete' and record.cycles == 1
    assert (state.progression.questXp - xp, state.mora - mora) == (quest['xp'], quest['mora'])


def itinerary(q):
    record = state.story.quests[q]
    assert record.status == 'active'
    for i, step in enumerate(quests[q]['itinerary'], 1):
        if step['kind'] == 'arrive':
            assert state.story.node == step['from']
            trail.cross(step['node'])
        else:
            inspect(step, q)
        assert record.count == i, (q, i, step, state.storyNotice)
    report(q)


core.action(state, 'story_fast:ina-wp-47990')
assert state.story.node == 'inazuma-town' and not state.story.visited['ina-wp-47990']
seirai, floor, beacons = 'ina-mapped-seirai-ferry', 'ina-mapped-undersea-floor', 'ina-mapped-enkan-beacons'
core.action(state, 'story_accept:' + seirai)
itinerary(seirai)
follow('inazuma-road', 'inazuma-port')
core.action(state, 'story_accept:' + floor)
trail.cross('inazuma-road')
itinerary(floor)
follow('watatsumi-landing', 'ina-wp-15942', 'enkanomiya-camp')
across = review['watatsumi_to_enkanomiya']
assert 'waterwaySeconds' in edges[across['from'], across['to']]

core.action(state, 'story_accept:' + beacons)
record = state.story.quests[beacons]
assert record.status == 'active' and record.count == 0
follow('enkanomiya-depth', 'enkan-wp-21573', 'enkan-wp-21574', 'enkan-wp-21576')
gates = review['locked_outer_routes']
for gate in gates:
    edge = edges[gate['from'], gate['to']]
    assert edge['requires'] == {'quest': beacons, 'count': gate['count']}
    assert not edges[gate['to'], gate['from']].get('requires')
gate = gates[0]
trail.approach(edges[gate['from'], gate['to']]['x'], 480, gate['to'])
core.action(state, 'story_nearby_portal')
assert state.story.node == gate['from'] and state.lift is None and '進めてください' in state.storyNotice

follow('enkan-wp-21579', 'enkan-wp-21580')
assert record.count == 1

def beacon_pixel(state, color):
    draws = core.frame(state, 'sprite', 'legacy').draws
    return any(draws[i].color == color for i in range(1, len(draws) + 1))

steps = quests[beacons]['itinerary']
assert beacon_pixel(state, '#61788e')
inspect(steps[1], beacons)
assert record.count == 2 and beacon_pixel(state, '#fff2ba')
follow('enkan-wp-21579', 'enkan-wp-21576', 'enkan-wp-21593')
inspect(steps[2], beacons)
assert record.count == 3
follow('enkan-wp-21576', 'enkan-wp-21579', 'enkan-wp-21580', 'enkan-wp-21581',
       'enkan-wp-21590', 'enkan-wp-21588', 'enkan-wp-21594')
inspect(steps[3], beacons)
assert record.count == 4
follow('enkan-wp-21588', 'enkan-wp-21590', 'enkan-wp-21581', 'enkan-wp-21580',
       'enkan-wp-21582', 'enkan-wp-21583', 'enkan-wp-21584', 'enkan-wp-21592')
inspect(steps[4], beacons)
assert record.count == 5
report(beacons)

full = TrailWalk(lua, core, state, edges, exits)
assert full.explore() == stages and full.crossings == set(edges)
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status == 'complete' for q in [seirai, floor, beacons])
core.action(restored, 'story_fast:enkan-wp-21592')
assert restored.story.node == 'enkan-wp-21592' and beacon_pixel(restored, '#fff2ba')

write('evidence/inazuma-waypoint-test.json', {
    'map_2_inazuma': 53,
    'map_7_enkanomiya': 24,
    'reciprocal_routes': len(full.crossings) // 2,
    'directed_crossings': len(full.crossings),
    'stage_ids': sorted(stages),
    'locked_beacon_crossings': gates,
    'before_lighting_blocked': True,
    'watatsumi_waterway': across,
    'reported_quests': [seirai, floor, beacons],
    'beacon_remained_lit_after_save': True,
})
print(f'Walked {len(full.crossings)} directed gates over {len(stages)} Inazuma/Enkanomiya markers and reported three quests.')
