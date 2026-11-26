"""Walk the first ascent and verify the camp shortcut after returning and restoring."""
import json
from runtime import ROOT,runtime,native
from tools.waypoint_test import TrailWalk
from savegame import validate_save

camp,stairs,flags='dornman-camp','dornman-wind-stairs','dornman-flag-trestle'
lua,core=runtime()
graph=json.loads((ROOT/'content/story-graph.json').read_bytes())
exits={n['id']:n['exits'] for n in graph['nodes']}
edges={(origin,e['to']):e for origin,items in exits.items() for e in items}
s=core.new(12)
core.action(s,'story_start')
core.enterStoryNode(s,camp)
walk=TrailWalk(lua,core,s,edges,exits)
def route(target):
    core.action(s,'world_map_focus:'+target)
    guide=native(core.frame(s,'sprite','legacy').worldMap.guide)
    core.action(s,'world_map_close')
    return guide
def save():
    return validate_save(native(core.checkpoint(s)))
assert route('dornman-depth')['status']=='ready'
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/dornman-entry-level.json').write_text(json.dumps(save(),ensure_ascii=False),encoding='utf8')
core.grantExp(s,sum(core.expNeeded(i) for i in range(1,167)),'quest')
guide=route(flags)
assert guide['requiredLevel']==168 and [leg['id'] for leg in guide['stops']]==[stairs,flags]
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'evidence/dornman-map-lv167.json').write_text(json.dumps(save(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf8')
core.grantExp(s,core.expNeeded(167),'quest')
assert s.progression.level==168
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/dornman-first-ascent.json').write_text(json.dumps(save(),ensure_ascii=False),encoding='utf8')
walk.approach(536,480,flags)
assert core.frame(s,'sprite','legacy').storyNearbyPortal is None
first=route(flags)
assert [(leg['id'],leg['level'],leg['mode']) for leg in first['stops']]==[(stairs,160,'walk'),(flags,168,'lift')]
walk.cross(stairs);walk.cross(flags)
assert s.story.node==flags
walk.cross(camp)
s=core.restore(lua.table_from(save(),recursive=True),12)
assert s.story.node==camp and s.story.visited[flags]
(ROOT/'evidence/dornman-map-shortcut.json').write_text(json.dumps(save(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf8')
shortcut=route(flags)
assert [leg['id'] for leg in shortcut['stops']]==[flags]
walk=TrailWalk(lua,core,s,edges,exits)
walk.cross(flags)
print('Lv1 exploration stays accessible; Lv167 waits for Lv168; first ascent via Lv160 stairs and lift; restored shortcut walked.')
