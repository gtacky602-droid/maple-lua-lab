"""Walk all mapped Sumeru stages and verify floor transitions, wind gates and quests."""

from argparse import ArgumentParser
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
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
route_plan = read('design/world/atlas-route-plan.json')
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
assert set(edges) == {(b, a) for a, b in edges}
assert len(edges) == sum(e['to'] in stages for n in stages for e in exits[n])
removed = [row for row in route_plan['removed_editor_routes'] if all(k in mapping for k in row['fields'])]
for row in removed:
    a, b = (mapping[k] for k in row['fields'])
    assert (a, b) not in edges and (b, a) not in edges, row
adopted = [row for row in route_plan['sites_only_route_review']
           if row['finding'] == 'field_studio_lab_connection' and all(k in mapping for k in row['fields'])]
adopted_pairs = set()
for row in adopted:
    a, b = (mapping[k] for k in row['fields'])
    adopted_pairs.add(frozenset((a, b)))
    for path in row['runtime_paths'].values():
        assert all(any(e['to'] == b for e in exits[a]) for a, b in zip(path, path[1:])), row
travel_modes = Counter(
    next((mode for key, mode in (('boatSeconds', 'boat'), ('waterwaySeconds', 'waterway'),
                                ('liftSeconds', 'lift'), ('y', 'raised')) if key in edge), 'walk')
    for edge in edges.values()
)


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
authored_layers = set(map(frozenset, layer_paths)) | {frozenset(tunnel)}
runtime_layers = {frozenset((a, b)) for a, b in edges if a in grouped_stages or b in grouped_stages}
assert authored_layers <= runtime_layers
assert runtime_layers - authored_layers <= adopted_pairs
for (a, b), mode in layer_paths.items():
    assert b in grouped_stages
    if a in grouped_stages:
        assert grouped_stages[a]['group_id'] == grouped_stages[b]['group_id']
    if mode == 'walk':
        assert grouped_stages[a] == grouped_stages[b]
    else:
        assert mode in edges[a, b] and mode in edges[b, a]

parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path, help='Earned late-Sumeru checkpoint with the quay quest reported')
parser.add_argument('--quay-save', type=Path, help='Earned checkpoint before accepting the quay quest')
args = parser.parse_args()
if bool(args.from_save) != bool(args.quay_save):
    parser.error('--from-save and --quay-save must be supplied together')
lua, core = runtime()


def restore_source(path):
    raw = path.read_bytes()
    saved = validate_save(json.loads(raw))
    assert saved['story']['node'] == 'sumeru-hub'
    restored = core.restore(lua.table_from(saved, recursive=True), 16)
    assert not restored.auto
    return restored, {'sha256': sha256(raw).hexdigest(), 'level': restored.progression.level,
                      'path': path.name}


source_saves = {}
if args.quay_save:
    state, source_saves['quay'] = restore_source(args.quay_save)
else:
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
        if portal and portal.to == target and not portal.available:
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
quay = 'sum-wp-69098'
shortcut_start, shortcut_end = 'sum-wp-32451', 'sum-wp-28709'
shortcut = edges[shortcut_start, shortcut_end]
assert shortcut['studioMode'] == 'road' and shortcut['rideLabel'] == '深層の根室へ続く横穴'
shaft_approach = ('sum-wp-28740', 'sum-wp-28743', 'sum-wp-28708', shortcut_start)
core.action(state, 'story_fast:sum-wp-28709')
assert state.story.node == 'sumeru-hub' and not state.story.visited['sum-wp-28709']
accept(port)
run_itinerary(port)
assert state.returns == 0 and state.story.visited[quay]
level_gate = None
if state.progression.level < nodes[shortcut_end]['level']:
    follow(*shaft_approach)
    trail.approach(shortcut['x'], shortcut.get('y', 480), shortcut_end)
    portal = core.frame(state, 'sprite', 'legacy').storyNearbyPortal
    assert portal.to == shortcut_end and not portal.available and portal.level == nodes[shortcut_end]['level']
    core.action(state, 'story_nearby_portal')
    assert state.story.node == shortcut_start and not state.story.visited[shortcut_end]
    core.action(state, 'world_map_focus:' + shortcut_end)
    guide = core.frame(state, 'sprite', 'legacy').worldMap.guide
    assert guide.status == 'blocked' and guide.requiredLevel == portal.level
    core.action(state, 'world_map_close')
    level_gate = {'current': state.progression.level, 'required': portal.level, 'reason': portal.reason}
    warp('sumeru-hub')
if args.from_save:
    state, source_saves['late'] = restore_source(args.from_save)
    assert state.story.quests[port].status == 'complete'
    trail = TrailWalk(lua, core, state, edges, exits)
write('work/sumeru-waypoint-late-browser-save.json', validate_save(native(core.checkpoint(state))))

accept(nursery)
follow(*shaft_approach)
assert trail.follow_atlas(shortcut_end) == [shortcut_end]
assert state.story.quests[nursery].count == 0
follow(shortcut_start)
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
assert state.returns == 0
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status == 'complete' and restored.story.quests[q].cycles == 1
           for q in [port, nursery, wind, water])

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
    'travel_modes': travel_modes,
    'reviewed_studio_pairs': len(adopted_pairs),
    'editor_deletions_confirmed_absent': len(removed),
    'source_saves': source_saves,
    'party_wipes': state.returns,
    'mapped_stage_ids': sorted(stages),
    'layered_markers': len(floors),
    'layer_connections': len(layer_paths),
    'reviewed_layer_shortcuts': len(runtime_layers - authored_layers),
    'shaft_shortcut_keeps_required_lift_steps': [shortcut_start, shortcut_end],
    'shaft_shortcut_level_gate': level_gate,
    'lab_maintenance_tunnel': list(tunnel),
    'wind_closed_then_open': True,
    'reported_quests': [port, nursery, wind, water],
    'completed_and_visits_restored': True,
    'ordinary_enemy_stages': review['populated_stages'],
    'sumeru_28707_lua_draw_commands': sample,
})
print(f'Walked {len(sweep.crossings)} directed gates, including the lab tunnel, and reported four quests.')
