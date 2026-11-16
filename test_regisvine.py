import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'boss_cryo_regisvine');b=s.regisvine;a=s.actors[1];s.actors[2].hp=0;checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def strike(element='pyro',reaction=False):
 c.resolveCast(s,lua.table_from(dict(id=1,key='test',atk=10,x=b.x-20,y=b.coreY,dir=1,range=200,limit=1,mult=1,color='#fff',element=element,gain=0,reaction=reaction)))
check('starts with root core',b.core==6 and b.corePosition=='root')
strike('cryo');check('cryo does not break core',b.core==6)
strike('pyro',True);check('reaction cannot recursively damage core',b.core==6)
strike();check('pyro hit damages core',b.core==5)
strike();check('core hit cooldown',b.core==5)
for _ in range(5):tick(16);strike()
check('core break starts down',b.phase=='down' and b.breaks==1 and b.core==0)
hp=b.hp;tick(16);strike();check('down increases actual damage',hp-b.hp>=9)
a.x=20;tick(600);check('warning before standing',b.phase=='rise_warning')
strike();check('empty core does not reset down on rising',b.phase=='rise_warning')
tick(75);check('root regenerates after first break',b.core==6 and b.corePosition=='root')
for _ in range(6):tick(16);strike()
check('second break counted',b.phase=='down' and b.breaks==2)
a.x=20;tick(680);check('second recovery moves core to head',b.corePosition=='head' and b.coreY==350 and b.y==480)
core=b.core;c.resolveCast(s,lua.table_from(dict(id=1,key='ground',atk=10,x=b.x-20,y=480,dir=1,range=200,limit=1,mult=1,color='#fff',element='pyro',gain=0)))
check('ground attack does not break raised core',b.core==core)
strike();check('elevated attack hits head',b.core==core-1)
b.phase='slam_warning';b.timer=.001;b.target=150;b.slams=0;a.x=900;hp=a.hp;tick();check('moving avoids locked slam',a.hp==hp and b.slams==1)
a.x=900;a.y=480;a.inv=0;tick(55);check('second slam retargets with warning',a.hp<hp and b.slams==2)
a.x=20;tick(55);check('three slams finish recovery',b.phase=='recover')
c.action(s,'pause');t=b.timer;tick(50);check('pause freezes encounter',b.timer==t);c.action(s,'pause')
b.phase='down';b.timer=10;a.atk=10000;a.x=b.x-30;a.y=b.y;a.dir=1;a.cd=lua.table();a.lock=0;c.attack(s,a,'normal');tick(400);check('kill once without respawn',b.hp==0 and s.kills==1 and b.phase=='defeated')
c.action(s,'town');check('exit cleans encounter',s.regisvine is None)
c.action(s,'boss_cryo_regisvine');s.actors[1].hp=0;s.actors[2].hp=0;tick();check('wipe returns to town',s.regisvine is None and s.campaign.zone=='town')
c.action(s,'boss_cryo_regisvine');r=c.restore(c.checkpoint(s),16);check('checkpoint resumes outside fight',r.regisvine is None and r.campaign.zone=='town')
# Real Amber attack routes through timed cast hooks.
c.action(s,'boss_cryo_regisvine');b=s.regisvine;s.active=2;s.actors[1].hp=0;a=s.actors[2];a.x=400;a.y=480;a.dir=1;a.lock=0;a.cd=lua.table();c.attack(s,a,'skill1');tick(40);check('Amber skill damages core through actual timed hits',b.core<6)
(ROOT/'evidence/regisvine-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'regisvine checks passed')
