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
s,a,es=scene((250,270,290,310,330));c.attack(s,a,'SK25');ticks(s,18)
check('ice sword three hits four targets',s.hits==12 and s.damage==219*12 and es[4].hp==10000)
check('cooldown enforced',not c.attack(s,a,'SK25'))
s,a,es=scene(tuple(range(250,430,20)));c.attack(s,a,'SK26');ticks(s,48)
check('wave five hits eight targets',s.hits==40 and es[8].hp==10000)
check('cold marker applied',es[0].chill>3.9)
ticks(s,241);check('cold marker expires',es[0].chill==0)
s,a,es=scene((380,));c.attack(s,a,'SK27');ticks(s,60)
check('cage first pulse binds',s.hits==1 and es[0].root>1.9)
ticks(s,120);check('same cage cannot extend bind beyond two seconds',es[0].root==0)
ticks(s,60);check('cage four damage pulses then expires',s.hits==4 and s.damage==416 and len(s.pending)==0)
s,a,es=scene((380,));es[0].boss=True;c.attack(s,a,'SK27');ticks(s,60)
check('boss slowed instead of rooted',es[0].slow>1.9 and es[0].root==0)
s,a,es=scene((250,350,400));c.attack(s,a,'SK28');ticks(s,34)
check('close scatter concentrates eight pellets',s.hits==8 and es[0].hp==9016 and es[1].hp==10000)
s,a,es=scene((350,400,450,500));c.attack(s,a,'SK28');ticks(s,34)
check('far scatter divides 3 3 2 across max three',s.hits==8 and [e.hp for e in es]==[9631,9631,9754,10000])
check('scatter awards gauge only once',s.gauge==65)
s,a,es=scene();es[0].immune='cryo';c.attack(s,a,'SK25');ticks(s,18);check('cryo immunity',s.damage==0)
s,a,es=scene((380,));c.attack(s,a,'SK27');c.action(s,'pause');ticks(s,120);check('pause freezes cage',s.hits==0 and len(s.pending)==1)
c.action(s,'pause');a.hp=0;ticks(s,1);check('death removes cage',len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK27');c.action(s,'campaign');check('map removes cage',len(s.pending)==0)
slots=[['SK25','SK26','SK27'],['SK28']]+[[] for _ in range(6)]
check('cryo skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('cryo slots persist',r.loadout[1][3]=='SK27' and r.loadout[2][1]=='SK28')
(ROOT/'evidence/cryo-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'cryo checks passed')
