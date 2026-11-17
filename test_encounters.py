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
check('counts retained',d['counts']=={'source_entities':63,'encounter_candidates':70,'partial':37,'complete':0})
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
serpent=by_id['boss-24010401']
check('Ruin Serpent is reachable through the field route',
      serpent['status']=='partial' and serpent['fieldNode']=='ruin-serpent-field-pit' and serpent['action'] is None)
herd=by_id['bathysmal-herd']
check('The paired vishaps share a field encounter entrance',
      herd['status']=='partial' and herd['fieldNode']=='bathysmal-field-sanctum' and herd['action'] is None)
vine=by_id['boss-26020301']
check('Electro Regisvine is reachable through the field route',
      vine['status']=='partial' and vine['fieldNode']=='electro-regisvine-field-cave' and vine['action'] is None)
drake=by_id['boss-24030301']
check('Aeonblight Drake is reachable through the field route',
      drake['status']=='partial' and drake['fieldNode']=='aeonblight-field-chamber' and drake['action'] is None)
plant=by_id['boss-20040701']
check('The Dendro Hypostasis is reachable through the field route',
      plant['status']=='partial' and plant['fieldNode']=='dendro-hypostasis-field-den' and plant['action'] is None)
matrix=by_id['boss-24050101']
check('The Matrix is reachable through the field route',
      matrix['status']=='partial' and matrix['fieldNode']=='asimon-field-ruins' and matrix['action'] is None)
wenut=by_id['boss-26130101']
check('The Wenut is reachable through the field route',
      wenut['status']=='partial' and wenut['fieldNode']=='wenut-field-cavern' and wenut['action'] is None)
baptist=by_id['boss-22100501']
check('The Baptist is reachable through the field route',
      baptist['status']=='partial' and baptist['fieldNode']=='baptist-field-sanctuary' and baptist['action'] is None)
emperor=by_id['boss-26160302']
check('The Emperor is reachable through the field route',
      emperor['status']=='partial' and emperor['fieldNode']=='emperor-field-cove' and emperor['action'] is None)
seahorse=by_id['boss-26180101']
check('The Seahorse is reachable through the field route',
      seahorse['status']=='partial' and seahorse['fieldNode']=='seahorse-field-cavern' and seahorse['action'] is None)
generator=by_id['boss-24080101']
check('The Field Generator is reachable through the field route',
      generator['status']=='partial' and generator['fieldNode']=='field-generator-field-chamber' and generator['action'] is None)
tulpa=by_id['boss-20051201']
check('The Tulpa is reachable through the field route',
      tulpa['status']=='partial' and tulpa['fieldNode']=='tulpa-field-grotto' and tulpa['action'] is None)
for mode in ('icewind-coppelia','icewind-coppelius'):
 row=by_id[mode]
 check(mode+' has a separate field route',
       row['status']=='partial' and row['fieldNode']==mode+'-field' and row['action'] is None)
legatus=by_id['boss-26140101']
check('The Legatus Golem is reachable through the castle route',
      legatus['status']=='partial' and legatus['fieldNode']=='legatus-field-hall' and legatus['action'] is None)
suanni=by_id['boss-26190101']
check('The Solitary Suanni is reachable through Chenyu Vale',
      suanni['status']=='partial' and suanni['fieldNode']=='suanni-field-sanctum' and suanni['action'] is None)
qucusaur=by_id['boss-26230301']
check('The Goldflame Qucusaur is reachable through the Natlan field',
      qucusaur['status']=='partial' and qucusaur['fieldNode']=='qucusaur-field-cavern' and qucusaur['action'] is None)
yumka=by_id['boss-26220301']
check('The Mountain King is reachable through the Natlan field',
      yumka['status']=='partial' and yumka['fieldNode']=='yumka-field-ravine' and yumka['action'] is None)
device=by_id['boss-24090201']
check('The Configuration Device is reachable through the Natlan field',
      device['status']=='partial' and device['fieldNode']=='config-device-field-workshop' and device['action'] is None)
papilla=by_id['boss-22120101']
check('The Type I Papilla is reachable through the Natlan field',
      papilla['status']=='partial' and papilla['fieldNode']=='papilla-field-hollow' and papilla['action'] is None)
lava_dragon=by_id['boss-26270301']
check('The Lava Dragon Statue is reachable through the Natlan field',
      lava_dragon['status']=='partial' and lava_dragon['fieldNode']=='atocpan-lava-field' and lava_dragon['action'] is None)
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
