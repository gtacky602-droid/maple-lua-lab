import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def fresh():
 s=c.new(16);c.action(s,'boss_pyro_regisvine');s.actors[2].hp=0;b=s.pyroRegisvine;a=s.actors[1];a.x=100;a.inv=0;return s,b,a
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def seed(s,b):
 b.phase='seed_warning';b.timer=.001;b.target=100;tick(s);b.timer=100
 return b.seed
def strike(s,e,element='hydro'):
 c.resolveCast(s,lua.table_from(dict(id=1,key='test',atk=4,x=e.x-20,y=e.y,dir=1,range=50,limit=1,mult=1,element=element,color='#fff',gain=0)))
s,b,a=fresh();e=seed(s,b);check('seed separate target, no reward flag',len(s.enemies)==2 and e.hp==20 and e.noRewards)
strike(s,e,'pyro');check('fire cannot destroy fire seed',e.hp==20)
strike(s,e,'physical');check('physical less effective',e.hp==19)
counts=(s.kills,s.mora,s.progression.killXp);strike(s,e);tick(s);check('water destroys seed and removes target',b.seed is None and len(s.enemies)==1)
check('object destruction gives no kills money or xp',counts==(s.kills,s.mora,s.progression.killXp))
check('no corpse artifact generated',len(s.inventory.ground)==0)
tick(s,500);check('destroyed seed never ignites',b.burn is None)
s,b,a=fresh();e=seed(s,b);hp=a.hp;tick(s,470);check('seed countdown has no contact damage',a.hp==hp)
tick(s,20);check('unhandled seed becomes damaging ground',b.seed is None and b.burn is not None and a.hp==hp-10)
hp=a.hp;tick(s,15);check('burn damage has per actor cooldown',a.hp==hp)
a.x=350;tick(s,65);check('leaving fire ground avoids damage',a.hp==hp)
a.x=100;a.y=340;a.vy=-100;a.inv=0;tick(s);check('airborne avoids fire ground',a.hp==hp)
c.action(s,'pause');t=s.t;tick(s,50);check('pause freezes seed and burn timer',s.t==t);c.action(s,'pause');tick(s,360);check('ground expires',b.burn is None)
s,b,a=fresh();seed(s,b);b.core=1;strike(s,b);check('boss core break cancels seed',b.phase=='down' and b.seed is None and len(s.enemies)==1)
s,b,a=fresh();b.phase='spin_warning';b.timer=.001;a.x=640;hp=a.hp;tick(s);check('spin hits nearby actor',a.hp==hp-32 and b.phase=='spin_active')
s,b,a=fresh();b.phase='spin_warning';b.timer=.001;a.x=100;hp=a.hp;tick(s);check('spin avoids distant actor',a.hp==hp)
s,b,a=fresh();seed(s,b);b.hp=0;tick(s);check('boss death clears seed',b.seed is None and len(s.enemies)==1)
s,b,a=fresh();seed(s,b);c.action(s,'town');check('map exit clears seed',s.pyroRegisvine is None and len(s.enemies)==0)
(ROOT/'evidence/pyro-seed-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'seed/spin checks passed')
