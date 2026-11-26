"""Build just the text and locations the legend guide displays."""
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
def read(path):
    return json.loads((root/path).read_bytes())

graph=read('content/story-graph.json')
nodes={n['id']:n['name'] for n in graph['nodes']}
quests={q['id']:q for q in graph['quests']}
first=read('evidence/legend-expedition-route.json')
middle=read('evidence/quest-legend-expedition-route.json')
last=read('evidence/all-legends-expedition-route.json')
guide=[]
for row in first['newClears']:
    guide.append(dict(id=row['id'],name=row['name'],node=row['node'],intro=row['region']+'の討伐経路',
                      steps=[nodes[n] for n in row['route']]))
for row in middle['newClears']:
    q=middle['guides'][row['quest']]
    intro=q['hub']+'で「'+q['name']+'」を受注。報告先は'+q['giver']+'。' if q['giver'] else q['hub']+'から夜魂の試練へ。'
    if row['quest']=='sne-suspicious-lantern':
        intro='先に「'+middle['guides']['sne-crystal-stream-survey']['name']+'」を報告。'+intro
    guide.append(dict(id=row['id'],name=row['name'],node=row['node'],intro=intro,steps=q['steps']))
last_quests={
    'toyac-cocijo-stone-ring':('natlan-toyac-electro-crystals',['アンバーを編成する','岸辺の電気水晶3個を炎元素で壊す','石広場へ入る']),
    'night-trial-tlatzacuilotl':('natlan-sulfurous-resonant-stones',['刻印板の順番で晶岩を調べる','開いた洞窟を通って柱に触れる']),
    'night-trial-ichcahuipilli':('natlan-witztli-three-echoes',['大岩から3つの道をたどる','各道で光を調べて大岩へ戻る','3つの光がそろったら試練に入る']),
    'ochka-bronzelock-island-court':('ochka-floating-island-spiritway',['岸辺にある2台の装置を壊す','開いた道を渡り、浮遊島の広場へ入る']),
    'sne-churin-snow-court':('sne-snow-sculptor-bouts',None),
    'frost-prism-slime-basin':('frost-wujian-access-survey',None),
    'frost-mushteshir-inner-chamber':('frost-commander-console-test',None),
}
for row in last['newClears']:
    key,steps=last_quests[row['node']]
    q=quests[key]
    intro=nodes[q['hub']]+'で「'+q['name']+'」を受注。'
    if key=='frost-commander-console-test':
        intro='先に「'+quests['frost-wujian-access-survey']['name']+'」を報告。'+intro
    guide.append(dict(**row,intro=intro,steps=steps or [s['objective'] for s in q['itinerary']]))
assert len({r['id'] for r in guide})==len(guide)==last['catalog']==56
assert all(row['steps'] for row in guide)
(root/'content/legend-passage-guide.json').write_bytes((json.dumps(guide,ensure_ascii=False,separators=(',',':'))+'\n').encode())
