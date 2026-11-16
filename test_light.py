import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);a=s.actors[1];a.atk=100;s.actors[2].lock=999
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s,a,e=scene();c.action(s,'light');check('Q consumes sixty and sets duration and shared cooldown',s.gauge==0 and a.light==12 and a.cd.SK58==60 and a.cd.light==60)
check('activation has action lock',not c.attack(s,a,'normal'))
ticks(s,22);c.attack(s,a,'normal');ticks(s,30);check('light normal four 190 percent hits with eighteen percent once',s.hits==4 and s.damage==852)
check('light normal applies no aura',e.aura is None)
s,a,e=scene();a.elementBonus=.2;c.attack(s,a,'SK58');ticks(s,22);c.attack(s,a,'SK09');ticks(s,30);check('element bonus adds once alongside equipment',s.damage==524)
s,a,e=scene();s.gauge=59;check('low gauge rejects without cooldown',not c.attack(s,a,'SK58') and a.cd.light is None and s.gauge==59)
s,a,e=scene();s.paused=True;c.action(s,'light');check('pause blocks activation',s.gauge==60 and a.light==0)
s,a,e=scene();a.hp=0;c.action(s,'light');check('death blocks activation',s.gauge==60 and a.light==0)
s,a,e=scene();s.active=2;c.action(s,'light');check('companion cannot activate',s.gauge==60)
s,a,e=scene();c.attack(s,a,'SK58');s.gauge=100;a.lock=0;c.action(s,'light');check('Q and slot share cooldown',s.gauge==100 and a.light==12)
s,a,e=scene();c.attack(s,a,'SK58');s.paused=True;ticks(s,800);check('pause freezes duration and cooldown',a.light==12 and a.cd.light==60)
s,a,e=scene();c.attack(s,a,'SK58');ticks(s,721);c.attack(s,a,'normal');ticks(s,15);check('expiry returns to normal two hits',s.hits==2 and s.damage==208)
s,a,e=scene();c.attack(s,a,'SK58');a.hp=0;ticks(s,1);check('death clears form',a.light==0)
s,a,e=scene();c.attack(s,a,'SK58');c.action(s,'campaign');check('map change clears form',a.light==0)
s,a,e=scene();a.light=12;b=s.actors[2];b.atk=100;b.lock=0
c.attack(s,b,'normal');b.lock=999;ticks(s,20);check('AI companion bonus ten percent',s.damage==198)
s,a,e=scene();a.light=12;a.lock=999;s.active=2;b=s.actors[2];b.atk=100;b.lock=0
c.attack(s,b,'normal');ticks(s,20);check('manual companion has no AI bonus',s.damage==180)
s,a,e=scene();c.action(s,'campaign');c.configure(s,lua.table_from([['SK58','SK09']]+[[] for _ in range(7)],recursive=True));d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('slot save valid',r.loadout[1][1]=='SK58');c.action(s,'slot1');ticks(s,60);check('macro activates and proceeds after lock',s.macro is None and a.light>0 and a.cd.SK09>0)
s,a,e=scene();c.action(s,'campaign');c.configure(s,lua.table_from([['SK58']]+[[] for _ in range(7)],recursive=True));s.gauge=0;c.action(s,'slot1');ticks(s,1);check('insufficient gauge stops macro with notice',s.macro is None and s.skillNotice is not None)
(ROOT/'evidence/light-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'light checks passed')
