"""Traverse the Fontaine catalog on foot, through rides and using ordinary swim input."""

import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {n['id']:n for n in graph['nodes']}
quests = {q['id']:q for q in graph['quests']}
cat = read('content/map-catalog.json')
review = read('sources/map-research/fontaine-marker-review.json')
stats = read('content/coverage.json')['map_catalog']
points = {p['id']:p for p in cat['nodes'] if p['map_id']==34 or p['map_id']==2 and p['area_id']==8}
mapping = review['stage_by_marker']
assert set(points) == set(mapping) == {p for pins in review['areas'].values() for p in pins}
assert len(set(mapping.values())) == len(points) == 117
assert sum(p['map_id']==2 for p in points.values()) == 100
assert sum(p['map_id']==34 for p in points.values()) == 17
for spec in review['sources']:
    assert spec['map_version'] == next(m['map_version'] for m in cat['maps'] if m['id'] == spec['map_id'])

floors = {p['id']:p['point_group'] for p in points.values() if p.get('point_group')}
assert floors == review['floor_markers'] and len(floors) == 49
stages = set(mapping.values())
exits = {key:n['exits'] for key,n in nodes.items()}
edges = {(a,e['to']):e for a in stages for e in exits[a] if e['to'] in stages}
assert set(edges) == {(b,a) for a,b in edges} and len(edges) == 300
for key,count in [('boatSeconds',14),('liftSeconds',30),('waterwaySeconds',48)]:
    assert sum(key in edge for edge in edges.values()) == count


def accessible(stage, x, y):
    n = nodes[stage]
    if 'swim' in n:
        return 20 <= x <= n['width']-20 and n['swim']['top'] <= y <= n['swim']['bottom']
    return any(p['y']==y and p['x']<=x<=p['x']+p['w'] for p in n['platforms'])


for (a,b), gate in edges.items():
    assert accessible(a,gate['x'],gate.get('y',480)), (a,b)
    if 'arrivalX' in gate:
        assert accessible(b,gate['arrivalX'],gate.get('arrivalY',480)), (a,b)
for key, stage in mapping.items():
    node = nodes[stage]
    pin = node['waypoint']
    assert node['mapPoint'] == key and stats['stage_links'][key]['stage_id'] == stage
    assert (pin['kind'],pin.get('floor')) == (points[key]['kind'],floors.get(key))
    assert accessible(stage,pin['x'],pin['y'])
    assert {nodes[e['to']]['mapPoint'] for e in node['exits'] if 'mapPoint' in nodes[e['to']]} == (
        set(stats['stage_links'][key]['gates']))
assert {p for p,s in mapping.items() if nodes[s].get('swim')} == set(review['swim_markers'])
assert len(review['swim_markers']) == 37
adaptation = review['sites_terrain_adaptation']
for a,b in [adaptation['dry_to_waterway'], *adaptation['added_waterways']]:
    assert edges[a,b]['waterwaySeconds'] and edges[b,a]['waterwaySeconds']
assert [nodes['fon-wp-'+str(id)]['level'] for id in (50073,50074,50075,50076)] == [86,87,88,93]
undersea = review['bygone_undersea_link']
assert undersea['mode'] in edges[undersea['from'],undersea['to']]
assert undersea['mode'] in edges[undersea['to'],undersea['from']]

lua, core = runtime()
state = core.new(16)
core.action(state,'campaign')
core.grantExp(state,sum(core.expNeeded(level) for level in range(1,99)),'quest')
assert state.progression.level == 99
core.enterStoryNode(state,'fontaine-hub')
(ROOT/'work').mkdir(exist_ok=True)
write('work/fontaine-waypoint-browser-save.json',validate_save(native(core.checkpoint(state))))
trail = TrailWalk(lua,core,state,edges,exits)


def follow(*route):
    for place in route:
        trail.cross(place)


def warp(target):
    core.action(state,'story_fast:'+target)
    assert state.story.node == target


