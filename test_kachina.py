import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.companion='kachina';s.active=2;s.actors[1].lock=999;a=s.actors[2];a.atk=100
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
for key,hits,damage in [('normal',2,190),('skill1',8,832),('skill2',5,665),('skill4',7,1232)]:
 s,a,e=scene();c.attack(s,a,key);ticks(s,500 if key=='skill1' else 50);check(key+' source hits and damage',s.hits==hits and s.damage==damage)
s,a,e=scene();c.attack(s,a,'skill1');a.lock=999;c.action(s,'swap');ticks(s,500);check('top survives control swap',s.hits==8 and s.drillTop is not None);ticks(s,41);check('top expires at nine seconds',s.drillTop is None)
s,a,e=scene();c.attack(s,a,'skill1');a.lock=0;a.cd.skill1=0;c.attack(s,a,'skill1');check('recast replaces top',len(s.pending)==1)
s,a,e=scene();c.attack(s,a,'skill2');ticks(s,20);check('rush moves actor',a.x>290)
s,a,e=scene();s.solids=lua.table_from([{'x':200,'y':400,'w':25,'h':80}],recursive=True);c.attack(s,a,'skill2');ticks(s,20);check('rush respects walls',a.x<200)
def vine(s,a):
 s.platforms[2]=lua.table_from({'x':a.x-60,'y':320,'base':480,'w':120,'structure':'vine','temporary':True,'life':7})
s,a,e=scene();vine(s,a);c.step(s,1/60,lua.table_from({'jump':True}));baseline=a.y
s,a,e=scene();vine(s,a);c.attack(s,a,'skill3');c.step(s,1/60,lua.table_from({'jump':True}));check('climb boost increases actual vertical movement',a.y<baseline and c.traversalRate(s,a)==1.25);ticks(s,301);check('climb boost expires',c.traversalRate(s,a)==1)
s,a,e=scene();c.companionAI(s,a,e);check('flat combat AI avoids traversal buff',a.cd.skill3 is None)
s,a,e=scene();vine(s,a);e.y=340;s.active=1;ticks(s,1);check('AI enables boost at authored climb route',a.climbIntent and a.cd.skill3==12)
s,a,e=scene();c.attack(s,a,'skill1');a.hp=0;ticks(s,550);check('death cancels top',s.hits==0 and s.drillTop is None)
s,a,e=scene();c.attack(s,a,'skill1');s.paused=True;ticks(s,550);check('pause freezes top',s.hits==0 and s.drillTop is not None)
s,a,e=scene();c.attack(s,a,'skill1');c.action(s,'campaign');check('map clears top',s.drillTop is None)
s,a,e=scene();c.action(s,'campaign');d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('selection saved',r.companion=='kachina')
(ROOT/'evidence/kachina-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'kachina checks passed')
