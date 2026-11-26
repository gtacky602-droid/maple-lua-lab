"""Build the small gallery selector from the encounters and their published arenas."""
import json
from pathlib import Path

content=Path(__file__).resolve().parents[1]/'content'
def read(name):
    return json.loads((content/(name+'.json')).read_text(encoding='utf8'))

graph=read('story-graph')
nodes={node['id']:node for node in graph['nodes']}
quests={q['id']:q['name'] for q in graph['quests']}
rosters = (
    ('フィールド・地方伝説',read('field-boss-spawns')['fieldBosses']),
    ('週ボス',read('weekly-boss-spawns')['weeklyBosses']),
    ('幽境専用',[{'node':n,'name':s['name']} for n,s in read('stygian-openings').items()]),
)
entrances={boss['node']:[] for _,records in rosters for boss in records}
for source in graph['nodes']:
    for edge in source['exits']:
        target=edge['to']
        if target not in entrances or target==source['id']:
            continue
        gate={'from':source['id'],'name':source['name'],'x':edge['x'],'y':edge.get('y',480)}
        if edge.get('rideLabel'):
            gate['label']=edge['rideLabel']
        rule=edge.get('requires')
        if rule:
            title='依頼「'+quests[rule['quest']]+'」'
            if rule.get('unreported'):
                gate['condition']=title+'の報告前'
            elif 'count' not in rule:
                gate['condition']=title+'の報告後'
                phase=nodes[target].get('locationAfterReport',{})
                if phase.get('quest')==rule['quest']:
                    gate['afterArrival']=target
            elif rule['count']==0:
                gate['condition']=title+'の受注後'
            else:
                gate['condition']=title+'の進捗'+str(rule['count'])+'以上'
        entrances[target].append(gate)
groups={}
for group,records in rosters:
    rows=[]
    for boss in records:
        node=boss['node']
        entry={'node':node,'name':boss['name'],'region':nodes[node]['region']}
        entry['entrances']=entrances[node]
        if node=='shouki-godmaking-arena':
            entry['opening']={k:boss[k] for k in ['center','floorY','artHeight']}
            entry['opening'].update({k:boss['openingPose'][k] for k in ['file','chestSourceY']})
        rows.append(entry)
    groups[group]=rows
(content/'boss-arena-index.json').write_text(json.dumps(groups,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
