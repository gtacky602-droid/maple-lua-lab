"""Create encounter worklist without treating database entities as completed battles."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def build():
 source=json.loads((ROOT/'content/boss-catalog.json').read_text(encoding='utf8'))
 rows=[]
 for b in source['boss_entities']:
  if b['id']=='26050801':continue
  row={'id':'boss-'+b['id'],'name':b['name'],'kind':b['kind_candidate'],
       'entity_ids':[b['id']],'status':'not_implemented','action':None,
       'grouping':'single_entity_provisional','evidence':[b['source_url']],
       'remaining':['固有戦闘','ドット絵・動作','報酬・難度','通し検証']}
  if b['id']=='26050701':
   row.update(id='bathysmal-herd',name='アビサルヴィシャップの群れ',entity_ids=['26050701','26050801'],grouping='paired_encounter')
   row['evidence']+=['sources/boss-research/english-boss-candidates.json:26050701 investigation=37',
     'https://genshin-impact.fandom.com/wiki/Coral_Defenders']
  if b['id']=='24070301':
   for variant,label in [('coppelia','コッペリアの葬送'),('coppelius','コペリウスの劫罰')]:
    rows.append({**row,'id':'icewind-'+variant,'name':'氷風組曲：'+label,'grouping':'selectable_variant',
     'evidence':row['evidence']+['sources/boss-research/english-boss-candidates.json:24070301 investigation.description']})
   continue
  if b['id']=='20040201':row.update(status='partial',action='boss_anemo',remaining=['追加行動・調整','完成ドット絵','専用報酬・通し検証'])
  if b['id']=='26020201':row.update(status='partial',action='boss_pyro_regisvine')
  if b['id']=='20040101':row.update(status='partial',action='boss_electro')
  if b['id']=='20040301':row.update(status='partial',action='boss_geo')
  if b['id']=='26050101':row.update(status='partial',action='boss_primo')
  if b['id']=='26050101':row['variants']=[{'label':label,'action':'boss_primo_'+element} for element,label in [('hydro','水'),('pyro','炎'),('cryo','氷'),('electro','雷')]]
  if b['id']=='20050101':row.update(status='partial',action='boss_oceanid')
  if b['id']=='26020101':row.update(status='partial',action='boss_cryo_regisvine')
  if b['id'] in ['29150101','29130201']:
   row['review_note']='同一人物の別データ。報酬IDが異なるため別候補のまま保持。挑戦枠の公式照合が必要。'
  rows.append(row)
 for id,name,action in [('farka','ファルカ模擬戦','boss_farka'),('beidou','北斗・反撃読み合い',None),('wanderer','放浪者・空中決闘',None)]:
  rows.append({'id':'stygian-'+id,'name':name,'kind':'stygian','entity_ids':[],
   'status':'partial' if action else 'not_implemented','action':action,'grouping':'original_design',
   'evidence':['sources/20261116-amendment.md:94-101'],
   'remaining':['完成ドット絵・台詞','4難度・報酬','マルチ・記録']+([] if action else ['専用戦闘行動'])})
 return {'version':1,'snapshot_commit':source['snapshot_commit'],'complete_roster_verified':False,
  'warning':'制作候補一覧。最新の全ボス網羅・戦闘単位の最終確認は未完。未実装を挑戦可能として表示しない。',
  'counts':{'source_entities':len(source['boss_entities']),'encounter_candidates':len(rows),
    'partial':sum(r['status']=='partial' for r in rows),'complete':0},'encounters':rows}
if __name__=='__main__':
 result=build();(ROOT/'content/encounters.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(result['counts']))
