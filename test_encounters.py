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
check('counts retained',d['counts']=={'source_entities':63,'encounter_candidates':70,'partial':16,'complete':0})
by_id={r['id']:r for r in rows}
ice=by_id['boss-20040501']
check('Cryo Hypostasis is reachable through the field route',
      ice['status']=='partial' and ice['fieldNode']=='cryo-hypostasis-field-basin' and ice['action'] is None)
fire=by_id['boss-20040601']
check('Pyro Hypostasis is reachable through the field route',
      fire['status']=='partial' and fire['fieldNode']=='pyro-hypostasis-field-terrace' and fire['action'] is None)
water=by_id['boss-20040401']
check('Hydro Hypostasis is reachable through the field route',
      water['status']=='partial' and water['fieldNode']=='hydro-hypostasis-field-cove' and water['action'] is None)
wolf=by_id['boss-22060101']
check('Golden Wolflord is reachable through the field route',
      wolf['status']=='partial' and wolf['fieldNode']=='wolflord-field-ruins' and wolf['action'] is None)
check('public roster matched without merging Icewind modes or Dottore challenges',d['roster_review']=={
 'game_version':'7.2','reviewed_on':'2026-11-17','field_boss_families':48,'weekly_challenges':14,'unmatched_rows':[],
} and len([r for r in rows if r['kind']=='normal'])==49)
check('both Dottore domains keep separate candidate IDs and aliases',
      by_id['boss-29130201']['name']=='「博士」（偽月の異端者）'
      and by_id['boss-29150101']['name']=='ドットーレ（左道の真諦者）'
      and 'ドットーレ' in by_id['boss-29130201']['aliases']
      and '博士' in by_id['boss-29150101']['aliases'])
check('both paired encounters retain two art references',all(len(by_id[id]['art_components'])==2 for id in ('bathysmal-herd','boss-29122000')))
check('every candidate has a gallery reference',all(r.get('art_candidate') or r.get('art_components') for r in rows))
check('Capitano art and design linked without a playable action',
      by_id['stygian-capitano']['art_candidate']['encoding']=='assets/capitano-coat-right-sprites-v1.json'
      and by_id['stygian-capitano']['evidence']==['docs/stygian-motion-v1/CAPITANO.md']
      and by_id['stygian-capitano']['action'] is None)
check('Xbalanque art and design linked without a playable action',
      by_id['stygian-xbalanque']['art_candidate']['encoding']=='assets/xbalanque-idle-right-sprites-v1.json'
      and by_id['stygian-xbalanque']['evidence']==['docs/stygian-motion-v1/XBALANQUE.md']
      and by_id['stygian-xbalanque']['action'] is None)
check('Rerir art and design linked without a playable action',
      by_id['stygian-rerir']['art_candidate']['encoding']=='assets/rerir-idle-right-sprites-v1.json'
      and by_id['stygian-rerir']['evidence']==['docs/stygian-motion-v1/RERIR.md']
      and by_id['stygian-rerir']['action'] is None)
check('Ronova art and design linked without a playable action',
      by_id['stygian-ronova']['art_candidate']['encoding']=='assets/ronova-idle-right-sprites-v1.json'
      and by_id['stygian-ronova']['evidence']==['docs/stygian-motion-v1/RONOVA.md']
      and by_id['stygian-ronova']['action'] is None)

read_json=build_encounters.read_json
def read_previous_beidou_art(path):
 data=read_json(path)
 if path=='content/character-art-gallery.json':
  next(i for i in data['items'] if i['id']=='beidou')['file']='beidou-idle-sprites.json'
 return data
with patch.object(build_encounters,'read_json',side_effect=read_previous_beidou_art):
 revision=next(r for r in build()['encounters'] if r['id']=='stygian-beidou')
 check('gallery revision automatically updates reference',revision['art_candidate']['encoding']=='assets/beidou-idle-sprites.json' and revision['action'] is None)

review=read_json('content/encounter-roster-review.json')
unreviewed=d['encounters']+[{'id':'new-boss','kind':'normal'}]
check('new unreviewed row is reported',build_encounters.apply_roster_review(unreviewed,review)['unmatched_rows']==['new-boss'])
review['normal'].append({'name':'重複','rows':['boss-26020101']})
try:
 build_encounters.apply_roster_review(unreviewed,review)
except ValueError as error:
 check('overlapping entries rejected','duplicate roster mapping' in str(error))
else:
 raise AssertionError('accepted overlapping roster entries')

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
