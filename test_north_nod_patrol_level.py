"""Walk the three northern patrol branches using the M-map route at acceptance level."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

graph = json.loads((ROOT/'content/story-graph.json').read_bytes())
quest = next(q for q in graph['quests'] if q['id'] == 'nod-north-landmark-round')
exits = {n['id']: n['exits'] for n in graph['nodes']}
edges = {(origin, gate['to']): gate for origin, gates in exits.items() for gate in gates}
lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, LEVELS[quest['level']-1]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(state, quest['hub'])
core.action(state, 'story_accept:'+quest['id'])
walk = TrailWalk(lua, core, state, edges, exits)

def follow(target):
    core.action(state, 'world_map_focus:'+target)
    guide = core.frame(state).worldMap.guide
    assert guide.status == 'ready', (target, guide.status)
    path = [stop.id for stop in guide.stops.values()]
    core.action(state, 'world_map_close')
    for dest in path:
        walk.cross(dest)
    assert state.story.node == target
    return path

routes = {}
for branch in quest['paths']:
    spot = branch['steps'][0]
    routes[branch['id']] = follow(spot['node'])
    if branch['id'] == 'ridge':
        for x,y in [(570,412),(836,345)]:
            walk.approach(x,y,spot['name'])
    walk.approach(spot['x'],spot['y'],spot['name'])
    core.action(state, 'story_collect')
    assert state.story.quests[quest['id']].pathProgress[branch['id']].count == 1
    if branch['id'] == 'coast':
        for x,y in [(640,411),(365,340)]:
            walk.approach(x,y,quest['hub'])
    follow(quest['hub'])
assert state.progression.level == quest['level']
core.action(state,'story_report:'+quest['id'])
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True),12)
assert restored.story.quests[quest['id']].status == 'complete'
assert 'nod-wp-92866' in routes['ridge']
report = dict(quest=quest['id'], level=quest['level'], outwardRoutes=routes, reportedAndRestored=True)
(ROOT/'evidence/north-nod-patrol-level.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(report)
