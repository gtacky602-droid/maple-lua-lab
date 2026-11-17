import json
from unittest.mock import patch
import build_encounters
from build_encounters import build,ROOT
from runtime import runtime
d=build();rows=d['encounters'];checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
source=json.loads((ROOT/'content/boss-catalog.json').read_text(encoding='utf8'))
check('every imported entity represented',set(x['id'] for x in source['boss_entities'])==set(e for r in rows for e in r['entity_ids']))
check('encounter IDs unique',len({r['id'] for r in rows})==len(rows))
check('vishap pair grouped',len([r for r in rows if '26050801' in r['entity_ids']])==1 and len(next(r for r in rows if r['id']=='bathysmal-herd')['entity_ids'])==2)
check('suite has two selectable variants',len([r for r in rows if '24070301' in r['entity_ids']])==2)
check('original and authored encounters retained',{r['id'] for r in rows if r['kind']=='stygian'}=={
 'stygian-farka','stygian-beidou','stygian-wanderer','stygian-capitano',
 'stygian-xbalanque','stygian-rerir','stygian-ronova',
})
check('completion not overclaimed',d['counts']['complete']==0 and not d['complete_roster_verified'])
check('not implemented rows cannot launch',all(r['action'] is None for r in rows if r['status']=='not_implemented'))
check('evidence on every row',all(r['evidence'] for r in rows))
check('generated file matches builder',d==json.loads((ROOT/'content/encounters.json').read_text(encoding='utf8')))
check('counts retained',d['counts']=={'source_entities':63,'encounter_candidates':70,'partial':11,'complete':0})
by_id={r['id']:r for r in rows}
check('both paired encounters retain two art references',all(len(by_id[id]['art_components'])==2 for id in ('bathysmal-herd','boss-29122000')))
check('only new design-only candidates lack art',{
 r['id'] for r in rows if not (r.get('art_candidate') or r.get('art_components'))
}=={'stygian-xbalanque','stygian-rerir','stygian-ronova'})
check('Capitano art and design linked without a playable action',
      by_id['stygian-capitano']['art_candidate']['encoding']=='assets/capitano-coat-right-sprites-v1.json'
      and by_id['stygian-capitano']['evidence']==['docs/stygian-motion-v1/CAPITANO.md']
      and by_id['stygian-capitano']['action'] is None)

read_json=build_encounters.read_json
def read_previous_beidou_art(path):
 data=read_json(path)
 if path=='content/character-art-gallery.json':
  next(i for i in data['items'] if i['id']=='beidou')['file']='beidou-idle-sprites.json'
 return data
with patch.object(build_encounters,'read_json',side_effect=read_previous_beidou_art):
 revision=next(r for r in build()['encounters'] if r['id']=='stygian-beidou')
 check('gallery revision automatically updates reference',revision['art_candidate']['encoding']=='assets/beidou-idle-sprites.json' and revision['action'] is None)

lua,c=runtime()
launches=[]
elements={'水':'hydro','炎':'pyro','氷':'cryo','雷':'electro'}
for row in rows:
 if row['action']:
  boss_name=row['name'].split('·',1)[0]
  for launch in [{'action':row['action']},*row.get('variants',[])]:
   s=c.new(16)
   c.action(s,launch['action'])
   boss=c.frame(s,'sprite').boss
   check('launch '+launch['action'],boss is not None and boss.hp>0 and boss.name.startswith(boss_name))
   proof={'action':launch['action'],'boss':boss.name}
   if 'label' in launch:
    actual=boss.markedName if 'variantLabel' in row else boss.element
    expected=launch['label'] if 'variantLabel' in row else elements[launch['label']]
    check('variant '+launch['action'],actual==expected)
    proof['variant']=actual
   launches.append(proof)
(ROOT/'evidence/encounters-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'launches':launches},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'encounter checks passed')
