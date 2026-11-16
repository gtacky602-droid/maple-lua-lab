import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_geo');s.actors[2].hp=0
 b=s.geoHypostasis;a=s.actors[1];a.inv=0
 b.cycle=3;b.phase='perched';b.timer=0;tick(s)
 return s,b,a
s,b,a=start();check('fourth pillar attack tracks actor',b.phase=='seal_tracking' and b.sealX==a.x)
a.x=500;tick(s);check('tracking follows movement',b.sealX==500)
c.action(s,'pause');timer=b.timer;tick(s,60);check('pause freezes tracking',b.timer==timer);c.action(s,'pause')
tick(s,72);check('warning locks position',b.phase=='seal_warning')
x=b.sealX;a.x=x+100;hp=a.hp;tick(s,49);check('moving away avoids column',a.hp==hp and b.phase=='seal_impact' and b.sealX==x)
tick(s,18);check('column clears on exposure',b.phase=='perch_exposed' and b.sealX is None)
s,b,a=start();tick(s,73);hp=a.hp;tick(s,49);check('stationary actor takes column damage',a.hp==hp-26)
s,b,a=start();tick(s,73);b.timer=0;a.y=340;hp=a.hp;tick(s);check('column hits airborne actor',a.hp==hp-26)
s,b,a=start();cast=lua.table_from({'id':1,'key':'test','applicationElement':'geo'})
for _ in range(3):c.interceptHit(s,cast,b.activePillar,'geo');s.t+=.3
check('occupied pillar break cancels tracking',b.phase=='down' and b.sealX is None)
s,b,a=start();b.hp=1;tick(s);check('revival cancels tracking',b.phase=='revival' and b.sealX is None)
def clap():
 s,b,a=start()
 for i in range(2,6):s.enemies[i].hp=0
 b.activePillar=None;b.phase='ground_ready';b.timer=0;b.groundCycle=2;a.x=500;tick(s)
 return s,b,a
s,b,a=clap();check('third ground attack telegraphs clap',b.phase=='clap_warning' and b.x==500)
hp=a.hp;tick(s,67);check('clap damages grounded actor',a.hp==hp-28 and b.phase=='clap_impact')
tick(s,18);check('clap exposes core afterward',b.phase=='ground_exposed' and not b.invulnerable)
s,b,a=clap();a.x=700;hp=a.hp;tick(s,67);check('clap can be avoided laterally',a.hp==hp)
s,b,a=clap();b.timer=0;a.y=350;hp=a.hp;tick(s);check('clap can be jumped',a.hp==hp)
(ROOT/'evidence/geo-seal-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8')
print(len(checks),'seal and clap checks passed')
