import json
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
check('original encounters retained',len([r for r in rows if r['kind']=='stygian'])==3)
check('completion not overclaimed',d['counts']['complete']==0 and not d['complete_roster_verified'])
check('not implemented rows cannot launch',all(r['action'] is None for r in rows if r['status']=='not_implemented'))
check('evidence on every row',all(r['evidence'] for r in rows))
check('generated file matches builder',d==json.loads((ROOT/'content/encounters.json').read_text(encoding='utf8')))
lua,c=runtime()
for row in rows:
 if row['action']:
  s=c.new(16);c.action(s,row['action']);f=c.frame(s,'sprite')
  check('launch '+row['id'],f.boss is not None and f.boss.hp>0)
(ROOT/'evidence/encounters-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'encounter checks passed')
