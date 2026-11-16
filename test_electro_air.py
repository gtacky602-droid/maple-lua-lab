import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
lua.execute('return function(C) local spawn=C.spawnEnemyProjectile;C.spawnEnemyProjectile=function(s,...) s.shotCalls=(s.shotCalls or 0)+1;return spawn(s,...) end end')(c)
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_electro');b=s.electroHypostasis;b.cycle=4;b.timer=0;s.actors[2].hp=0;s.actors[1].x=100;tick(s)
 return s,b,s.actors[1]
s,b,a=start();check('fifth attack telegraphed',b.phase=='air_warning' and not s.shotCalls)
tick(s,67);check('ascends and exposes actual hit position',b.flying and b.y==350 and not b.invulnerable)
tick(s,13);check('first volley contains two shots',s.shotCalls==2 and len(s.projectiles)==2)
p=s.projectiles[1];angle=p.angle;a.x=900;tick(s,4);check('shots do not home after launch',p.angle==angle and p.source==b.id and p.damage==16)
hp=b.hp;a.x=b.x-20;a.y=480;a.dir=1;a.lock=0;a.cd.normal=0;c.attack(s,a,'normal');check('ground normal cannot reach elevated core',b.hp==hp)
a.y=350;a.lock=0;a.cd.normal=0;c.attack(s,a,'normal');check('airborne attack reaches exposed core',b.hp<hp)
a.x=100;tick(s,120);check('four volleys spawn exactly eight shots',s.shotCalls==8 and b.volleys==4)
tick(s,80);check('returns to grounded exposed state',b.phase=='exposed' and b.y==480 and not b.flying)
s,b,a=start();tick(s,82);c.action(s,'pause');t=b.timer;x=s.projectiles[1].x;tick(s,30);check('pause freezes boss and bullets',b.timer==t and s.projectiles[1].x==x);c.action(s,'pause')
b.hp=1;tick(s);check('revival removes owned bullets and lowers core',b.phase=='revival' and len(s.projectiles)==0 and b.y==480)
s,b,a=start();tick(s,82);b.hp=0;tick(s);check('death removes owned bullets',len(s.projectiles)==0)
s,b,a=start();tick(s,82);c.action(s,'town');check('exit clears bullets',len(s.projectiles)==0 and s.electroHypostasis is None)
(ROOT/'evidence/electro-air-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'air checks passed')
