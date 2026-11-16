import json
from runtime import runtime,native,ROOT
from savegame import validate_save
lua,c=runtime();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
s=c.new(12);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_samples')
check('sample kit granted once',len(s.inventory["items"])==5)
c.action(s,'artifact_equip:2');check('feather adds item level ATK',s.actors[1].atk>4)
atk=s.actors[1].atk;c.action(s,'artifact_equip:2');check('reequip not additive',s.actors[1].atk==atk)
c.action(s,'swap');c.action(s,'artifact_equip:2');check('same item transfers without duplicate ownership',s.inventory["items"][2].owner==2 and s.actors[1].atk==4)
c.action(s,'artifact_equip:1');a=s.actors[2];a.hp=10;before=a.hp/a.maxhp
for _ in range(5):c.action(s,'artifact_remove:1');c.action(s,'artifact_equip:1')
check('equip does not heal repeatedly',a.hp/a.maxhp<=before)
money=s.mora;c.action(s,'artifact_upgrade:2');check('insufficient funds do not mutate',s.mora==money and s.inventory["items"][2].enhance==0)
s.mora=50000;c.action(s,'artifact_upgrade:2');check('upgrade +4 exact fee',s.mora==42800 and s.inventory["items"][2].enhance==4)
c.action(s,'artifact_upgrade:2');c.action(s,'artifact_upgrade:2');money=s.mora;c.action(s,'artifact_upgrade:2')
check('rarity enhancement cap',s.inventory["items"][2].enhance==12 and s.mora==money)
item=lua.table_from({'slot':2,'rarity':5,'itemLv':160,'enhance':16})
check('source Lv160 feather value matches',c.artifactStats(item)==59976)
saved=validate_save(native(c.checkpoint(s)));restored=c.restore(lua.table_from(saved,recursive=True),12)
check('inventory and equipment persist',native(c.checkpoint(restored))['inventory']==saved['inventory'] and restored.actors[2].atk==s.actors[2].atk)
for _ in range(75):c.giveArtifact(s,2,21,3)
check('80 item limit',len(s.inventory["items"])==80 and not c.giveArtifact(s,2,21,3))
bad=json.loads(json.dumps(saved));bad['inventory']['items'][1]['id']=bad['inventory']['items'][0]['id']
try:validate_save(bad)
except ValueError:checks.append('duplicate IDs rejected')
else:raise AssertionError('duplicate accepted')
s=c.new(12);c.action(s,'campaign');e=s.enemies[1] if len(s.enemies) else lua.table_from({'level':1,'boss':False})
for _ in range(3000):c.onKill(s,e)
check('normal drops use enemy+20 range and low-level rarity',len(s.inventory.ground)>0 and all(15<=d.item.itemLv<=27 and d.item.rarity in (3,4) for _,d in s.inventory.ground.items()))
(ROOT/'evidence/artifacts-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'sample_drops':len(s.inventory.ground)},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'artifact checks passed')
