"""Check peaceful swim routes and the command cost of the displayed wildlife."""
import json
import sys
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

def read(path):
    return json.loads((ROOT/path).read_bytes())

lua, core = runtime()
layouts = read('content/enemy-art-layout.json')
nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
routes = {}
for art, layout in layouts.items():
    for node_id, site in layout.get('habitats',{}).items():
        routes.setdefault(node_id,[]).append(dict(art=art,**site))
assert len(routes) == 7
species = set()
for node_id, animals in routes.items():
    node = nodes[node_id]
    assert node['peaceful'] and node['swim']
    s = core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,node_id)
    assert s.storySwimming and len(s.enemies) == 0
    frame = core.frame(s,'sprite','legacy')
    actors = [d for d in frame.draws.values() if d.kind == 'boss_sprite']
    for a in animals:
        species.add(a['art'])
        layout = layouts[a['art']]
        art = read('assets/'+layout['file'])
        draw, = [d for d in actors if d.source == art['source'] and d.x == a['x'] - s.camera]
        assert draw.h == layout['height'] and abs(draw.y - a['y']) <= 3
        assert bool(draw.flip) == a.get('flip', False)
        assert node['swim']['top'] <= a['y']-draw.h-3 and a['y']+3 <= node['swim']['bottom']
    player = s.actors[s.active]
    for animal in animals:
        player.x,player.y = animal['x'],animal['y']
        observation = core.frame(s,'sprite','legacy').wildlifeSighting
        assert observation.art == animal['art']
        assert observation.name == layouts[animal['art']].get('observationName',layouts[animal['art']]['name'].split('（')[0])
    player.x = 20
    assert core.frame(s,'sprite','legacy').wildlifeSighting is None
    for quality in ['legacy','h48c32','h32c16']:
        full = core.frame(s,'rect',quality).commands
        saved = s.storyWildlife
        s.storyWildlife = None
        empty = core.frame(s,'rect',quality).commands
        s.storyWildlife = saved
        expected = sum(len(read('assets/'+layouts[a['art']]['file'])['profiles'][quality]['runs'])
                       for a in animals)
        assert full-empty == expected,(node_id,quality,full,empty,expected)
assert species.isdisjoint({row['art'] for node in routes
                           for row in read('content/enemy-spawns.json')['nodes'].get(node,[])})
print(len(routes),'peaceful routes,',len(species),'wildlife poses, three rectangle profiles matched.')

if '--write-demo' in sys.argv:
    demo = core.new(12)
    core.action(demo,'story_start')
    core.grantExp(demo,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
    for node_id in routes:
        if nodes[node_id].get('waypoint'):
            core.enterStoryNode(demo,node_id)
    core.enterStoryNode(demo,'fon-wp-55784')
    core.enterStoryNode(demo,'fontaine-field')
    core.enterStoryNode(demo,'fontaine-hub')
    data = validate_save(native(core.checkpoint(demo)))
    path = ROOT/'evidence/fontaine-wildlife-save.json'
    if not path.exists() or json.loads(path.read_bytes()) != data:
        path.write_text(json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf8')
