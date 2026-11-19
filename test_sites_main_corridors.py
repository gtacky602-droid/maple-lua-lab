"""Play the new local corridors and the existing paths selected by the map review."""

from collections import Counter
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))


def write(path,value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


graph=read('content/story-graph.json')
nodes={n['id']:n for n in graph['nodes']}
exits={id:n['exits'] for id,n in nodes.items()}
gates={(id,e['to']):e for id,rows in exits.items() for e in rows}
plan=read('design/world/atlas-route-plan.json')
review=read('sources/map-research/sites-main-corridors.json')['routes']
new_pairs={frozenset(r['fields']):r for r in review}
lua,core=runtime()


def experience(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def make(level,id):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,experience(level),'quest')
    core.enterStoryNode(s,id)
    return s,TrailWalk(lua,core,s,gates,exits)


def follow(walk, path):
    for a,b in zip(path,path[1:]):
        assert walk.state.story.node==a
        for actor in walk.state.actors.values():
            actor.inv=1000
        walk.cross(b)


def save(s):
    return validate_save(native(core.checkpoint(s)))


checks=Counter()
traversed=set()
for row in plan['sites_only_route_review']:
    kind=row['finding']
    key=frozenset(row['fields'])
    if key not in new_pairs and kind!='use_existing_geo_route':
        continue
    paths=row['runtime_paths']
    forward,back=paths['forward'],paths['return']
    assert (forward[0],forward[-1])==(back[-1],back[0])
    peak=max(nodes[id]['level'] for path in paths.values() for id in path)
    assert peak<=max(nodes[forward[0]]['level'],nodes[forward[-1]]['level'])+2
    state,walk=make(peak,forward[0])
    quests=native(state.story.quests)
    follow(walk, forward)
    follow(walk, back)
    assert state.story.node==forward[0] and native(state.story.quests)==quests
    traversed.update(walk.crossings)
    checks[kind]+=1

assert checks['implemented_as_lab_route']==16 and checks['use_existing_geo_route']==195
middle_rooms={r['stages'][1] for r in review if len(r['stages'])==3}
assert len(middle_rooms)==11 and all(nodes[id]['peaceful'] for id in middle_rooms)

# With Lv63 the border trail stops at the Chasm entrance, then opens at Lv64.
chasm='liyue-wp-28732'
forest='sum-wp-28704'
border='sites-corridor-chasm-border'
state,walk=make(63,chasm)
edge=gates[chasm,border]
walk.approach(edge['x'],edge.get('y',480),border)
gate=core.frame(state).storyNearbyPortal
assert gate.to==border and gate.level==64 and not gate.available
core.action(state,'story_nearby_portal')
assert state.story.node==chasm
core.grantExp(state,experience(64)-experience(63),'quest')
follow(walk,[chasm,border,forest,border,chasm])

# Restore in the last visited camp when saved in a new intermediary area.
checkpoint=nodes[chasm]['checkpoint']
state,walk=make(64,checkpoint)
core.enterStoryNode(state,chasm)
write('work/sites-corridor-border-fixture.json',save(state))
for corridor in middle_rooms:
    if not nodes[corridor].get('checkpointAtEntry'):
        continue
    for edge in exits[corridor]:
        host=edge['to']
        safe=nodes[host]['checkpoint']
        state,walk=make(64,safe)
        core.enterStoryNode(state,host)
        follow(walk,[host,corridor])
        checkpoint=save(state)
        assert state.story.node==corridor and checkpoint['story']['node']==host
        restored=core.restore(lua.table_from(checkpoint,recursive=True),12)
        assert restored.story.node==safe and restored.story.visited[corridor]

node='nod-wp-88129'
state,_=make(125,nodes[node]['checkpoint'])
core.enterStoryNode(state,node)
write('work/sites-corridor-boat-fixture.json',save(state))

held=[r for r in plan['sites_only_route_review'] if r['finding']=='unverified_travel_choice']
assert all(not r.get('runtime_paths') for r in held)
focus=Counter(r['review_focus'] for r in held)
assert focus=={'discovery_or_dedicated_gate':8, 'outdoor_corridor_or_floor_alignment':11}
result={'imported_fields':plan['live_bound_fields'],'added_round_trips':checks['implemented_as_lab_route'],
        'walkable_intermediate_stages':len(middle_rooms),'existing_round_trips_verified':checks['use_existing_geo_route'],
        'directions_tested':len(traversed),'withheld_connections':len(held),'pending_reasons':dict(focus),
        'border_level_64_gate':True,'safe_restore_after_new_corridor':True,
        'quest_state_unchanged':True}
write('evidence/sites-main-corridors-lua.json',result)
print(result)
