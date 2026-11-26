"""Check trial placements in a running Lua story scene."""
import json
from runtime import ROOT, runtime

lua, core = runtime()
graph = {n['id']: n for n in json.loads((ROOT/'content/story-graph.json').read_bytes())['nodes']}
layouts = json.loads((ROOT/'content/enemy-art-layout.json').read_bytes())
for node, species in [('enkanomiya-depth','primordial-bathysmal-vishap'),
                      ('nod-field','oprichniki-fireblade-shock-trooper'),
                      ('fontaine-field','fatui-wind-operative')]:
    state = core.new(12)
    core.action(state,'story_start')
    core.enterStoryNode(state,node)
    enemy, = [e for e in state.enemies.values() if e.art == species]
    platform = graph[node]['platforms'][3]
    assert enemy.y == platform['y'] and platform['x'] <= enemy.x <= platform['x'] + platform['w']
    assert enemy.spawnId == node+'-'+species and enemy.expRole == 'normal'
    assert enemy.level == graph[node]['level'] and enemy.hp > 0
    state.camera = min(enemy.x-480,graph[node]['width']-960)
    art = json.loads((ROOT/'assets'/layouts[species]['file']).read_bytes())
    frame = core.frame(state,'sprite','legacy')
    assert any(d.source == art['source'] and d.h == layouts[species]['height']
               for d in frame.draws.values()), species
    print(node, species, enemy.level, enemy.y)
