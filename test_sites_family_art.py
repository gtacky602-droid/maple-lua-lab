"""Check authored species art in the local Lua runtime and the three rectangle profiles."""
from collections import Counter
import json
from runtime import ROOT, runtime

NODES = ('sites-hunt-7218','sites-hunt-50034','sites-hunt-50034-pocket-1','sites-hunt-63738-pocket-1',
         'sites-hunt-68346','sites-hunt-68346-pocket-1','sites-hunt-68347','sites-hunt-68347-pocket-1')
ART = {'tainted-water-splitting-phantasm','fatui-frost-operative','fatui-skirmisher-cryogunner',
       'fatui-skirmisher-pyroslinger','sternshield-crab'}
lua, core = runtime()
spawns = json.loads((ROOT/'content/enemy-spawns.json').read_text('utf8'))['nodes']
seen = Counter()
renditions = {}
for node in NODES:
    state = core.new(12)
    core.action(state,'story_start')
    core.enterStoryNode(state,node)
    expected = {row['id']:row['art'] for row in spawns[node] if row['art'] in ART}
    actual = {enemy.spawnId:enemy.art for enemy in state.enemies.values() if enemy.art in ART}
    assert actual == expected
    seen.update(actual.values())
    for enemy in state.enemies.values():
        if enemy.art not in ART or enemy.art in renditions:
            continue
        # Isolate one visible enemy while exercising the regular frame and renderer.
        for actor in state.actors.values():
            actor.hp = 0
        for other in state.enemies.values():
            other.hp = 0
        enemy.hp = enemy.maxhp
        state.camera = max(0,enemy.x-480)
        art = core.enemyIdleArt[enemy.art]
        png = core.frame(state,'sprite','legacy')
        assert any(draw.source==art.source for draw in png.draws.values())
        counts = {}
        for quality in ('legacy','h48c32','h32c16'):
            enemy.hp = 0
            baseline = sum(d.kind=='rect' for d in core.frame(state,'rect',quality).draws.values())
            enemy.hp = enemy.maxhp
            total = sum(d.kind=='rect' for d in core.frame(state,'rect',quality).draws.values())
            counts[quality] = total-baseline
            assert counts[quality] == len(art.profiles[quality].runs) > 0
        renditions[enemy.art] = {'source':art.source,'rectangles':counts}
assert set(renditions) == ART and sum(seen.values())==78
result = {'placed':seen,'rendered':renditions,'nodes':NODES}
(ROOT/'evidence/sites-family-art-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
print('78 placements, five sprite sources and 15 rectangle profiles verified.')