def accept(q):
    core.action(state,'story_accept:'+q)
    assert state.story.quests[q].status == 'active'


def wrong_depth_check(target):
    origin = state.story.node
    gate = edges[origin,target]
    assert abs(trail.actor.y-gate['y'])>=60
    trail.approach(gate['x'],trail.actor.y,target)
    core.action(state,'story_portal:'+target)
    assert state.story.node==origin and state.lift is None and '門の近く' in state.storyNotice
    original_y = trail.actor.y
    core.action(state,'pause')
    core.step(state,1/60,trail.inputs['up'])
    assert trail.actor.y==original_y
    core.action(state,'pause')
    core.step(state,1/60,trail.inputs['up'])
    assert trail.actor.y<original_y


def complete(q):
    quest,state_q = quests[q],state.story.quests[q]
    for i,step in enumerate(quest['itinerary'],1):
        if step['kind']=='arrive':
            assert state.story.node==step['from']
            if step['node']=='fon-wp-50065':
                wrong_depth_check(step['node'])
            trail.cross(step['node'])
        else:
            assert state.story.node==step['node']
            trail.approach(step['x'],step['y'],q)
            core.action(state,'story_collect')
        assert state_q.count==i,(q,i,step,state.storyNotice)
    warp(quest['hub'])
    assert not state.storySwimming
    xp,mora=state.progression.questXp,state.mora
    for _ in range(2):core.action(state,'story_report:'+q)
    assert state_q.status=='complete' and state_q.cycles==1
    assert (state.progression.questXp-xp,state.mora-mora)==(quest['xp'],quest['mora'])


samples, lock, marsh, nostoi = ('fon-mapped-depth-samples','fon-mapped-north-lock',
                                'fon-mapped-bygone-current','fon-mapped-nostoi-record')
core.action(state,'story_fast:fon-wp-50065')
assert state.story.node=='fontaine-hub' and not state.story.visited['fon-wp-50065']
accept(samples)
complete(samples)
accept(lock)
follow('fon-wp-50050','fon-wp-50056','fon-wp-53867')
complete(lock)
follow('fontaine-field','bygone-camp')
accept(marsh)
complete(marsh)
warp('fontaine-hub')
accept(nostoi)
follow('nostoi-castle-approach')
complete(nostoi)

sweep = TrailWalk(lua,core,state,edges,exits)
assert sweep.explore()==stages and sweep.crossings==set(edges)
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved,recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status=='complete' for q in [samples,lock,marsh,nostoi])
core.action(restored,'story_fast:fon-wp-50065')
assert restored.storySwimming and restored.story.node=='fon-wp-50065'
a=restored.actors[restored.active]
pin=nodes['fon-wp-50065']['waypoint']
assert (a.x,a.y)==(pin['x'],pin['y'])
a.cd.normal=1
for _ in range(300):core.step(restored,1/60,sweep.inputs['up'])
assert a.cd.normal==0
assert a.y==restored.storySwimming.top
for _ in range(300):core.step(restored,1/60,sweep.inputs['down'])
assert a.y==restored.storySwimming.bottom
core.action(restored,'story_fast:fontaine-hub')
assert not restored.storySwimming and restored.story.node=='fontaine-hub'

write('evidence/fontaine-waypoint-test.json',{
    'fontaine_markers':100,'bygone_markers':17,'floor_markers':len(floors),
    'swimmable_stages':len(review['swim_markers']),'reciprocal_routes':len(sweep.crossings)//2,
    'directed_gates':len(sweep.crossings),'visited_stages':sorted(stages),
    'wrong_depth_rejected':True,'pause_and_swim_bounds_verified':True,
    'reported_quests':[samples,lock,marsh,nostoi],'restored_visits_and_swim_warp':True,
})
print(f'Walked or swam through {len(sweep.crossings)} directed gates at {len(stages)} markers, with four quest reports.')
