"""Walk the Mondstadt east coast at each gate level and inspect the published Lua frame."""
import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

nodes = json.loads((ROOT/'content/story-graph.json').read_bytes())['nodes']
exits = {n['id']: n['exits'] for n in nodes}
edges = {(origin, gate['to']): gate for origin, gates in exits.items() for gate in gates}
lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
walk = TrailWalk(lua, core, state, edges, exits)
walk.cross('mond-road')
route = [('mond-wp-13',5,'mondrest'), ('mond-wp-15',7,'goldenDock'),
         ('mond-wp-18',10,'mondLionTemple'), ('mond-wp-17',14,'mondEagleCape')]
result = []
for target, level, scenery in route:
    origin = state.story.node
    edge = edges[origin,target]
    walk.approach(edge['x'], edge.get('y',480), target)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == target and not portal.available
    core.action(state, 'story_nearby_portal')
    assert state.story.node == origin
    while state.progression.level < level:
        core.grantExp(state,core.expNeeded(state.progression.level)-state.progression.xp,'quest')
    walk.cross(target)
    frame = core.frame(state)
    node = next(n for n in frame.storyGraph.nodes.values() if n.id==target)
    assert frame.story.node == target and node.scenery == scenery
    result.append(dict(node=target,level=level,scenery=scenery))
walk.cross('sites-hunt-7210')
for target in [row[0] for row in reversed(route)]+['mond-road','mond-town']:
    walk.cross(target)
restored = core.restore(lua.table_from(validate_save(native(core.checkpoint(state))),recursive=True),12)
assert all(restored.story.visited[id] for id,_,_ in route)
print('Cape round trip:',result)
