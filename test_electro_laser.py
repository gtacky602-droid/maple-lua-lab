import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(16);c.action(s,'boss_electro');b=s.electroHypostasis;b.cycle=2;b.timer=0;s.actors[2].hp=0
 return s,b,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();tick(s);check('third cycle laser warning',b.phase=='laser_warning' and len(b.laserCells)>0)
a.x=800;a.inv=0;hp=a.hp;tick(s,60);check('warning harmless',a.hp==hp)
tick(s,32);check('laser exposes core',b.phase=='laser' and not b.invulnerable)
b.laserAngle=0;a.x=800;a.y=480;a.inv=0;hp=a.hp;tick(s);check('rendered horizontal beam hits body',a.hp==hp-18)
hp=a.hp;tick(s,10);check('invulnerability prevents per cell repeated damage',a.hp==hp)
a.x=b.x;a.inv=0;hp=a.hp;tick(s);check('inner ring safe',a.hp==hp)
f=c.frame(s,'sprite');draws=[d for _,d in f.draws.items() if d.color=='#e2a2ff'];check('render cells match collision exactly',len(draws)==len(b.laserCells) and all(d.x==b.laserCells[i+1].x and d.y==b.laserCells[i+1].y and d.w==14 and d.h==14 for i,d in enumerate(draws)))
angle=b.laserAngle;tick(s,10);check('laser rotates',b.laserAngle>angle)
c.action(s,'pause');angle=b.laserAngle;tick(s,30);check('pause freezes rotation',b.laserAngle==angle);c.action(s,'pause')
b.timer=0;tick(s);check('collapse telegraphed and beams removed',b.phase=='collapse_warning' and b.laserCells is None)
a.x=900;a.inv=0;hp=a.hp;tick(s,67);check('escaping convergence avoids damage',a.hp==hp and b.phase=='exposed')
s,b,a=start();tick(s,94);b.hp=1;tick(s);check('revival interrupts beam',b.phase=='revival' and b.laserCells is None)
c.action(s,'town');check('exit clears laser encounter',s.electroHypostasis is None)
(ROOT/'evidence/electro-laser-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'laser checks passed')
