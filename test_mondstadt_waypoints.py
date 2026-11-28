"""Exercise the 51 Mondstadt markers, linked gates, itineraries and fast travel in Lua."""

from argparse import ArgumentParser
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

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
plan = read('design/world/atlas-route-plan.json')
points = {p['id']: p for p in catalog['nodes'] if p['map_id'] == 2 and p['area_id'] == 1}
mapping = reference['stage_by_marker']
assert set(points) == set(mapping) == {p for area in reference['areas'].values() for p in area}
assert sorted(map(len, reference['areas'].values())) == [13, 13, 25]
assert len(set(mapping.values())) == len(points) == 51
assert reference['map_version'] == next(m['map_version'] for m in catalog['maps'] if m['id'] == 2)
stages = set(mapping.values())
exits = {a: n['exits'] for a, n in nodes.items()}
edges = {(a, e['to']): e for a in stages for e in exits[a] if e['to'] in stages}
all_edges = {(a, e['to']): e for a in exits for e in exits[a]}
assert len(edges) == sum(e['to'] in stages for a in stages for e in exits[a])
removed = [row for row in plan['removed_editor_routes'] if all(k in mapping for k in row['fields'])]
for row in removed:
    a,b = (mapping[k] for k in row['fields'])
    assert (a,b) not in edges and (b,a) not in edges, row
adopted = [row for row in plan['sites_only_route_review']
           if row['finding']=='field_studio_lab_connection' and all(k in mapping for k in row['fields'])]
for row in adopted:
    for path in row['runtime_paths'].values():
        assert all((a,b) in all_edges for a,b in zip(path,path[1:])), row
assert 'boatSeconds' in edges['mond-wp-95799','mond-wp-95797']
assert 'liftSeconds' in edges['mond-wp-95798','mond-wp-95803']
island, underport = 'mond-wp-95799','mond-wp-95803'
for a,b in ((island,underport),(underport,island)):
    assert edges[a,b]['studioMode']=='road'
    assert not edges[a,b].keys() & {'boatSeconds','liftSeconds','waterwaySeconds'}
assert ('mond-wp-95797','mond-wp-95803') not in edges
assert [nodes[f'mond-wp-{id}']['level'] for id in (95794,95795,95782,95798,95803)] == [155,158,160,162,169]
travel_modes=Counter(
    next((mode for key,mode in (('boatSeconds','boat'),('liftSeconds','lift'),('y','raised'))
          if key in edge), 'walk')
    for edge in edges.values()
)


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

parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path, help='Earned late-game checkpoint with Mondstadt visited')
parser.add_argument('--lower-save', type=Path, help='Earned checkpoint at Lv160–168 for the port gate')
args = parser.parse_args()
lua, core = runtime()
source_saves = {}


def restore_source(path,key):
    raw=path.read_bytes()
    restored=core.restore(lua.table_from(validate_save(json.loads(raw)),recursive=True),12)
    assert not restored.auto
    source_saves[key]={'path':path.name,'sha256':sha256(raw).hexdigest(),'level':restored.progression.level}
    return restored


if args.from_save:
    state = restore_source(args.from_save,'survey')
    core.action(state,'story_fast:mond-town')
    assert state.story.node=='mond-town'
else:
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, sum(core.expNeeded(lv) for lv in range(1, 175)), 'quest')
    assert state.progression.level == 175
(ROOT / 'work').mkdir(exist_ok=True)
write('work/mondstadt-waypoint-browser-save.json', validate_save(native(core.checkpoint(state))))
# The only existing quest-locked door between pins stays locked until the legacy quest is accepted.
core.action(state, 'story_fast:mond-wp-55')
assert state.story.node == 'mond-town' and not state.story.visited['mond-wp-55']
if not args.from_save:
    state.story.quests['amber-join'] = lua.table_from(
        {'status': 'complete', 'count': quests['amber-join']['goal'], 'cycles': 1})
    core.action(state, 'story_accept:mond-rest-stop')
    assert state.story.quests['mond-rest-stop'].status == 'active'

