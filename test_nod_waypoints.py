"""Walk the two catalogs, including island crossings and both dark platforms."""

from argparse import ArgumentParser
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))


def write(path,data):
    (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


graph=read('content/story-graph.json')
nodes={n['id']:n for n in graph['nodes']}
quests={q['id']:q for q in graph['quests']}
cat=read('content/map-catalog.json')
review=read('sources/map-research/nod-marker-review.json')
plan=read('design/world/atlas-route-plan.json')
coverage=read('content/coverage.json')['map_catalog']['stage_links']
points={p['id']:p for p in cat['nodes'] if p['map_id']==40 or p['map_id']==2 and p['area_id']==13}
mapping=review['stage_by_marker']
assert set(mapping)==set(points)=={p for ids in review['areas'].values() for p in ids}
assert len(set(mapping.values()))==len(mapping)==123
assert sum(p['map_id']==2 for p in points.values())==90
assert sum(p['map_id']==40 for p in points.values())==33
for spec in review['sources']:
    assert spec['map_version']==next(m['map_version'] for m in cat['maps'] if m['id']==spec['map_id'])
assert review['floor_markers']=={k:p['point_group'] for k,p in points.items() if p.get('point_group')}
assert len(review['floor_markers'])==34

stages=set(mapping.values())
exits={i:n['exits'] for i,n in nodes.items()}
edges={(a,e['to']):e for a in stages for e in exits[a] if e['to'] in stages}
assert set(edges)=={(b,a) for a,b in edges}
assert len(edges)==sum(e['to'] in stages for a in stages for e in exits[a])
removed=[row for row in plan['removed_editor_routes'] if all(k in mapping for k in row['fields'])]
for row in removed:
    a,b=(mapping[k] for k in row['fields'])
    assert (a,b) not in edges and (b,a) not in edges, row
adopted=[row for row in plan['sites_only_route_review']
         if row['finding']=='field_studio_lab_connection' and all(k in mapping for k in row['fields'])]
for row in adopted:
    for path in row['runtime_paths'].values():
        assert all(any(e['to']==b for e in exits[a]) for a,b in zip(path,path[1:])), row
travel_modes=Counter(
    next((mode for key,mode in (('boatSeconds','boat'),('liftSeconds','lift'),('waterwaySeconds','waterway'),
                               ('darkOnly','shadow_gate'),('y','raised')) if key in edge), 'walk')
    for edge in edges.values()
)
assert {(a,b) for (a,b),e in edges.items() if e.get('darkOnly')}=={
    (row['from'],row['to']) for row in review['dark_gates']}


def solid(platforms,x,y):
    return any(p['y']==y and p['x']<=x<=p['x']+p['w'] for p in platforms)


for (a,b),edge in edges.items():
    platforms=nodes[a]['platforms']
    if edge.get('darkOnly'):
        assert not solid(platforms,edge['x'],edge['y'])
        platforms=platforms+[nodes[a]['localLight']['bridge']]
    assert solid(platforms,edge['x'],edge.get('y',480)),(a,b)
    if 'arrivalX' in edge:
        assert solid(nodes[b]['platforms'],edge['arrivalX'],edge.get('arrivalY',480)),(a,b)
for key,stage in mapping.items():
    pin=nodes[stage]['waypoint']
    assert nodes[stage]['mapPoint']==key and coverage[key]['stage_id']==stage
    assert (pin['kind'],pin.get('floor'))==(points[key]['kind'],points[key].get('point_group'))
    assert solid(nodes[stage]['platforms'],pin['x'],pin['y'])
transition=review['frostmoon_transition']
assert transition['mode'] in edges[transition['from'],transition['to']]
assert transition['mode'] in edges[transition['to'],transition['from']]
assert sum(row['to']==transition['to'] and row['from']==transition['from'] for row in review['floor_connections'])==0


class LightTrail(TrailWalk):
    def cross(self,target,gate_x=None):
        origin=self.state.story.node
        if self.edges[origin,target].get('darkOnly') and self.state.storyLightMode=='bright':
            self.switch_light()
        super().cross(target,gate_x)

    def switch_light(self):
        control=nodes[self.state.story.node]['localLight']['controls'][0]
        self.approach(control['x'],control['y'],'light control')
        self.core.action(self.state,'story_collect')


parser=ArgumentParser(description=__doc__)
parser.add_argument('--voyage-save',type=Path,help='Earned Lv120 entry checkpoint at Natlan port')
parser.add_argument('--from-save',type=Path,help='Earned late-game checkpoint with Nod-Krai port visited')
args=parser.parse_args()
if bool(args.from_save)!=bool(args.voyage_save):
    parser.error('--from-save and --voyage-save must be supplied together')
lua,core=runtime()
source_saves={}


def restore_source(path,key):
    raw=path.read_bytes()
    restored=core.restore(lua.table_from(validate_save(json.loads(raw)),recursive=True),16)
    assert not restored.auto
    source_saves[key]={'path':path.name,'level':restored.progression.level,'sha256':sha256(raw).hexdigest()}
    return restored


if args.voyage_save:
    state=restore_source(args.voyage_save,'voyage')
    assert state.story.node=='natlan-port' and state.progression.level==120
else:
    state=core.new(16)
    core.action(state,'campaign')
    core.grantExp(state,sum(core.expNeeded(level) for level in range(1,139)),'quest')
    assert state.progression.level==139
    core.enterStoryNode(state,'natlan-port')
(ROOT/'work').mkdir(exist_ok=True)
boarding=next(e for e in exits['natlan-port'] if e['to']=='natlan-voyage')
board=TrailWalk(lua,core,state,{('natlan-port','natlan-voyage'):boarding},exits)
board.cross('natlan-voyage')
assert state.voyage.total==90
for _ in range(5400):
    if state.story.node=='nod-port':
        break
    core.step(state,1/60,board.idle)
assert state.story.node=='nod-port' and state.story.visited['nod-port']
if args.from_save:
    state=restore_source(args.from_save,'survey')
    core.action(state,'story_fast:nod-port')
    assert state.story.node=='nod-port' and not state.story.visited['nod-wp-88170']
write('work/nod-waypoint-entry-browser-save.json',validate_save(native(core.checkpoint(state))))
trail=LightTrail(lua,core,state,edges,exits)


def follow(*route):
    for stage in route:trail.cross(stage)


def warp(target):
    core.action(state,'story_fast:'+target)
    assert state.story.node==target


def accept(id):
    core.action(state,'story_accept:'+id)
    assert state.story.quests[id].status=='active'


def gate_is_visible(target):
    f=core.frame(state,'sprite','legacy')
    return any(e.to==target for e in f.storyPortals.values())


def verify_light_gate(target):
    origin=state.story.node
    assert state.storyLightMode=='bright' and not gate_is_visible(target)
    guide=atlas_guide(target)
    assert len(guide.stops)==1 and '操作盤でGを押して消灯し、影の足場へ' in guide.stops[1].hint
    trail.switch_light()
    assert state.storyLightMode=='dark' and gate_is_visible(target)
    assert '消灯中。影の足場へ' in atlas_guide(target).stops[1].hint
    gate=edges[origin,target]
    trail.approach(gate['x'],gate['y'],target)
    assert trail.actor.ground and trail.actor.y==gate['y']


def atlas_guide(target):
    core.action(state,'world_map_focus:'+target)
    guide=core.frame(state,'sprite','legacy').worldMap.guide
    core.action(state,'world_map_close')
    assert guide.status=='ready', (state.story.node,target,guide.status,guide.reason)
    return guide


def complete(id):
    quest,record=quests[id],state.story.quests[id]
    for i,step in enumerate(quest['itinerary'],1):
        if step['kind']=='arrive':
            assert state.story.node==step['from']
            if edges[step['from'],step['node']].get('darkOnly'):
                verify_light_gate(step['node'])
            trail.cross(step['node'])
            if nodes[step['node']].get('localLight'):
                assert state.storyLightMode=='bright'
        else:
            assert state.story.node==step['node']
            trail.approach(step['x'],step['y'],id)
            core.action(state,'story_collect')
        assert record.count==i,(id,i,step,state.storyNotice)
    warp(quest['hub'])
    xp,mora=state.progression.questXp,state.mora
    for _ in range(2):core.action(state,'story_report:'+id)
    assert record.status=='complete' and record.cycles==1
    assert (state.progression.questXp-xp,state.mora-mora)==(quest['xp'],quest['mora'])


harbor,shadow,bay,frost=('nod-mapped-harbor-lamp','nod-mapped-paha-shadow','nod-mapped-north-bay','nod-mapped-frostmoon-shadow')
accept(harbor)
complete(harbor)
warp('nod-town')
accept(shadow)
shore,lamp,deep='nod-wp-88162','nod-wp-88169','nod-wp-88170'
shadow_approach=trail.follow_atlas(shore)
assert edges[shore,deep]['visitedOnly'] and not state.story.visited[deep]
shortcut=edges[shore,deep]
trail.approach(shortcut['x'],shortcut.get('y',480),deep)
assert not gate_is_visible(deep)
core.action(state,'story_portal:'+deep)
assert state.story.node==shore
first_visit=[step.id for step in atlas_guide(deep).stops.values()]
assert first_visit==[lamp,deep]
complete(shadow)
warp(shore)
after_visit=atlas_guide(deep)
assert len(after_visit.stops)==1 and '初回訪問後に通れる近道' in after_visit.stops[1].hint
assert trail.follow_atlas(deep)==[deep]
assert trail.follow_atlas(shore)==[shore]
follow('nod-wp-88168','nod-wp-92867','nod-north-harbor')
accept(bay)
complete(bay)
follow('nod-wp-92868','nod-wp-92870','nod-wp-92871','nod-wp-92872','nod-wp-99218','nod-wp-99223','nod-wp-99219')
write('work/nod-waypoint-browser-save.json',validate_save(native(core.checkpoint(state))))
follow('frostmoon-camp')
accept(frost)
follow('frost-wp-99282','frost-wp-99284','frost-wp-99285','frost-wp-99288','frost-wp-99291','frost-wp-99293',
       'frost-wp-99294','frost-wp-99297','frost-wp-99298','frost-wp-99308')
complete(frost)

sweep=LightTrail(lua,core,state,edges,exits)
assert sweep.explore()==stages and sweep.crossings==set(edges)
assert state.returns==0
saved=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(saved,recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status=='complete' and restored.story.quests[q].cycles==1
           for q in [harbor,shadow,bay,frost])
restored_walk=LightTrail(lua,core,restored,edges,exits)
core.action(restored,'story_fast:'+shore)
restored_shortcut=restored_walk.follow_atlas(deep)
assert restored_shortcut==[deep]
north_statue,west_height='nod-wp-88128','nod-wp-88144'
assert (north_statue,west_height) not in edges
core.action(restored,'story_fast:'+north_statue)
rim_detour=restored_walk.follow_atlas(west_height)
assert len(rim_detour)>1
core.action(restored,'story_fast:frost-wp-99311')
assert restored.story.node=='frost-wp-99311' and restored.storyLightMode=='bright'

write('evidence/nod-waypoint-test.json',{
    'nod_krai':90,'frostmoon':33,'layered_markers':len(review['floor_markers']),
    'stage_ids':sorted(stages),'reciprocal_paths':len(edges)//2,'directed_paths':len(sweep.crossings),
    'travel_modes':travel_modes,'reviewed_studio_pairs':len(adopted),
    'editor_deletions_confirmed_absent':len(removed),'source_saves':source_saves,'party_wipes':state.returns,
    'shadow_approach':shadow_approach,'first_visit_via':first_visit,'after_visit_shortcut':restored_shortcut,
    'rim_detour_after_removal':{'from':north_statue,'to':west_height,'stops':rim_detour},
    'arrival_from_existing_natlan_voyage':True,'two_dark_gates':review['dark_gates'],
    'light_resets_on_return_and_restore':True,'reported_quests':[harbor,shadow,bay,frost],
    'restored_visits_and_quests':True,
})
print(f'Crossed {len(sweep.crossings)} directed gates at {len(mapping)} markers and reported four quests.')
