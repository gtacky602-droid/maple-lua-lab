import json
from runtime import runtime, ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n): c.step(s,1/60,lua.table())
s=c.new(16);c.action(s,'boss_thunder');b=s.thunder;a=s.actors[1];s.actors[2].hp=0
b.enraged=True;b.cycle=2;b.phase='recover';b.timer=0;a.x=300;tick(s)
check('third cycle starts three strikes',b.phase=='bolt_warning' and b.boltCount==0)
check('first target captured',b.target==300)
a.x=800;tick(s,10);check('warning does not track',b.target==300)
c.action(s,'pause');t=b.timer;tick(s,60);check('pause freezes warning',b.timer==t);c.action(s,'pause')
for hit in range(1,4):
 a.x=b.target;a.inv=0;hp=a.hp;b.timer=0;tick(s)
 check(f'strike {hit} damages once',a.hp==hp-16 and b.boltCount==hit and b.phase=='bolt_flash')
 hp=a.hp;tick(s,5);check(f'flash {hit} does not repeat damage',a.hp==hp)
 a.x=100+hit*100;b.timer=0;tick(s)
 if hit<3:check(f'next strike {hit+1} retargets',b.phase=='bolt_warning' and b.target==a.x)
check('third strike ends cycle',b.phase=='recover' and b.boltCount is None)
b.phase='bolt_warning';b.boltCount=1;b.timer=.5;b.hp=0;tick(s)
check('death cancels pending strike',b.phase=='defeated' and b.boltCount is None)
(ROOT/'evidence/thunder-bolts-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8')
print(len(checks),'triple bolt checks passed')
