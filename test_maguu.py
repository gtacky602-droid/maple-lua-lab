import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
def start():
 s=c.new(16);c.action(s,'boss_maguu');s.actors[2].hp=0
 return s,s.maguu,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();check('awake invulnerability',b.invulnerable);tick(s,181);check('first mask warning',b.phase=='mask_warning')
s,b,a=start();b.phase='recover';b.invulnerable=False
cast=lua.table_from({'x':b.x-300});check('far idle hit blocked',c.interceptHit(s,cast,b,'pyro') and b.parries==1)
cast.x=b.x-100;check('near hit allowed',not c.interceptHit(s,cast,b,'pyro'))
b.phase='iai_warning';cast.x=b.x-300;check('attacking boss does not parry',not c.interceptHit(s,cast,b,'pyro'))
s,b,a=start();b.hp=497;b.phase='recover';b.invulnerable=False;tick(s);check('71 percent transition starts',b.phase=='transition' and b.invulnerable and b.minhp==490)
a.x=20;tick(s,151);check('transition releases health floor',b.stage==2 and b.minhp==0 and not b.invulnerable)
s,b,a=start();b.phase='mask_warning';b.invulnerable=False;b.timer=0;b.zoneX=a.x;b.radius=100;a.inv=0;hp=a.hp;tick(s);check('mask hits locked area',a.hp==hp-22)
s,b,a=start();b.phase='mask_warning';b.timer=0;b.zoneX=800;b.radius=100;a.x=100;hp=a.hp;tick(s);check('outside mask avoids damage',a.hp==hp)
s,b,a=start();b.phase='sweep_warning';b.invulnerable=False;b.timer=0;b.stage=2;b.zoneX=b.x;b.radius=160;b['from']=b.x;a.x=20;tick(s);check('second phase queues phantom',b.phase=='phantom_warning' and b.ghost is not None)
a.x=b.ghost.x;a.inv=0;hp=a.hp;tick(s,55);check('phantom damages after warning',a.hp==hp-24 and b.ghost is None)
c.action(s,'pause');t=b.timer;tick(s,60);check('paused timer stable',b.timer==t);c.action(s,'pause');c.action(s,'town');check('exit removes encounter',s.maguu is None)
s,b,a=start();b.hp=0;tick(s);check('death clears hazards',b.phase=='defeated' and b.ghost is None);tick(s,400);check('no boss respawn',b.hp==0)
f=c.frame(s,'rect','h32c16');check('frame exposes encounter',f.boss.name=='魔偶剣鬼')
(ROOT/'evidence/maguu-test.json').write_text(json.dumps({'checks':checks,'count':len(checks),'scope':'controlled mechanics tests; not input-only playthrough'},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'Maguu checks passed')

