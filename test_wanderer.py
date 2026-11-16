import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene(xs=(300,)):
 s=c.new(12);a=s.actors[1];a.atk=100;s.actors[2].hp=0;es=[]
 for i,x in enumerate(xs):
  e=s.enemies[i+1];e.x=x;e.home=x;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True;es.append(e)
 s.enemies=lua.table_from(es);return s,a,es
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
def windscene():
 s,a,es=scene();enemies=s.enemies;c.action(s,'campaign');c.action(s,'companion:wanderer');s.enemies=enemies;s.active=2;s.actors[1].hp=0;b=s.actors[2];b.hp=140;b.atk=100;b.x=200;b.inv=0;return s,b,es
s,b,es=windscene();c.attack(s,b,'normal');ticks(s,19);check('normal wind three 120 percent hits',s.hits==3 and s.damage==342)
s,b,es=windscene();check('aerial barrage rejected outside float',not c.attack(s,b,'skill2') and b.cd.skill2 is None)
c.attack(s,b,'skill1');ticks(s,22);check('float physically lifts actor',b.y<400 and not b.ground)
c.attack(s,b,'normal');ticks(s,19);check('floating normal receives fifteen percent once',s.hits==3 and s.damage==393)
s,b,es=windscene();c.attack(s,b,'skill1');ticks(s,22);c.attack(s,b,'skill2');ticks(s,34);check('floating aerial barrage six hits',s.hits==6 and s.damage==684)
s,b,es=windscene();c.attack(s,b,'skill3');check('wind evasion grants 0.45 seconds invulnerability',b.inv==.45)
c.damageActor(s,b,100,es[0],False);check('evasion prevents hit',b.hp==140)
ticks(s,19);check('evasion counterattack three hits',s.hits==3 and s.damage==285)
s,b,es=windscene();c.attack(s,b,'skill4');ticks(s,43);check('storm ultimate eight hits',s.hits==8 and s.damage==1256)
s,b,es=windscene();s.enemies=lua.table();c.attack(s,b,'skill1');ticks(s,60);check('float holds hundred-pixel lift',b.y==380)
for _ in range(30):c.step(s,1/60,lua.table_from({'right':True}))
check('float supports horizontal steering',b.x>300 and b.y==380)
ticks(s,560);check('float expires and lands',b.y==480 and b.ground)
s,b,es=windscene();c.attack(s,b,'skill1');c.action(s,'pause');ticks(s,120);check('pause freezes float timer',b.floatUntil==10 and s.t==0)
s,b,es=windscene();c.attack(s,b,'skill1');c.action(s,'field');check('map removes float buff',b.floatUntil==0)
c.action(s,'town');r=c.restore(c.checkpoint(s));check('wanderer selection saved',r.companion=='wanderer')
s,b,es=windscene();s.active=1;s.actors[1].hp=140;c.companionAI(s,b,es[0]);check('AI opens with float',b.floatUntil==10)
(ROOT/'evidence/wanderer-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'wanderer checks passed')
