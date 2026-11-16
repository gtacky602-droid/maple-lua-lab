import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def enemy(kind):
 s=c.new(16);c.action(s,'boss_oceanid');s.actors[2].hp=0;tick(s,121)
 e=s.enemies[2];s.enemies=lua.table_from([s.oceanid,e]);e.mimic=kind;e.x=200;e.y=350 if kind=='raptor' else 480;e.state='ready';e.clock=0;e.hp=100;e.maxhp=100
 a=s.actors[1];a.x=800;a.inv=0;tick(s)
 return s,e,a
for kind in ['raptor','frog','finch']:
 s,e,a=enemy(kind);target=e.target
 check(kind+' distant landing capped at reachable position',abs(target-e.origin)<=325.001)
 f=c.frame(s,'sprite','legacy');r=65 if kind=='raptor' else 110
 check(kind+' marker matches damage radius',any(d.kind=='rect' and d.y==472 and d.w==2*r and d.x==int(target-r) for d in f.draws.values()))
 a.x=target;a.inv=0;e.clock=0;tick(s);hp=a.hp;tick(s,15)
 check(kind+' attack is in flight before impact',e.state=='strike' and a.hp==hp and e.y<480)
 c.action(s,'pause');y=e.y;x=e.x;tick(s,30);check(kind+' pause freezes trajectory',e.y==y and e.x==x);c.action(s,'pause')
 tick(s,16);check(kind+' landing matches target and damage',e.state=='recover' and abs(e.x-target)<.001 and abs(e.y-480)<.001 and a.hp==hp-20)
 tick(s,25);check(kind+' returns to rest height',e.state=='ready' and e.y==(350 if kind=='raptor' else 480))
 s,e,a=enemy(kind);a.x=e.target+120;e.clock=0;tick(s);hp=a.hp;tick(s,31);check(kind+' outside marker avoids damage',a.hp==hp)
s,e,a=enemy('crane');angle=e.aim;a.x=50;e.clock=0;tick(s)
check('crane projectile keeps telegraphed direction',len(s.projectiles)==1 and s.projectiles[1].angle==angle)
s,e,a=enemy('boar');f=c.frame(s,'sprite','legacy');width=abs(e.target-e.origin)+90
check('boar marks entire swept charge corridor',any(d.kind=='rect' and d.y==472 and abs(d.w-width)<.001 for d in f.draws.values()))
(ROOT/'evidence/oceanid-attacks-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'attack geometry checks passed')
