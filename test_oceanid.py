import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_oceanid');s.actors[2].hp=0;return s,s.oceanid
def cast(s,e,element):
 c.resolveCast(s,lua.table_from(dict(id=1,key='test',atk=100,x=e.x,y=e.y,dir=1,radial=True,range=1,limit=1,mult=1,element=element,color='#fff',gain=0,targetId=e.id)))
s,b=start();cast(s,b,'pyro');check('host cannot be damaged',b.hp==500)
tick(s,121);check('first wave has two boars',b.wave==1 and len(s.enemies)==3 and s.enemies[2].mimic=='boar')
e=s.enemies[2];hp=e.hp;cast(s,e,'hydro');check('mimic immune to water',e.hp==hp)
e.hp=20;tick(s,30);check('boar regenerates',e.hp>20)
c.action(s,'pause');clock=e.clock;tick(s,60);check('pause freezes encounter',e.clock==clock);c.action(s,'pause')
seen=set();waves=[];sinks=[];startkills=s.kills
for _ in range(2500):
 if b.hp<=0:break
 if b.phase=='mimics':
  waves.append(b.wave)
  for j in range(2,len(s.enemies)+1):
   e=s.enemies[j];seen.add(e.mimic)
   if e.hp>0:c.defeatEnemy(s,e,1)
 if b.phase=='sink_warning':sinks+=list(b.sinkTargets.values())
 s.actors[1].inv=1;s.actors[2].inv=1
 tick(s)
check('eight species across five waves',len(seen)==8 and set(waves)=={1,2,3,4,5})
check('sinking avoids central tile',set(sinks)=={1,2,8,9} and 5 not in sinks)
check('only host awards kill',s.kills==startkills+1 and b.phase=='defeated')
check('victory clears hazards',len(b.bombs)==0 and len(b.sunk)==0)
tick(s,500);check('no respawn or repeated victory',b.hp==0 and s.kills==startkills+1)
s,b=start();tick(s,121);b.elapsed=45;tick(s);check('timeout starts following whirlpool',b.whirlpool is not None)
s.actors[1].x=600;tick(s);check('whirlpool follows player',b.whirlpool.x==600)
c.action(s,'town');check('exit clears encounter',s.oceanid is None)
s,b=start();s.paused=True;c.action(s,'boss_oceanid');check('pause prevents restart',s.oceanid.timer==b.timer and s.oceanid.id==b.id)
s,b=start();a=s.actors[1];a.inv=0;a.x=480;b.bombs=lua.table_from([lua.table_from({'x':480,'timer':0})]);hp=a.hp;tick(s)
check('bomb deals damage at ground height',a.hp==hp-30 and len(b.bombs)==0)
s,b=start();a=s.actors[1];a.inv=0;a.x=480;a.y=350;b.bombs=lua.table_from([lua.table_from({'x':480,'timer':0})]);hp=a.hp;tick(s)
check('jump avoids water bomb',a.hp==hp)
s,b=start();a=s.actors[1];a.inv=0;a.x=50;b.sunk[1]=True;hp=a.hp;tick(s)
check('sunken strip damages grounded actor',a.hp==hp-8)
a.inv=0;a.x=480;hp=a.hp;tick(s);check('center stays safe',a.hp==hp)
s,b=start();tick(s,121);e=s.enemies[2];e.state='warning';e.clock=0;e.target=500;tick(s)
check('boar enters charge',e.state=='strike')
e.x=400;e.target=700;s.actors[1].x=410;s.actors[1].inv=0;hp=s.actors[1].hp;tick(s)
check('charge swept contact damages',s.actors[1].hp==hp-18)
s,b=start();tick(s,121);e=s.enemies[2];e.mimic='crane';e.state='warning';e.clock=0;tick(s)
check('crane launches projectile',len(s.projectiles)>0 and s.projectiles[1].source==b.id)
c.action(s,'town');check('exit removes projectiles',len(s.projectiles)==0)
(ROOT/'evidence/oceanid-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'Oceanid checks passed')
