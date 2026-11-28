"""Traverse Natlan, Sacred Mountain and Sky Temple with movement and voyage actions."""

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


def write(path, data):
    (ROOT/path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {n['id']:n for n in graph['nodes']}
quests = {q['id']:q for q in graph['quests']}
cat = read('content/map-catalog.json')
review = read('sources/map-research/natlan-marker-review.json')
plan = read('design/world/atlas-route-plan.json')
coverage = read('content/coverage.json')['map_catalog']['stage_links']
points = {p['id']:p for p in cat['nodes'] if
          p['map_id'] in (36,37) or p['map_id'] == 2 and p['area_id'] == 11}
mapping = review['stage_by_marker']
assert set(mapping) == set(points) == {p for pins in review['areas'].values() for p in pins}
assert len(set(mapping.values())) == len(mapping) == 174
assert {m:sum(p['map_id']==m for p in points.values()) for m in (2,36,37)} == {2:135,36:19,37:20}
for source in review['sources']:
    assert source['map_version'] == next(m['map_version'] for m in cat['maps'] if m['id']==source['map_id'])
assert review['floor_markers'] == {k:p['point_group'] for k,p in points.items() if p.get('point_group')}
assert len(review['floor_markers']) == 49
voyage = review['voyage_connector']
stages = set(mapping.values()) | {voyage}
exits = {key:n['exits'] for key,n in nodes.items()}
edges = {(a,e['to']):e for a in stages for e in exits[a] if e['to'] in stages}
all_edges = {(a,e['to']):e for a in exits for e in exits[a]}
assert set(edges) == {(b,a) for a,b in edges}
assert len(edges) == sum(e['to'] in stages for a in stages for e in exits[a])
removed = [row for row in plan['removed_editor_routes'] if all(k in mapping for k in row['fields'])]
removed_pairs = set()
for row in removed:
    a,b = (mapping[k] for k in row['fields'])
    assert (a,b) not in edges and (b,a) not in edges, row
    removed_pairs.add(frozenset((a,b)))
adopted = [row for row in plan['sites_only_route_review']
           if row['finding']=='field_studio_lab_connection' and all(k in mapping for k in row['fields'])]
for row in adopted:
    for path in row['runtime_paths'].values():
        assert all(any(e['to']==b for e in exits[a]) for a,b in zip(path,path[1:])), row
travel_modes = Counter(
    'ship_deck' if voyage in (a,b) else
    next((mode for key,mode in (('boatSeconds','boat'),('liftSeconds','lift'),
                               ('waterwaySeconds','waterway'),('y','raised')) if key in edge), 'walk')
    for (a,b),edge in edges.items()
)
assert ('nat-wp-72760','nat-wp-72436') in edges  # Witztli quest approach
assert sum('animatedLift' in e for e in edges.values()) == 2


def platform_at(stage,x,y):
    return any(p['y']==y and p['x']<=x<=p['x']+p['w'] for p in nodes[stage]['platforms'])


for (a,b),edge in edges.items():
    assert platform_at(a,edge['x'],edge.get('y',480)), (a,b)
    if 'arrivalX' in edge:
        assert platform_at(b,edge['arrivalX'],edge.get('arrivalY',480)), (a,b)
for key,stage in mapping.items():
    node = nodes[stage]
    pin = node['waypoint']
    assert node['mapPoint'] == key and coverage[key]['stage_id'] == stage
    assert (pin['kind'],pin.get('floor')) == (points[key]['kind'],points[key].get('point_group'))
    assert platform_at(stage,pin['x'],pin['y'])
layer_nodes = {mapping[k]:v for k,v in review['floor_markers'].items()}
checked_floors = set()
retired_floor_links = []
for row in review['floor_connections']:
    a,b,mode = row['from'],row['to'],row['mode']
    assert b in layer_nodes
    if frozenset((a,b)) in removed_pairs:
        assert any(target==b for _,target in edges)
        retired_floor_links.append(row)
        checked_floors.add(b)
        continue
    assert (a,b) in edges and (b,a) in edges
    if mode == 'walk':
        assert layer_nodes[a] == layer_nodes[b]
    else:
        assert mode in edges[a,b] and mode in edges[b,a]
    checked_floors.add(b)
assert checked_floors == set(layer_nodes)
for row in review['layer_transitions']:
    a,b = row['from'],row['to']
    assert 'liftSeconds' in edges[a,b] and 'liftSeconds' in edges[b,a]
assert set(k for k,dest in edges if dest=='ochkanatlan-dock' and nodes[k]['region']!='オシカ・ナタ')=={voyage}

parser = ArgumentParser(description=__doc__)
parser.add_argument('--entry-save', type=Path, help='Earned Lv100 checkpoint at Natlan')
parser.add_argument('--from-save', type=Path, help='Earned late-game checkpoint with Natlan visited')
args = parser.parse_args()
lua,core = runtime()
source_saves = {}


def restore_source(path,key):
    raw=path.read_bytes()
    restored=core.restore(lua.table_from(validate_save(json.loads(raw)),recursive=True),16)
    assert not restored.auto
    source_saves[key]={'path':path.name,'level':restored.progression.level,'sha256':sha256(raw).hexdigest()}
    return restored


hub,quarry,rocky_road='natlan-hub','natlan-quarry-road','natlan-field'
if args.from_save:
    state=restore_source(args.from_save,'late')
    core.action(state,'story_fast:'+hub)
    assert state.story.node==hub
else:
    state = core.new(16)
    core.action(state,'campaign')
    core.grantExp(state,sum(core.expNeeded(level) for level in range(1,138)),'quest')
    assert state.progression.level==138
    core.enterStoryNode(state,hub)
(ROOT/'work').mkdir(exist_ok=True)
write('work/natlan-waypoint-port-browser-save.json',validate_save(native(core.checkpoint(state))))
entry = restore_source(args.entry_save,'entry') if args.entry_save else state
assert entry.story.node==hub
write('work/natlan-waypoint-entry-browser-save.json',validate_save(native(core.checkpoint(entry))))
entry_walk=TrailWalk(lua,core,entry,all_edges,exits)
quarry_out=entry_walk.follow_atlas(rocky_road)
quarry_back=entry_walk.follow_atlas(hub)
assert quarry_out==[quarry,rocky_road] and quarry_back==[quarry,hub]
assert entry.returns==0
trail = TrailWalk(lua,core,state,all_edges,exits)


def follow(*route):
    for stage in route:
        trail.cross(stage)


def warp(id):
    core.action(state,'story_fast:'+id)
    assert state.story.node==id


def accept(q):
    core.action(state,'story_accept:'+q)
    assert state.story.quests[q].status=='active'


def finish(q):
    quest,record = quests[q],state.story.quests[q]
    for i,step in enumerate(quest['itinerary'],1):
        assert step['kind']!='arrive' or state.story.node==step['from']
        if step['kind']=='arrive':
            if q==sky and step['from']=='nat-wp-96376' and step['node']=='nat-wp-96375':
                core.action(state,'world_map_focus:'+step['node'])
                sky_guide=core.frame(state,'sprite','legacy').worldMap.guide
                assert len(sky_guide.stops)==1 and sky_guide.stops[1].mode=='lift'
                assert '中段の足場を経由して上段へ' in sky_guide.stops[1].hint
                assert '中央の昇降台へ下りる' in sky_guide.stops[1].hint, sky_guide.stops[1].hint
                core.action(state,'world_map_close')
            trail.cross(step['node'])
        else:
            assert state.story.node==step['node']
            trail.approach(step['x'],step['y'],q)
            core.action(state,'story_collect')
        assert record.count==i,(q,i,step,state.storyNotice)
    warp(quest['hub'])
    xp,mora=state.progression.questXp,state.mora
    for _ in range(2):core.action(state,'story_report:'+q)
    assert record.status=='complete' and record.cycles==1
    assert (state.progression.questXp-xp,state.mora-mora)==(quest['xp'],quest['mora'])


valley,ochka,resort,mountain,sky=('nat-mapped-valley-trail','nat-mapped-ochka-supplies','nat-mapped-resort-canal',
                                'nat-mapped-mountain-layers','nat-mapped-sky-lift')
accept(valley)
valley_approach=trail.follow_atlas(quests[valley]['itinerary'][0]['from'])
finish(valley)
follow(quarry,rocky_road,'natlan-port',voyage)
dock='ochkanatlan-dock'
edge=edges[voyage,dock]
trail.approach(edge['x'],480,dock)
assert state.t-state.voyage.started<edge['windowStart']
core.action(state,'world_map_focus:'+dock)
dock_guide=core.frame(state,'sprite','legacy').worldMap.guide
assert dock_guide.status=='ready' and len(dock_guide.stops)==1
dock_window=native(dock_guide.stops[1].stopWindow)
assert dock_window['phase']=='waiting' and dock_window['seconds']>0
before_map_close=state.t
core.step(state,1/60,trail.idle)
assert state.t==before_map_close
core.action(state,'world_map_close')
core.action(state,'story_nearby_portal')
assert state.story.node==voyage and state.storyNotice=='寄港時間外'
follow(dock)
accept(ochka)
finish(ochka)
follow(voyage)
assert state.t-state.voyage.started>=edges[voyage,dock]['windowEnd']
follow('natlan-port','nat-resort-pier')
accept(resort)
finish(resort)
warp('natlan-hub')
follow(quarry,rocky_road,'nat-wp-72429','nat-wp-82575','nat-wp-82572','nat-wp-82558',
       'nat-wp-82559','nat-wp-82557','nat-wp-82560','nat-mountain-camp')
write('work/natlan-waypoint-browser-save.json',validate_save(native(core.checkpoint(state))))
accept(mountain)
follow('nat-wp-84104','nat-wp-84105','nat-wp-84106','nat-wp-84108')
finish(mountain)
follow('nat-wp-84104','nat-wp-84105','nat-wp-84106','nat-wp-84108','nat-wp-84109','nat-wp-84110','nat-sky-camp')
accept(sky)
follow('nat-wp-96366','nat-wp-96367','nat-wp-96373','nat-wp-96375')
finish(sky)

# A resumed ship has already left this dock. Traverse its four directed legs once
# through the timed journey above, then cover both land networks independently.
land_edges={pair:edge for pair,edge in edges.items() if voyage not in pair}
main=TrailWalk(lua,core,state,land_edges,exits)
visited=main.explore()
warp(dock)
islands=TrailWalk(lua,core,state,land_edges,exits)
visited.update(islands.explore())
visited.add(voyage)
crossings=main.crossings|islands.crossings|{pair for pair in trail.crossings if voyage in pair}
assert visited==stages and crossings==set(edges)
assert state.returns==0
saved=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(saved,recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status=='complete' and restored.story.quests[q].cycles==1
           for q in [valley,ochka,resort,mountain,sky])
floor_detours = []
floor_walk = TrailWalk(lua,core,restored,all_edges,exits)
for link in retired_floor_links:
    origin,destination=link['from'],link['to']
    core.action(restored,'story_fast:'+origin)
    assert restored.story.node==origin
    outward=floor_walk.follow_atlas(destination)
    inward=floor_walk.follow_atlas(origin)
    assert len(outward)>1 and len(inward)>1
    floor_detours.append({'from':origin,'to':destination,'outward':outward,'inward':inward})
core.action(restored,'story_fast:nat-wp-84121')
assert restored.story.node=='nat-wp-84121'
write('evidence/natlan-waypoint-test.json',{
    'map_counts':{'natlan':135,'ancient_sacred_mountain':19,'sky_temple':20},
    'markers':len(mapping),'floor_markers':len(review['floor_markers']),
    'visited_stages':sorted(stages),'reciprocal_routes_including_ship':len(crossings)//2,
    'directed_crossings':len(crossings),'timed_ship_stop_and_reboarding':True,
    'ship_window':{'start':edge['windowStart'],'end':edge['windowEnd'],'initial_map_window':dock_window},
    'directed_marker_crossings':len(crossings)-travel_modes['ship_deck'],'travel_modes':travel_modes,
    'reviewed_studio_pairs':len(adopted),'editor_deletions_confirmed_absent':len(removed),
    'retired_floor_links':retired_floor_links,
    'current_routes_for_retired_floor_links':floor_detours,
    'source_saves':source_saves,'party_wipes':state.returns,
    'quarry_routes':{'out':quarry_out,'back':quarry_back},'valley_approach':valley_approach,
    'animated_lift':review['animated_lift'],'reported_quests':[valley,ochka,resort,mountain,sky],
    'restored_visits_and_warp':True,
})
print(f'Walked or rode {len(crossings)} directed gates over {len(mapping)} markers, with five quest reports.')
