import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_array');b=s.array;b.hp=560;s.actors[2].hp=0;tick(s);return s,b,s.actors[1]
s,b,a=start();e=b.parts[1];e.clock=0;tick(s);check('defender shields first',e.state=='shield');cast=lua.table_from({'x':e.x+e.facing*100});check('front blocked',c.interceptHit(s,cast,e,'pyro'));cast.x=e.x-e.facing*100;check('rear allowed',not c.interceptHit(s,cast,e,'pyro'));e.clock=0;tick(s);e.clock=0;tick(s);check('defender alternates leap',e.state=='leap_warning');target=e.target;a.x=900;e.clock=0;tick(s);check('leap lands at snapshot',e.x==target)
s,b,a=start();e=b.parts[2];e.clock=0;tick(s);check('scout warns orb beneath self',e.state=='orb_warning' and e.target==e.x);e.clock=0;a.x=20;tick(s);check('orb remains after deployment',e.state=='orb');a.x=e.target;a.inv=0;hp=a.hp;tick(s);check('orb explodes on contact',e.state=='ready' and a.hp==hp-16)
s,b,a=start();e=b.parts[3];e.clock=0;tick(s);aim=e.aim;a.x=900;e.clock=0;tick(s);shots=[p for p in s.projectiles.values() if p.source==e.id];check('cruiser fires fixed aimed projectile',len(shots)==1 and shots[0].angle==aim and shots[0].homingTime==0)
s,b,a=start();e=b.parts[4];e.clock=0;tick(s);target=e.target;e.clock=0;tick(s);check('destroyer makes field',e.state=='field' and e.target==target);a.x=target;a.inv=0;hp=a.hp;tick(s);check('field damages occupants',a.hp==hp-8)
s,b,a=start();e=b.parts[3];c.spawnEnemyProjectile(s,e.x,430,1,0,lua.table_from({'source':e.id}));b.parts[1].hp=0;tick(s);check('core release removes sentinel shots',len(s.projectiles)==0 and len(b.parts)==0)
s,b,a=start();check('sentinel physical resistances differ',b.parts[1].resist.physical==.5 and b.parts[2].resist.physical==.5 and b.parts[3].resist.physical==.3 and b.parts[4].resist.pyro==.1)
(ROOT/'evidence/array-sentinels-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'sentinel checks passed')
