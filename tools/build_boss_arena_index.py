"""Build the small gallery selector from the encounters and their published arenas."""
import json
from pathlib import Path

content=Path(__file__).resolve().parents[1]/'content'
def read(name):
    return json.loads((content/(name+'.json')).read_text(encoding='utf8'))

nodes={node['id']:node for node in read('story-graph')['nodes']}
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
        if node=='shouki-godmaking-arena':
            entry['opening']={k:boss[k] for k in ['center','floorY','artHeight']}
            entry['opening']['file']=boss['openingPose']['file']
        rows.append(entry)
    groups[group]=rows
(content/'boss-arena-index.json').write_text(json.dumps(groups,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
