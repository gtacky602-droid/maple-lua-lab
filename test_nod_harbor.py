"""Check artwork packing on an earned journey and read the harbor book on foot."""
import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from test_regional_quest_prop_packing import measure

def read(name):
    return json.loads((ROOT/name).read_bytes())

graph=read('content/story-graph.json')
exits={n['id']:n['exits'] for n in graph['nodes']}
edges={(n,e['to']):e for n,gates in exits.items() for e in gates}
lua,core=runtime()
books=[]
for path,count in [('work/nod-fresh-route-after-revisits/harbor-chapter.json',4),('evidence/nod-revisit-save.json',8)]:
    save=validate_save(read(path))
    s=core.restore(lua.table_from(save,recursive=True),12)
    core.action(s,'story_fast:nod-port')
    assert s.story.node=='nod-port'
    trail=TrailWalk(lua,core,s,edges,exits)
    trail.approach(710,390,'harbor desk')
    view=native(core.frame(s,'sprite','legacy').storyHarborBook)
    assert len(view)==count
    assert all((ROOT/'assets'/p['source']).is_file() for p in view)
    assert all(p['node'] in exits for p in view)
    pages={row['id']:row for row in view}
    assert pages['nod-first-treasure']['choice']=='漁師・海に落ちた光'
    assert pages['nod-moon-crossroads']['choice']=='通った道　林の迂回路'
    assert pages['columbina-coast-detour']['choice']=='月貝の風鈴'
    assert pages['nod-moon-vault-quest']['choice']=='剣闘士の羽（攻撃力）'
    if count==8:
        assert pages['nod-moon-rumor']['title']=='小石が旅した話'
    assert s.progression.total==save['progression']['total']
    books.append(dict(level=s.progression.level,pages=count))
# Fixed samples on the same restored adventure for each of the three art profiles.
packing={}
for node,camera in [('nod-port',310),('nod-far-sea-bench',590),('nod-appraisal-workshop',650),
                    ('nod-rumor-quay',225),('nod-bloom-grove',595),('nod-patrol-shore',250),('nod-patrol-cabin',410)]:
    core.enterStoryNode(s,node)
    if node=='nod-bloom-grove':
        trail.approach(874,386,'lower ledge')
        trail.approach(874,290,'upper ledge')
        trail.approach(1018,290,'flower vista')
    s.camera=camera
    packing[node]={p:measure(core,s,p) for p in ('legacy','h48c32','h32c16')}
assert packing['nod-port']['h32c16']['stamps']>packing['nod-port']['h32c16']['batches']
(ROOT/'evidence/nod-harbor-packing.json').write_text(json.dumps(packing,indent=2)+'\n','utf8')
print(books,packing['nod-bloom-grove'],flush=True)
