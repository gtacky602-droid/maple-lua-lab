import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(16);c.action(s,'boss_array');s.actors[2].hp=0;return s,s.array,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();check('normal resistance',b.resist.physical==.7 and b.resist.pyro==.1);b.hp=560;tick(s);check('HP split and four parts',b.phase=='split' and b.invulnerable and len(b.parts)==4);check('only marked part damageable',not b.parts[1].invulnerable and all(b.parts[i].invulnerable for i in [2,3,4]));hp=b.hp;a.atk=100;a.x=b.x-20;a.dir=1;c.attack(s,a,'normal');tick(s);check('core immune during split',b.hp==hp)
e=b.parts[1];a.x=e.x-20;a.y=480;a.dir=1;a.lock=0;a.cd=lua.table();a.atk=1000;c.attack(s,a,'normal');tick(s,2);check('marked defeat exposes core',b.phase=='down' and not b.invulnerable and len(b.parts)==0);check('no kill rewards from sentinels',s.kills==0 and s.mora==0);check('down subtracts 50 percent resistance',abs(b.resist.physical-.2)<.001 and abs(b.resist.pyro+.4)<.001);tick(s,601);check('normal resistance restored',b.resist.physical==.7 and b.phase!='down');b.hp=200;tick(s);check('split does not repeat',b.phase!='split')
s,b,a=start();b.elapsed=30;tick(s);check('time can trigger split',b.phase=='split');c.action(s,'pause');t=b.parts[1].clock;tick(s,60);check('pause freezes sentinel timers',b.parts[1].clock==t);c.action(s,'pause');c.action(s,'town');check('exit clears encounter',s.array is None)
s,b,a=start();b.phase='sword_warning';b.timer=0;b.facing=-1;a.x=b.x-110;a.inv=0;hp=a.hp;tick(s);check('sword hit matches warning region',a.hp==hp-22)
s,b,a=start();b.hp=0;tick(s);check('defeat removes parts',b.phase=='defeated' and len(b.parts)==0);tick(s,400);check('no respawn',b.hp==0)
(ROOT/'evidence/array-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'array checks passed')

