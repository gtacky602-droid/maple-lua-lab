"""Verify each mapped Liyue stage by walking its gates and riding the layered routes."""

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
review = read('sources/map-research/liyue-marker-review.json')
plan = read('design/world/atlas-route-plan.json')
mapping = review['stage_by_marker']
points = {p['id']: p for p in catalog['nodes'] if p['map_id'] == 2 and p['area_id'] == 2}
assert set(mapping) == set(points) == {p for area in review['areas'].values() for p in area}
assert sorted(map(len, review['areas'].values())) == [7, 31, 45]
assert len(set(mapping.values())) == len(points) == 83
assert review['map_version'] == next(m['map_version'] for m in catalog['maps'] if m['id'] == 2)
assert review['grouped_markers'] == {p['id']:p['point_group'] for p in points.values() if p.get('point_group')}
shaft = review['surface_to_mine']
mine = shaft['mine']
markers = set(mapping.values())
stages = markers | {mine}
exits = {k: n['exits'] for k, n in nodes.items()}
edges = {(a, e['to']): e for a in stages for e in exits[a] if e['to'] in stages}
all_edges = {(a, e['to']): e for a in exits for e in exits[a]}
assert set(edges) == {(b, a) for a, b in edges}
assert len(edges) == sum(e['to'] in stages for a in stages for e in exits[a])
removed = [row for row in plan['removed_editor_routes'] if all(k in mapping for k in row['fields'])]
for row in removed:
    a, b = (mapping[k] for k in row['fields'])
    assert (a,b) not in edges and (b,a) not in edges, row
adopted = [row for row in plan['sites_only_route_review']
           if row['finding']=='field_studio_lab_connection' and all(k in mapping for k in row['fields'])]
for row in adopted:
    for path in row['runtime_paths'].values():
        assert all((a,b) in all_edges for a,b in zip(path,path[1:])), row
travel_modes = Counter(
    next((mode for key,mode in (('boatSeconds','boat'),('waterwaySeconds','waterway'),
                               ('liftSeconds','lift'),('y','raised')) if key in edge), 'walk')
    for edge in edges.values()
)


def on_platform(stage, x, y):
    return any(p['y'] == y and p['x'] <= x <= p['x'] + p['w'] for p in nodes[stage]['platforms'])


for (a, b), gate in edges.items():
    assert on_platform(a, gate['x'], gate.get('y', 480)), (a, b)
    if 'arrivalX' in gate:
        assert on_platform(b, gate['arrivalX'], gate.get('arrivalY', 480)), (a, b)
for key, stage in mapping.items():
    n, spec = nodes[stage], points[key]
    pin = n['waypoint']
    assert n['mapPoint'] == key and cover['stage_links'][key]['stage_id'] == stage
    assert pin['kind'] == spec['kind'] and pin.get('floor') == spec.get('point_group')
    if spec.get('point_group'):
        marker_exits = [gate for gate in n['exits'] if gate['to'] in stages]
        assert any('liftSeconds' in gate or 'waterwaySeconds' in gate for gate in marker_exits)
        assert all('liftSeconds' in gate or 'waterwaySeconds' in gate or gate.get('studioRoute')
                   for gate in marker_exits)
    assert {nodes[e['to']]['mapPoint'] for e in n['exits'] if 'mapPoint' in nodes[e['to']]} == (
        set(cover['stage_links'][key]['gates']))
    assert on_platform(stage, pin['x'], pin['y'])
mine_stages = {n['id'] for n in nodes.values() if n.get('mapPoint', '').startswith('map9:')}
assert len(mine_stages) == 15
assert all(nodes[n]['waypoint']['kind'] == 'waypoint' for n in mine_stages)
assert 'liftSeconds' in edges[shaft['surface'], mine] and 'liftSeconds' in edges[mine, shaft['surface']]

parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path, help='Earned late-Liyue checkpoint at the harbor')
args = parser.parse_args()
lua, core = runtime()
source_save = None
if args.from_save:
    raw = args.from_save.read_bytes()
    state = core.restore(lua.table_from(validate_save(json.loads(raw)),recursive=True),46)
    assert state.story.node=='liyue-harbor' and not state.auto
    source_save = {'path':args.from_save.name,'level':state.progression.level,'sha256':sha256(raw).hexdigest()}
else:
    state = core.new(46)
    core.action(state, 'campaign')
    core.grantExp(state, sum(core.expNeeded(lv) for lv in range(1, 46)), 'quest')
    assert state.progression.level == 46
    core.enterStoryNode(state, 'liyue-harbor')
