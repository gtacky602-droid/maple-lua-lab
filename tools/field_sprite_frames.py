"""Emit Lua gameplay frames for the browser's ordinary-enemy image checks."""
import gzip
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from runtime import native, runtime

def read(file):
    return json.loads((root/file).read_bytes())

lua, core = runtime()
frames = []
nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
for entry in read('content/field-sprite-index.json')['species']:
    art = read('assets/'+entry['file'])
    for node, count in entry['places']:
        state = core.new(12)
        core.action(state,'story_start')
        if group := nodes[node].get('hiddenGroup'):
            state.story.discovered[group] = True
        if not core.atlasNodeVisible(state,node):
            continue
        core.enterStoryNode(state,node)
        enemy = next((e for e in state.enemies.values() if e.art == entry['id']),None)
        if enemy is None:
            continue
        state.camera = max(0,enemy.x-450)
        frame = native(core.frame(state,'sprite','legacy'))
        expected = next((draw for draw in frame['draws'] if draw.get('source') == art['source']
                         and draw.get('box') == art['box'] and draw['x'] == enemy.x-state.camera),None)
        if expected:
            frame.update(session='field-sheet-check',lua_ms=0,lua_kb=0)
            # Each prepared state can expose a different set of locations.
            frame['storyGraphRevision'] = 'field-sheet-check:'+entry['id']
            for location in frame['storyGraph']['nodes']:
                if not location['exits']:
                    location['exits'] = []
            frames.append(dict(species=entry['id'],node=node,draw=expected,frame=frame))
            break
    else:
        raise AssertionError('No live sprite for '+entry['id'])
sys.stdout.buffer.write(gzip.compress(json.dumps(frames,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=1))
