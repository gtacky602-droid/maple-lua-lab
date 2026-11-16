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
s,a,es=scene((300,));es[0].y=340;c.attack(s,a,'SK29');ticks(s,63)
check('rock storm eight hits on upper tier',s.hits==8 and s.damage==1024)
s,a,es=scene();es[0].immune='anemo';c.attack(s,a,'SK29');check('one immune component halves damage',s.damage==64)
s,a,es=scene();es[0].immune='anemo';es[0].resist=lua.table_from({'geo':.1});c.attack(s,a,'SK29');check('remaining element resistance applies',s.damage==57)
s,a,es=scene();es[0].resist=lua.table_from({'anemo':1,'geo':1});c.attack(s,a,'SK29');check('all components immune no damage',s.damage==0)
s,a,es=scene();a.elementBonus=.2;c.attack(s,a,'SK29');check('all element bonus added once',s.damage==154)
s,a,es=scene((300,700));c.attack(s,a,'SK30');ticks(s,60)
check('electrified coat first pulse at one second',s.hits==1 and s.damage==71 and es[0].aura.element=='electro')
a.x=700;ticks(s,540);check('coat follows owner for ten pulses',s.hits==10 and len(s.pending)==0)
check('fusion never auto swirls itself',s.reactions is None)
s,a,es=scene();es[0].immune='electro';c.attack(s,a,'SK30');ticks(s,60);check('wind damage does not apply immune electro aura',s.damage==35 and es[0].aura is None)
s,a,es=scene((300,800));es[1].y=260;c.attack(s,a,'SK31');es[1].x=850;ticks(s,45)
check('leaf blades track far high target six times',s.hits==6 and es[0].hp==10000 and es[1].hp==8572)
s,a,es=scene((300,350,400));c.attack(s,a,'SK32');ticks(s,48)
check('spiral spear nine hits two targets',s.hits==18 and es[2].hp==10000 and es[0].aura.element=='hydro')
check('fusion hit event separate from reaction',all(e.element=='fusion' and not e.reaction for _,e in s.events.items() if e.kind=='hit'))
s,a,es=scene();c.attack(s,a,'SK30');c.action(s,'pause');ticks(s,120);check('pause freezes coat',s.hits==0)
c.action(s,'pause');a.hp=0;ticks(s,1);check('death removes coat',len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK30');c.action(s,'campaign');check('map removes coat',len(s.pending)==0)
slots=[['SK29','SK30','SK31'],['SK32']]+[[] for _ in range(6)]
check('fusion skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('fusion slots persist',r.loadout[1][3]=='SK31' and r.loadout[2][1]=='SK32')
(ROOT/'evidence/fusion-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'fusion checks passed')
