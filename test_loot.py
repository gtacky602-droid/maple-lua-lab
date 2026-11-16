import json
from runtime import runtime,native,ROOT
from savegame import validate_save
lua,c=runtime();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s=c.new(12);f=native(c.frame(s,'sprite',None));check('frame preserves grounded boolean and empty drop array',f['actors'][0]['ground'] is True and f['inventory']['ground']==[]);c.action(s,'campaign');c.action(s,'field');s.enemies=lua.table();s.actors[2].hp=0
c.dropArtifact(s,2,21,3,330,480);ticks(s,1)
check('drop attracts before pickup',len(s.inventory.ground)==1 and s.inventory.ground[1].x<330)
ticks(s,30);check('proximity collects one stable item',len(s.inventory.ground)==0 and len(s.inventory['items'])==1 and s.inventory['items'][1].id==1)
ticks(s,30);check('pickup not duplicated',len(s.inventory['items'])==1)
for _ in range(79):c.giveArtifact(s,1,21,3)
c.dropArtifact(s,3,25,4,200,480);ticks(s,20)
check('full bag leaves drop intact',len(s.inventory.ground)==1 and len(s.inventory['items'])==80)
c.action(s,'town');saved=validate_save(native(c.checkpoint(s)));s=c.restore(lua.table_from(saved,recursive=True),12)
check('uncollected drop persists across map and save',len(s.inventory.ground)==1 and s.inventory.ground[1].zone=='field')
c.action(s,'artifact_lock:1');money=s.mora;c.action(s,'artifact_sell:1')
check('lock blocks sale',s.mora==money and len(s.inventory['items'])==80)
c.action(s,'artifact_lock:1');c.action(s,'artifact_equip:1');c.action(s,'artifact_sell:1')
check('equipped blocks sale',s.mora==money and len(s.inventory['items'])==80)
c.action(s,'artifact_remove:1');c.action(s,'artifact_sell:1');c.action(s,'artifact_sell:1')
check('sale paid only once',s.mora==money+630 and len(s.inventory['items'])==79)
c.action(s,'artifact_recover');check('town recovery fills free slot',len(s.inventory.ground)==0 and len(s.inventory['items'])==80 and s.inventory['items'][80].id==81)
c.action(s,'artifact_recover');check('recovery not duplicated',len(s.inventory['items'])==80)
for _ in range(16):c.dropArtifact(s,1,21,3,500,480)
check('backlog blocks new attacks without discarding loot',not c.attack(s,s.actors[1],'normal') and len(s.inventory.ground)==16)
saved=validate_save(native(c.checkpoint(s)));bad=json.loads(json.dumps(saved));bad['inventory']['ground'][0]['item']['id']=bad['inventory']['items'][0]['id']
try:validate_save(bad)
except ValueError:checks.append('cross-container duplicate rejected')
else:raise AssertionError('duplicate accepted')
(ROOT/'evidence/loot-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'loot checks passed')
