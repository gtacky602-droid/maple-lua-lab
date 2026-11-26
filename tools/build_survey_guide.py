"""Publish the route steps actually reported by the Fontaine and Natlan expedition."""
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
def read(path):
    return json.loads((root/path).read_bytes())
graph=read('content/story-graph.json')
nodes={n['id']:n for n in graph['nodes']}
quests={q['id']:q for q in graph['quests']}
guide=[]
for report in read('evidence/fon-nat-survey-route.json')['reports']:
    q=quests[report['quest']]
    if not q.get('itinerary'):
        continue
    steps=[]
    for step in q['itinerary']:
        node=step.get('from',step['node'])
        item=dict(label=step['objective'],node=node,place=nodes[node]['name'])
        if step['kind']=='arrive':
            edges=[e for e in nodes[node]['exits'] if e['to']==step['node']]
            assert len(edges)==1,(node,step['node'])
            item.update(to=step['node'],x=edges[0]['x'],y=edges[0].get('y',480))
        else:
            item.update(x=step['x'],y=step.get('y',480))
        steps.append(item)
    guide.append(dict(name=q['name'],hub=nodes[q['hub']]['name'],steps=steps))
(root/'content/fon-nat-survey-guide.json').write_bytes((json.dumps(guide,ensure_ascii=False,separators=(',',':'))+'\n').encode())
