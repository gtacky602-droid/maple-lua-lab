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
s,a,es=scene((500,));c.attack(s,a,'SK33');ticks(s,165)
check('tornado twelve hits pulls small enemy',s.hits==12 and es[0].x==380)
s,a,es=scene((500,));es[0].boss=True;c.attack(s,a,'SK33');ticks(s,165)
check('tornado cannot pull boss',es[0].x==500)
s,a,es=scene();check('glide requires airborne cast',not c.attack(s,a,'SK34'))
a.y=100;a.ground=False;a.vy=200;s.platforms=lua.table();es[0].x=a.x;es[0].y=a.y
c.attack(s,a,'SK34');ticks(s,30);check('glide limits falling speed',a.vy<=90 and a.y<=145.01)
for _ in range(270):
 es[0].x=a.x;es[0].y=a.y;c.step(s,1/60,lua.table())
check('contact max six hits per enemy over five seconds',s.hits==6 and len(s.pending)==0)
ticks(s,2);check('glide ends after five seconds',a.glide==0 and a.vy>90)
s,a,es=scene();a.y=470;a.ground=False;c.attack(s,a,'SK34');ticks(s,20)
check('landing ends glide and pending contact',a.ground and a.glide==0 and len(s.pending)==0)
s,a,es=scene();es[0].y=390;c.attack(s,a,'SK35');p=s.platforms[len(s.platforms)]
check('magnetic platform floats ninety above cast',p.y==390 and p.structure=='magnetic')
a.x=p.x+60;a.y=370;a.vy=100;ticks(s,15);check('magnetic platform supports actor',a.y==390 and a.ground)
ticks(s,465);check('six pulses and eight second expiry',s.hits==6 and len(s.pending)==0 and not any(p.structure=='magnetic' for _,p in s.platforms.items()))
s,a,es=scene();c.attack(s,a,'SK35');a.lock=0;a.cd.SK35=0;c.attack(s,a,'SK35')
check('one magnetic platform and discharge',len(s.pending)==1 and sum(p.structure=='magnetic' for _,p in s.platforms.items())==1)
s,a,es=scene();es[0].defense=100;c.attack(s,a,'SK36');ticks(s,30)
check('fist applies nonstacking armor reduction',s.hits==3 and es[0].armorBreak>5.9 and s.damage==230+248+248)
ticks(s,361);check('armor break expires',es[0].armorBreak==0)
s,a,es=scene();c.attack(s,a,'SK35');c.action(s,'campaign');check('transition clears platform',not any(p.structure=='magnetic' for _,p in s.platforms.items()))
slots=[['SK33','SK35','SK36'],['SK34']]+[[] for _ in range(6)]
check('four skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('four skills persist',r.loadout[2][1]=='SK34')
(ROOT/'evidence/fusion2-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'fusion2 checks passed')
