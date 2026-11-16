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
s,a,es=scene();a.y=200;a.ground=False;c.attack(s,a,'SK41');check('airborne waterway lands on platform below',s.pending[1].y==340)
s,a,es=scene((320,));c.attack(s,a,'SK41');a.x=1000;ticks(s,480)
check('waterway fixed eight ticks over eight seconds',s.hits==8 and s.damage==760 and len(s.pending)==0)
s,a,es=scene();es[0].flying=True;c.attack(s,a,'SK41');ticks(s,480);check('waterway excludes flying enemy',s.hits==0)
s,a,es=scene();es[0].y=340;c.attack(s,a,'SK41');ticks(s,480);check('waterway excludes upper floor',s.hits==0)
s,a,es=scene((300,400,500));c.attack(s,a,'SK42');ticks(s,63)
check('explosion chain eight pulses three targets',s.hits==24 and es[0].x==364 and es[2].x==564)
s,a,es=scene((300,500));c.attack(s,a,'SK42');check('chain stops across gap',s.hits==1)
s,a,es=scene();es[0].boss=True;c.attack(s,a,'SK42');check('boss not blown away',es[0].x==300)
s,a,es=scene();c.attack(s,a,'SK43');ticks(s,54);check('slash seven hits applies six second debuff',s.hits==7 and es[0].physicalBreak>5.9)
def physical(s):
 c.resolveCast(s,lua.table_from({'id':1,'atk':100,'x':280,'y':480,'dir':1,'range':50,'limit':1,'mult':1,'element':'physical','color':'#fff','gain':0}))
before=s.damage;physical(s);check('physical resistance reduced twelve points',s.damage-before==106)
ticks(s,361);before=s.damage;physical(s);check('physical debuff expires',s.damage-before==95)
s,a,es=scene();es[0].physicalBreak=6;es[0].immune='physical';physical(s);check('debuff does not bypass physical immunity',s.damage==0)
s,a,es=scene((340,));c.attack(s,a,'SK44');a.x=1000;ticks(s,480);check('garden twelve pulses over eight seconds',s.hits==12 and s.damage==1308 and len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK44');a.lock=0;a.cd.SK44=0;c.attack(s,a,'SK44');check('garden replacement does not stack',len(s.pending)==1)
c.action(s,'pause');ticks(s,120);check('pause freezes fields',s.hits==0)
c.action(s,'campaign');check('map clears fields',len(s.pending)==0)
slots=[['SK41','SK42','SK43'],['SK44']]+[[] for _ in range(6)]
check('field skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('field slots persist',r.loadout[2][1]=='SK44')
(ROOT/'evidence/fusion4-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'fusion4 checks passed')