trail = TrailWalk(lua, core, state, edges, exits)
visited = trail.explore()
walked = trail.crossings.copy()
assert visited == stages and walked == set(edges)
detour_walk = TrailWalk(lua,core,state,all_edges,exits)
quest_approaches = []
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
            if state.story.node != step['from']:
                progress=state.story.quests[quest_id].count
                approach=detour_walk.follow_atlas(step['from'])
                assert state.story.quests[quest_id].count==progress
                quest_approaches.append({'quest':quest_id,'before_step':i,'stops':approach})
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

retired_routes = []
for a,b in (('mond-wp-14','mond-wp-19'),('mond-wp-6601','mond-wp-6537')):
    assert (a,b) not in edges
    core.action(state,'story_fast:'+a)
    assert state.story.node==a
    approach=detour_walk.follow_atlas(b)
    returning=detour_walk.follow_atlas(a)
    assert len(approach)>1 and len(returning)>1
    retired_routes.append({'from':a,'to':b,'outward':approach,'returning':returning})

assert state.returns==0
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

if args.lower_save:
    low_port=restore_source(args.lower_save,'port_gate')
    core.action(low_port,'story_fast:dornman-camp')
    if low_port.story.node!='dornman-camp':
        core.action(low_port,'story_fast:mond-town')
        assert low_port.story.node=='mond-town'
        TrailWalk(lua,core,low_port,all_edges,exits).follow_atlas('dornman-camp')
else:
    low_port=core.new(12)
    core.action(low_port,'story_start')
    core.grantExp(low_port,sum(core.expNeeded(lv) for lv in range(1,168)),'quest')
    core.enterStoryNode(low_port,'dornman-camp')
assert 162<=low_port.progression.level<169 and low_port.story.node=='dornman-camp'
write('work/mondstadt-port-entry-browser-save.json',validate_save(native(core.checkpoint(low_port))))
port_walk=TrailWalk(lua,core,low_port,edges,exits)
port_walk.cross('mond-wp-95797')
port_walk.cross(island)
gate=edges[island,underport]
port_walk.approach(gate['x'],gate.get('y',480),underport)
closed=core.frame(low_port,'sprite','legacy').storyNearbyPortal
assert closed.to==underport and not closed.available and closed.level==169
core.action(low_port,'world_map_focus:'+underport)
blocked_route=core.frame(low_port,'sprite','legacy').worldMap.guide
assert blocked_route.status=='blocked' and blocked_route.requiredLevel==169
assert len(blocked_route.stops)==1 and blocked_route.stops[1].hint=='港の下層へ続く連絡坑道'
core.action(low_port,'world_map_close')
core.action(low_port,'story_nearby_portal')
assert low_port.story.node==island
blocked_level=low_port.progression.level
core.grantExp(low_port,sum(core.expNeeded(lv) for lv in range(blocked_level,169))-low_port.progression.xp,'quest')
assert low_port.progression.level==169
port_walk.cross(underport)
port_walk.cross(island)

write('evidence/mondstadt-waypoint-test.json', {
    'markers': len(mapping),
    'visited_stages': sorted(visited),
    'directed_gates_walked': [list(pair) for pair in sorted(walked)],
    'reported_quests': list(quest_ids),
    'source_saves': source_saves, 'party_wipes':state.returns, 'travel_modes':travel_modes,
    'reviewed_studio_pairs':len(adopted), 'editor_deletions_confirmed_absent':len(removed),
    'quest_approaches':quest_approaches, 'current_detours':retired_routes,
    'port_tunnel':{'from':island,'to':underport,'blocked_at':blocked_level,'opened_at':169},
    'save_restored': True,
    'unvisited_fast_travel_rejected': True,
    'fast_travel_does_not_advance_arrival_steps': True,
    'underleveled_gate_rejected': True,
})
print(f'Walked {len(walked)} directed gates across {len(visited)} markers and reported {len(quest_ids)} itineraries.')
