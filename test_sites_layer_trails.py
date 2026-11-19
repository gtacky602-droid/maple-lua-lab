"""Drive the reviewed two-way layer routes and three exterior approaches in Lua."""

from collections import Counter
import json

from experience import LEVELS, WEEKLY_MODE_IDS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))


def write(path,value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


nodes={n['id']:n for n in read('content/story-graph.json')['nodes']}
exits={id:node['exits'] for id,node in nodes.items()}
gates={(id,e['to']):e for id,rows in exits.items() for e in rows}
plan=read('design/world/atlas-route-plan.json')
source=read('sources/map-research/sites-layer-trails.json')
lua,core=runtime()
crossings=set()


def stage(level,id):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,id)
    return s,TrailWalk(lua,core,s,gates,exits)


def go(walk,path):
    for a,b in zip(path,path[1:]):
        assert walk.state.story.node==a
        for actor in walk.state.actors.values():
            actor.inv=1000
        walk.cross(b)
        crossings.add((a,b))


def save(s):
    return validate_save(native(core.checkpoint(s)))


layer_pairs = {frozenset(route['fields']) for route in source['routes']}
findings=Counter()
for review in plan['sites_only_route_review']:
    if review['finding'] not in {'implemented_as_lab_route','use_existing_local_detour',
                               'use_existing_regional_detour','use_existing_level_route'}:
        continue
    if review['finding']=='implemented_as_lab_route' and frozenset(review['fields']) not in layer_pairs:
        continue
    if not (paths:=review.get('runtime_paths')):
        continue
    peak=max(nodes[id]['level'] for path in paths.values() for id in path)
    fwd,back=paths['forward'],paths['return']
    assert fwd[0]==back[-1] and fwd[-1]==back[0]
    assert len(set(fwd))==len(fwd) and len(set(back))==len(back)
    assert len(fwd)>2 or review['finding']=='implemented_as_lab_route'
    if review['finding']=='use_existing_local_detour':
        assert peak<=max(nodes[fwd[0]]['level'],nodes[fwd[-1]]['level'])+2
    state,walk=stage(peak,fwd[0])
    quests=native(state.story.quests)
    go(walk,fwd)
    go(walk,back)
    assert state.story.node==fwd[0] and native(state.story.quests)==quests
    findings[review['finding']]+=1
assert dict(findings)=={'implemented_as_lab_route':7,'use_existing_local_detour':72,'use_existing_regional_detour':4,
                       'use_existing_level_route':3}

enemy_data=read('content/enemy-spawns.json')['nodes']
checked={}
for place in source['exterior_approaches']:
    room,host=place['stage'],place['approach']
    n=nodes[room]
    path=place['stages']
    assert place['source_entrance']=='confirmed'
    assert n['peaceful'] and not n.get('atlasEntrancePending') and room not in enemy_data
    assert 'mapPoint' not in n and (path[0],path[-1])==(host,room)
    level=place['access']
    safe=n['checkpoint']
    state,walk=stage(level,safe)
    core.enterStoryNode(state,host)
    go(walk,path)
    assert not state.enemies[1] and not state.lift
    if door:=n.get('domainEntrance'):
        walk.approach(door['x'],door['y'],door['name'])
        assert any(draw.text==door['name'] for draw in core.frame(state).draws.values() if draw.kind=='text')
    core.action(state,'world_map_toggle')
    view=core.frame(state).worldMap
    assert not view.selected.entrancePending and view.selected.current and view.selected.provisional
    back=next(route for route in view.routes.values() if route.id==path[-2])
    assert back.label==('風の流れ' if gates[room,path[-2]].get('windLift') else '徒歩')
    core.action(state,'world_map_close')
    restored=core.restore(lua.table_from(save(state),recursive=True),12)
    assert restored.story.node==safe and restored.story.visited[room]
    if arena:=place.get('arena'):
        edge=gates[room,arena]
        walk.approach(edge['x'],edge.get('y',480),arena)
        nearby=core.frame(state).storyNearbyPortal
        assert nearby.to==arena and not nearby.available and nearby.reason=='必要レベル 112'
        core.action(state,'story_nearby_portal')
        assert state.story.node==room
    go(walk,path[::-1])
    checked[room]=path

state,walk=stage(112,'mond-wp-15')
go(walk,['mond-wp-15','sites-lookout-85351'])
edge=gates['sites-lookout-85351','mond-gate-chess-court']
walk.approach(edge['x'],edge.get('y',480),'mond-gate-chess-court')
assert core.frame(state).weeklyDesk.id=='boss-29122000'
assert tuple(rank.id for rank in core.frame(state).weeklyDesk.modes.values())==WEEKLY_MODE_IDS
go(walk,['sites-lookout-85351','mond-gate-chess-court'])
_,spec=core.currentWeeklyBoss(state)
assert spec.id=='boss-29122000'
go(walk,['mond-gate-chess-court','sites-lookout-85351','mond-wp-15'])

fixtures=[
    ('ice','sne-wp-100654',147),('bay','fon-wp-55760',88),('ridge','mond-border',12),
    ('chess-low','mond-wp-15',13),('chess','mond-wp-15',112),('lookout','mond-wp-95782',160),
]
for name,id,level in fixtures:
    n=nodes[id]
    state,_=stage(level,n['checkpoint'])
    core.enterStoryNode(state,id)
    write(f'work/sites-layer-{name}-fixture.json',save(state))

result={'all_fields_bound':plan['live_bound_fields'],
        'new_layer_round_trips':findings['implemented_as_lab_route'],
        'reused_local_round_trips':findings['use_existing_local_detour'],
        'reused_regional_round_trips':findings['use_existing_regional_detour'],
        'level_progression_round_trips':findings['use_existing_level_route'],
        'confirmed_exterior_round_trips_and_safe_restore':checked,
        'weekly_chess_from_coast':{'locked_at':13,'rank_desk_and_arena_at':112,'return':'mond-wp-15'},
        'unique_directional_crossings':len(crossings),
        'quest_state_unchanged':True}
write('evidence/sites-layer-trails-lua.json',result)
print(result)