(ROOT / 'work').mkdir(exist_ok=True)
write('work/liyue-waypoint-browser-save.json', validate_save(native(core.checkpoint(state))))
trail = TrailWalk(lua, core, state, edges, exits)
assert trail.explore() == stages and trail.crossings == set(edges)
west, shelf, chamber = 'liyue-wp-64826','liyue-wp-64827','liyue-wp-64849'
stone_routes = []
for a,b,mode,label in (
    (west,chamber,'walk','西峰の石室へ続く横穴'),
    (chamber,west,'walk','西岸の道へ戻る横穴'),
    (shelf,chamber,'lift','西峰の石室へ降りる昇降機'),
    (chamber,shelf,'lift','西峰の石棚へ上がる昇降機'),
):
    core.action(state,'story_fast:'+a)
    assert state.story.node == a
    core.action(state,'world_map_focus:'+b)
    guide = core.frame(state,'sprite','legacy').worldMap.guide
    assert guide.status=='ready' and len(guide.stops)==1
    leg=guide.stops[1]
    assert (leg['from'],leg.id,leg.mode)==(a,b,mode) and label in leg.hint
    core.action(state,'world_map_close')
    trail.cross(b,leg.gateX)
    stone_routes.append({'from':a,'to':b,'mode':mode,'hint':leg.hint})

detours = []
detour_walk = TrailWalk(lua,core,state,all_edges,exits)
for a,b in (('liyue-field','liyue-wp-100'),('liyue-wp-110','primo-approach')):
    assert (a,b) not in edges
    core.action(state,'story_fast:'+a)
    assert state.story.node == a
    approach = detour_walk.follow_atlas(b)
    returning = detour_walk.follow_atlas(a)
    assert len(approach)>1 and len(returning)>1
    detours.append({'from':a,'to':b,'approach':approach,'returning':returning})

routes = ['liyue-mapped-east-shore', 'liyue-mapped-hidden-cave', 'liyue-mapped-chasm-shaft']
for id in routes:
    quest = quests[id]
    core.action(state, 'story_fast:' + quest['hub'])
    assert state.story.node == quest['hub']
    core.action(state, 'story_accept:' + id)
    record = state.story.quests[id]
    assert record.status == 'active'
    start = quest['itinerary'][0]['node']
    core.action(state, 'story_fast:' + start)
    assert state.story.node == start and record.count == 0
    core.action(state, 'story_fast:' + quest['hub'])
    for i, step in enumerate(quest['itinerary'], 1):
        if step['kind'] == 'arrive':
            assert state.story.node == step['from']
            trail.cross(step['node'])
        else:
            assert state.story.node == step['node']
            trail.approach(step['x'], step['y'], id)
            core.action(state, 'story_collect')
        assert record.count == i, (id, i, step, state.storyNotice)
    core.action(state, 'story_fast:' + quest['hub'])
    xp, mora = state.progression.questXp, state.mora
    for _ in range(2):
        core.action(state, 'story_report:' + id)
    assert record.status == 'complete' and record.cycles == 1
    assert (state.progression.questXp - xp, state.mora - mora) == (quest['xp'], quest['mora'])

core.action(state, 'story_fast:' + mine)
assert state.story.node == mine
depth = next(e for e in nodes[mine]['exits'] if e['to'] == 'chasm-depth')
trail.approach(depth['x'], depth.get('y', 480), depth['to'])
core.action(state, 'story_nearby_portal')
assert state.story.node == depth['to']
core.action(state, 'story_fast:liyue-harbor')
core.action(state, 'story_fast:' + depth['to'])
assert state.story.node == depth['to']
pin = nodes[depth['to']]['waypoint']
assert (trail.actor.x, trail.actor.y) == (pin['x'], pin['y'])

checkpoint = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(checkpoint, recursive=True))
assert all(restored.story.visited[s] for s in stages | {depth['to']})
assert state.returns == 0
assert all(restored.story.quests[id].status == 'complete' and restored.story.quests[id].cycles==1 for id in routes)
write('evidence/liyue-waypoint-test.json', {
    'markers': len(mapping),
    'reciprocal_routes': len(trail.crossings) // 2,
    'directed_crossings': len(trail.crossings),
    'directed_marker_crossings': sum(a in markers and b in markers for a,b in trail.crossings),
    'travel_modes': travel_modes,
    'reviewed_studio_pairs': len(adopted),
    'editor_deletions_confirmed_absent': len(removed),
    'stone_chamber_routes': stone_routes,
    'current_detours': detours,
    'source_save': source_save,
    'party_wipes': state.returns,
    'stage_ids': sorted(stages),
    'floor_connectors': review['grouped_markers'],
    'reported_quests': routes,
    'connected_existing_mine': depth['to'],
    'all_existing_underground_markers_enabled_for_warp': 15,
    'visited_and_quest_states_restored': True,
})
print(f'Walked {len(trail.crossings)} directed gates over {len(mapping)} Liyue markers and reported {len(routes)} quests.')
