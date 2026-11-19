"""Traverse Natlan, Sacred Mountain and Sky Temple with movement and voyage actions."""

import json
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
assert set(edges) == {(b,a) for a,b in edges} and len(edges) == 420
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
for row in review['floor_connections']:
    a,b,mode = row['from'],row['to'],row['mode']
    assert b in layer_nodes
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

lua,core = runtime()
state = core.new(16)
core.action(state,'campaign')
core.grantExp(state,sum(core.expNeeded(level) for level in range(1,138)),'quest')
assert state.progression.level==138
core.enterStoryNode(state,'natlan-hub')
(ROOT/'work').mkdir(exist_ok=True)
trail = TrailWalk(lua,core,state,edges,exits)


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
finish(valley)
follow('natlan-field','natlan-port',voyage)
dock='ochkanatlan-dock'
edge=edges[voyage,dock]
trail.approach(edge['x'],480,dock)
assert state.t-state.voyage.started<edge['windowStart']
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
follow('natlan-field','nat-wp-72429','nat-wp-82575','nat-wp-82572','nat-wp-82558',
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
saved=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(saved,recursive=True))
assert all(restored.story.visited[n] for n in stages)
assert all(restored.story.quests[q].status=='complete' for q in [valley,ochka,resort,mountain,sky])
core.action(restored,'story_fast:nat-wp-84121')
assert restored.story.node=='nat-wp-84121'
write('evidence/natlan-waypoint-test.json',{
    'map_counts':{'natlan':135,'ancient_sacred_mountain':19,'sky_temple':20},
    'markers':len(mapping),'floor_markers':len(review['floor_markers']),
    'visited_stages':sorted(stages),'reciprocal_routes_including_ship':len(crossings)//2,
    'directed_crossings':len(crossings),'timed_ship_stop_and_reboarding':True,
    'animated_lift':review['animated_lift'],'reported_quests':[valley,ochka,resort,mountain,sky],
    'restored_visits_and_warp':True,
})
print(f'Walked or rode {len(crossings)} directed gates over {len(mapping)} markers, with five quest reports.')
