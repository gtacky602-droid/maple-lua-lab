"""Walk the Fontaine canal connections using the prior story's arrival save."""
import json
from runtime import ROOT,runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

graph=json.loads((ROOT/'content/story-graph.json').read_bytes())
exits={node['id']:node['exits'] for node in graph['nodes']}
edges={(room,edge['to']):edge for room,gates in exits.items() for edge in gates}
checkpoint=validate_save(json.loads((ROOT/'work/sumeru-fresh-route/fontaine-save.json').read_bytes()))
lua,core=runtime()
s=core.restore(lua.table_from(checkpoint,recursive=True),12)
walk=TrailWalk(lua,core,s,edges,exits)
assert s.story.node=='fontaine-hub' and s.progression.level==80
def level(target):
    while s.progression.level<target:
        core.grantExp(s,core.expNeeded(s.progression.level)-s.progression.xp,'quest')
    assert s.progression.level==target

def blocked(dest):
    origin=s.story.node
    edge=edges[origin,dest]
    walk.approach(edge['x'],edge.get('y',480),dest)
    gate=core.frame(s).storyNearbyPortal
    assert gate.to==dest and not gate.available
    core.action(s,'story_nearby_portal')
    assert s.story.node==origin and not s.lift

field,gate,workshop='fontaine-field','fon-wp-50047','fon-wp-50048'
walk.cross(field)
blocked(gate)
core.action(s,'world_map_toggle')
core.action(s,'world_map_select:'+workshop)
guide=core.frame(s).worldMap.guide
assert guide.status=='blocked' and guide.requiredLevel==83
assert [stop.id for stop in guide.stops.values()]==[gate,workshop]
core.action(s,'world_map_close')
level(82)
walk.cross(gate)
blocked(workshop)
level(83)
walk.cross(workshop)
blocked('fon-wp-55776')
for dest in [gate,field,'fontaine-hub','fontaine-entry','fon-wp-50035','fon-wp-50036','fon-wp-50035','fontaine-entry','fon-wp-50046','fon-wp-50060']:
    walk.cross(dest)
print('PASS east canal round trip, Lv82 lock landing, Lv83 workshop, Beryl coast trail and bridge lift')
