"""Exercise actual Lua movement; isolate enemies to test geometry, not combat."""
import json
from runtime import runtime, ROOT

lua, core = runtime()
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf-8'))
results = []
failures = []

def state(node):
    s = core.new(12)
    core.action(s, 'story_start')
    core.enterStoryNode(s, node['id'])
    s.auto = False
    s.enemies = lua.table()
    for i in range(2, len(s.actors)+1):
        s.actors[i].hp = 0
    return s

def jump(node, source, target):
    # Walk to the reachable source edge first; then jump toward target's near edge.
    sx = max(source['x']+20, min(target['x']+target['w']/2, source['x']+source['w']-20))
    tx = max(target['x']+20, min(sx, target['x']+target['w']-20))
    s = state(node)
    a = s.actors[1]
    a.x, a.y, a.vy, a.ground = sx, source['y'], 0, True
    core.action(s, 'jump')
    airborne = False
    for frame in range(150):
        core.step(s, 1/60, lua.table_from({'jump': True, 'right': a.x < tx-2, 'left': a.x > tx+2}))
        airborne = airborne or not a.ground
        if airborne and a.ground:
            return abs(a.y-target['y']) < .01 and target['x'] <= a.x <= target['x']+target['w']
    return False

for node in graph['nodes']:
    platforms = node['platforms']
    reached = {0}
    routes = []
    while True:
        previous = len(reached)
        for target in range(1, len(platforms)):
            if target in reached:
                continue
            for source in sorted(reached):
                if jump(node, platforms[source], platforms[target]):
                    reached.add(target)
                    routes.append({'from': source, 'to': target})
                    break
        if len(reached) == previous:
            break
    missing = sorted(set(range(len(platforms)))-reached)
    if missing:
        failures.append({'node': node['id'], 'unreachable_platforms': missing})
    # End-to-end ground travel in both directions, without teleporting between exits.
    s = state(node)
    a = s.actors[1]
    for right, boundary in [(True, node['width']-60), (False, 60)]:
        for _ in range(600):
            core.step(s, 1/60, lua.table_from({'right': right, 'left': not right}))
            if (right and a.x >= boundary) or (not right and a.x <= boundary):
                break
        else:
            raise AssertionError((node['id'], 'ground route did not reach exit'))
        assert a.ground and a.y == 480
    results.append({'node': node['id'], 'platforms': len(platforms), 'jump_routes': routes, 'ground_both_directions': True})

(ROOT/'evidence/terrain-traversal.json').write_text(json.dumps({'method':'All story nodes; actual Lua fixed-step jump and walk inputs; enemies removed; jump trial begins on previously proven reachable platform; not full gameplay or native verification', 'nodes':results, 'failures':failures}, indent=2)+'\n')
assert not failures, failures
print(f'{len(results)} routes: every elevated platform reachable; ground travel both directions passed')
