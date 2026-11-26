"""Build the small gallery selector from the encounters and their published arenas."""
import json
from pathlib import Path

content=Path(__file__).resolve().parents[1]/'content'
def read(name):
    return json.loads((content/(name+'.json')).read_text(encoding='utf8'))

graph=read('story-graph')
nodes={node['id']:node for node in graph['nodes']}
quests={q['id']:q['name'] for q in graph['quests']}
normal_stages={boss['fieldNode'] for boss in read('encounters')['encounters'] if boss['kind']=='normal'}
entrances={stage:[] for stage in normal_stages}
for source in graph['nodes']:
    for edge in source['exits']:
        target=edge['to']
        if target in entrances and target!=source['id']:
            gate={'from':source['id'],'name':source['name'],'x':edge['x'],'y':edge.get('y',480)}
            if edge.get('rideLabel'):
                gate['label']=edge['rideLabel']
            if edge.get('requires'):
                gate['quest']=quests[edge['requires']['quest']]
            entrances[target].append(gate)
groups={}
for group,records in (
    ('フィールド・地方伝説',read('field-boss-spawns')['fieldBosses']),
    ('週ボス',read('weekly-boss-spawns')['weeklyBosses']),
    ('幽境専用',({'node':n,'name':s['name']} for n,s in read('stygian-openings').items())),
):
    rows=[]
    for boss in records:
        node=boss['node']
        entry={'node':node,'name':boss['name'],'region':nodes[node]['region']}
        if node in entrances:
            entry['entrances']=entrances[node]
        if node=='shouki-godmaking-arena':
            entry['opening']={k:boss[k] for k in ['center','floorY','artHeight']}
            entry['opening'].update({k:boss['openingPose'][k] for k in ['file','chestSourceY']})
        rows.append(entry)
    groups[group]=rows
(content/'boss-arena-index.json').write_text(json.dumps(groups,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
