import json
from runtime import runtime,native,ROOT
from savegame import validate_save
lua,c=runtime();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
s=c.new(12);c.action(s,'campaign');c.action(s,'artifact_samples')
for _,item in s.inventory['items'].items():item.subpair=None
c.action(s,'artifact_equip:1');c.action(s,'artifact_equip:2')
a=s.actors[1];feather=c.artifactStats(s.inventory['items'][2])
check('gladiator two set adds twelve percent ATK',a.atk==int((4+feather)*1.12))
c.action(s,'artifact_equip:3');c.action(s,'artifact_equip:4')
check('four set normal bonus only',a.normalBonus==.2 and a.skillBonus==0)
c.action(s,'artifact_remove:4');check('fall below four disables effect',a.normalBonus==0)
check('companion does not inherit traveler set',s.actors[2].normalBonus==0 and s.actors[2].setCounts.gladiator==0)
c.action(s,'target_set:troupe');c.dropArtifact(s,2,21,3,200,480)
check('targeted set on new drops',s.inventory.ground[1].item.setId=='troupe')
check('old items do not mutate when target changes',s.inventory['items'][1].setId=='gladiator')
for _,item in s.inventory['items'].items():item.setId='troupe'
c.action(s,'artifact_equip:4');check('troupe two and four active',a.skillBonus==.12 and a.troupe4)
c.action(s,'field');s.active=1;s.actors[2].hp=0;s.actors[1].x=200
e=s.enemies[1];e.hp=100000;e.maxhp=100000;e.x=250;e.home=250;e.custom=True;s.enemies=lua.table_from([e])
def hit(auto,crit):
 s.pending=lua.table();s.auto=auto;a.atk=100;a.critRate=crit;a.critDamageBonus=.3;a.lock=0;a.cd=lua.table();a.x=200;a.y=480;a.dir=1
 before=e.hp;c.attack(s,a,'skill1');return before-e.hp
check('manual troupe bonus uses 15 percent',hit(False,0)==int(100*1.2/1.05*(1+.12+.15+a.elementBonus)))
check('AI troupe bonus uses 25 percent',hit(True,0)==int(100*1.2/1.05*(1+.12+.25+a.elementBonus)))
normal=hit(False,0);critical=hit(False,1)
check('critical bonus enters final damage',critical==int(100*1.2/1.05*(1+.12+.15+a.elementBonus)*1.8) and critical>normal)
events=[ev for _,ev in s.events.items() if ev.kind=='hit'];check('critical event flagged',events[-1].critical)
c.action(s,'town');saved=validate_save(native(c.checkpoint(s)))
restored=c.restore(lua.table_from(saved,recursive=True),12)
check('critical sequence survives save restore',[c.criticalRoll(s,.2) for _ in range(40)]==[c.criticalRoll(restored,.2) for _ in range(40)])
legacy=json.loads(json.dumps(saved))
for item in legacy['inventory']['items']:item.pop('setId',None);item.pop('subpair',None)
restored=c.restore(lua.table_from(validate_save(legacy),recursive=True),12)
check('legacy gear gains no invented set bonuses',restored.actors[1].skillBonus==0 and restored.actors[1].normalBonus==0)
(ROOT/'evidence/sets-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'set and critical checks passed')
