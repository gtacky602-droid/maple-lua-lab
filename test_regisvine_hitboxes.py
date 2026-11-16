import json,math
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def fresh():
 s=c.new(16);c.action(s,'boss_cryo_regisvine');s.actors[2].hp=0;b=s.regisvine;b.corePosition='head';b.breaks=2;b.timer=100;c.step(s,1/60,lua.table());return s,b
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def strike(s,b,y,vertical=75):
 c.resolveCast(s,lua.table_from(dict(id=1,key='geometry',atk=100,x=b.x-30,y=y,dir=1,range=100,limit=2,mult=1,vertical=vertical,color='#fff',element='pyro',gain=0)))
s,b=fresh();hp=b.hp;strike(s,b,480);check('ground body damage without head core damage',b.hp<hp and b.core==6)
tick(s,16);hp=b.hp;hits=s.hits;strike(s,b,350);check('head hit damages body and core once',b.hp<hp and b.core==5 and s.hits==hits+1)
tick(s,16);hits=s.hits;strike(s,b,420,200);check('wide attack does not double hit overlapping body and core',s.hits==hits+1 and b.core==4)
tick(s,16);hp=b.hp;strike(s,b,250);check('above both hitboxes misses',b.hp==hp)
b.phase='slam_warning';b.timer=1;tick(s);check('slam lowers head but keeps body stationary',b.coreY==480 and b.y==480)
tick(s,16);strike(s,b,480);check('lowered head reachable from ground',b.core==3)
s,b=fresh();b.phase='ice_warning';b.timer=.001;tick(s);check('ice attack emits three real projectiles',len(s.projectiles)==3)
p=s.projectiles[1];check('projectiles own source and finite homing',p.source==26020101 and p.homingTime==1.5)
s.actors[1].x=20;s.actors[1].y=200;s.actors[1].vy=0;p.x=900;p.y=100;p.angle=0
before=p.angle;tick(s);check('initial flight turns toward target',p.angle!=before)
p.age=1.6;p.x=900;p.y=100;p.angle=0;tick(s);check('after homing deadline flies straight',p.angle==0)
c.action(s,'pause');age=p.age;x=p.x;tick(s,30);check('pause freezes projectile age and position',p.age==age and p.x==x);c.action(s,'pause')
b.hp=0;tick(s);check('boss defeat clears owned projectiles',len(s.projectiles)==0)
s,b=fresh();b.phase='ice_warning';b.timer=.001;tick(s);c.action(s,'town');check('exit clears attack and hitbox state',len(s.projectiles)==0 and s.regisvine is None)
(ROOT/'evidence/regisvine-hitboxes-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'hitbox/projectile checks passed')
