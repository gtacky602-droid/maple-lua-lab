import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def fresh():
 s=c.new(16);c.action(s,'boss_pyro_regisvine');s.actors[2].hp=0;s.actors[1].inv=0;return s,s.pyroRegisvine,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def strike(s,b,element='hydro',y=None):
 c.resolveCast(s,lua.table_from(dict(id=1,key='core',atk=10,x=b.x-20,y=y or b.coreY,dir=1,range=120,limit=1,mult=1,color='#fff',element=element,gain=0)))
s,b,a=fresh();check('starts with root and own fire resistance',b.core==6 and b.coreY==480 and b.resist.pyro==.7)
strike(s,b,'pyro');check('pyro cannot reduce core',b.core==6)
strike(s,b);strike(s,b);check('hydro reduces core once per cooldown',b.core==5)
for _ in range(5):tick(s,16);strike(s,b)
check('six applications down boss',b.phase=='down' and b.breaks==1)
hp=b.hp;strike(s,b);check('down removes damage reduction',hp-b.hp==9)
a.x=20;tick(s,680);check('core restores after warned recovery',b.core==6 and b.phase=='ready')
b.breaks=2;b.phase='rise_warning';b.timer=.001;tick(s);check('later core rises to head',b.coreY==350)
hp=b.hp;strike(s,b,y=480);check('ground body hit leaves head core intact',b.hp<hp and b.core==6)
strike(s,b);check('aerial hydro can hit head core',b.core==5)
s,b,a=fresh();b.phase='slam_warning';b.timer=.001;b.target=500;a.x=100;tick(s);check('slam spawns two opposing waves',len(b.waves)==2 and b.waves[1].x<500<b.waves[2].x)
a.x=400;a.y=350;a.vy=-100;hp=a.hp;tick(s,20);check('jump clears wave',a.hp==hp)
a.x=650;a.y=480;a.inv=0;hp=a.hp;tick(s,25);check('ground wave actually damages',a.hp<hp)
s,b,a=fresh();b.phase='fire_warning';b.timer=.001;b.targetActor=1;tick(s,42);check('three shots emitted over time',b.shots==3 and len(s.projectiles)==3)
check('fireballs do not home',all(p.homingTime==0 and p.source==26020201 for _,p in s.projectiles.items()))
s,b,a=fresh();b.phase='recover';b.timer=.001;b.cycle=2;a.x=400;tick(s);check('third attack marks three eruptions',b.phase=='eruption_warning' and len(b.eruptions)==3)
hp=a.hp;tick(s,60);check('eruption warning no damage',a.hp==hp);a.x=900;tick(s,35);check('leaving marked area avoids eruption',a.hp==hp)
s,b,a=fresh();b.phase='eruption_warning';b.timer=.001;b.eruptions=lua.table_from([100,200,300]);a.x=200;hp=a.hp;tick(s);check('eruption hits marked area',a.hp==hp-24)
c.action(s,'pause');t=b.timer;tick(s,50);check('pause freezes attack',b.timer==t);c.action(s,'pause')
b.core=1;strike(s,b);check('core break cancels eruption',b.phase=='down' and b.eruptions is None and len(b.waves)==0)
a.x=620;a.y=480;a.dir=1;a.atk=10000;a.cd=lua.table();a.lock=0;c.attack(s,a,'normal');tick(s,400);check('kill once no respawn',b.hp==0 and s.kills==1 and b.phase=='defeated')
c.action(s,'town');check('exit clears boss',s.pyroRegisvine is None)
s,b,a=fresh();a.hp=0;tick(s);check('wipe exits arena',s.pyroRegisvine is None and s.campaign.zone=='town')
s,b,a=fresh();r=c.restore(c.checkpoint(s),16);check('checkpoint outside battle',r.pyroRegisvine is None and r.campaign.zone=='town')
c.action(s,'boss_cryo_regisvine');check('switching encounters clears previous boss',s.pyroRegisvine is None and s.regisvine is not None)
(ROOT/'evidence/pyro-regisvine-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'pyro regisvine checks passed')
