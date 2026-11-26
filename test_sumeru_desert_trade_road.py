"""Exercise the southern desert trade road and canyon at their entrance levels."""
import json
from runtime import ROOT,runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

graph=json.loads((ROOT/'content/story-graph.json').read_bytes())
exits={node['id']:node['exits'] for node in graph['nodes']}
edges={(room,edge['to']):edge for room,gates in exits.items() for edge in gates}
save=validate_save(json.loads((ROOT/'work/inazuma-fresh-route/sumeru-save.json').read_bytes()))
lua,core=runtime()
s=core.restore(lua.table_from(save,recursive=True),12)
walk=TrailWalk(lua,core,s,edges,exits)
def level(target):
    while s.progression.level<target:
        core.grantExp(s,core.expNeeded(s.progression.level)-s.progression.xp,'quest')
    assert s.progression.level==target

def blocked(target):
    edge=edges[s.story.node,target]
    walk.approach(edge['x'],edge.get('y',480),target)
    gate=core.frame(s).storyNearbyPortal
    assert gate.to==target and not gate.available
    before=s.story.node
    core.action(s,'story_nearby_portal')
    assert s.story.node==before and not s.lift

def wp(number):
    return 'sum-wp-'+str(number)

level(65)
for dest in ['sumeru-field',wp(28729),wp(28711),wp(28712),wp(28715),wp(36674)]:
    walk.cross(dest)
blocked(wp(36684))
level(66)
walk.cross(wp(36684))
blocked(wp(36680))
level(67)
walk.cross(wp(36680))
blocked(wp(36679))
for dest in [wp(36684),wp(36674),wp(36677)]:
    walk.cross(dest)
blocked(wp(36681))
level(68)
for dest in [wp(36681),wp(36685),wp(36686),wp(36676)]:
    walk.cross(dest)
blocked(wp(36687))
print('PASS Lv65 forest to entrance, Lv66 stone road, Lv67 market and hill, Lv68 east/west canyon and statue; higher exits stayed locked')
