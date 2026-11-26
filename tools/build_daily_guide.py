"""Connect the verified daily examples to their in-game idle art and map positions."""
import json
from pathlib import Path
from palette_rects import pack_grid

root=Path(__file__).resolve().parents[1]
def read(path):
    return json.loads((root/path).read_bytes())
def encode(data):
    return (json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode()

daily=read('content/daily-quests.json')
witness=read('evidence/daily-catalog.json')['eligibleDefeatWitnesses']
spawns=read('content/enemy-spawns.json')['nodes']
nodes={n['id']:n['name'] for n in read('content/story-graph.json')['nodes']}
rows=[]
packed={}
baseline={}
for q in daily['quests']:
    example=witness[q['designId']]
    node=example['node']
    enemy=next(e for e in spawns[node] if e['id']==example['spawn'])
    art=enemy['art']
    if art not in packed:
        sprite=read(f'assets/{art}-idle-sprites.json')
        grids={k:sprite['profiles'][k] for k in ('h48c32','h32c16')}
        base=dict(source=sprite['source'],box=sprite['box'])
        packed[art]=dict(**base,profiles={k:pack_grid(grid) for k,grid in grids.items()})
        baseline[art]=dict(**base,profiles=grids)
    rows.append(dict(id=q['id'],name=q['name'],region=daily['regions'][q['region']]['label'],
                     hub=q['hub'],hubName=nodes[q['hub']],giver=q['giver'],level=q['level'],
                     kind=q['kind'],goal=q['goal'],target=q['target'],xp=q['xp'],mora=q['mora'],
                     unlock=q.get('unlockHint',''),node=node,place=nodes[node],enemy=enemy.get('name',''),art=art))
assert len(rows)==len(witness)==len({r['id'] for r in rows})
(root/'assets/daily-guide-sprites.json').write_bytes(encode(packed))
metrics=dict(originalBytes=len(encode(baseline)),packedBytes=len(encode(packed)),sprites=len(packed),
             rectangles=sum(len(grid['runs']) for art in baseline.values() for grid in art['profiles'].values()))
(root/'content/daily-field-guide.json').write_bytes(encode(dict(quests=rows,packing=metrics)))
print(metrics)
