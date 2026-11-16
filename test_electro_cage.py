import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1,**keys):
 for _ in range(n):c.step(s,1/60,lua.table_from(keys))
def start():
 s=c.new(16);c.action(s,'boss_electro');b=s.electroHypostasis;a=s.actors[1];a.x=300;a.inv=0;s.actors[2].hp=0;b.cycle=5;b.timer=0;tick(s)
 return s,b,a
def strike(s,e,element,key):
 c.resolveCast(s,lua.table_from(dict(id=1,key=key,x=e.x-10,y=480,dir=1,range=40,limit=1,atk=9999,mult=1,element=element,color='#fff',gain=0,targetId=e.id)))
s,b,a=start();check('sixth attack warns without walls',b.phase=='cage_warning' and len(s.solids or lua.table())==0)
tick(s,67);check('two pillars block and core exposed',b.phase=='cage' and len(s.enemies)==3 and len(s.solids)==2 and not b.invulnerable)
tick(s,35,right=True);check('walking cannot pass right pillar',a.x<418)
p=s.enemies[3];strike(s,p,'physical','n');check('physical ATK cannot break pillar',p.hp==3)
strike(s,p,'pyro','p');strike(s,p,'pyro','p');check('element gauges use cooldown',p.hp==2)
strike(s,p,'hydro','h');strike(s,p,'electro','e');check('three elemental applications remove wall without rewards',p.hp==0 and len(s.solids)==1 and s.kills==0 and s.mora==0)
tick(s,50,right=True);check('destroyed side can be crossed',a.x>500)
s,b,a=start();tick(s,67);a.x=400;c.action(s,'jump');tick(s,40,right=True,jump=True);check('normal jump clears intact pillar',a.x>450 and s.enemies[3].hp==3)
s,b,a=start();tick(s,100);check('lightning telegraph acquired',b.boltX is not None);target=b.boltX;a.x=target+70;a.inv=0;hp=a.hp;tick(s,50);check('moving away avoids locked lightning',a.hp==hp and b.boltX is None)
b.boltX=a.x;b.cageClock=.001;a.inv=0;hp=a.hp;tick(s);check('standing in strike damages once',a.hp==hp-22 and b.boltFlash is not None)
c.action(s,'pause');t=b.timer;tick(s,40);check('pause freezes cage',b.timer==t);c.action(s,'pause')
b.timer=0;tick(s);check('timeout removes pillars and collision',b.phase=='exposed' and len(s.solids)==0 and len(s.enemies)==1)
s,b,a=start();tick(s,67);s.solids[3]=lua.table_from(dict(x=20,y=20,w=20,h=20));b.hp=1;tick(s);check('revival cleans own walls only',b.phase=='revival' and len(s.solids)==1 and s.solids[1].x==20 and len(s.enemies)==4)
c.action(s,'town');check('exit clears encounter',s.electroHypostasis is None)
s,b,a=start();tick(s,67);a.hp=0;tick(s);check('wipe cannot leave invisible walls',s.electroHypostasis is None and not any(w.electroCage for _,w in (s.solids or lua.table()).items()))
for edge in (20,940):
 s,b,a=start();b.phase='shielded';b.cycle=5;b.timer=0;a.x=edge;tick(s,68);check('arena edge '+str(edge)+' leaves escape space',all(w.x>=38 and w.x+w.w<=922 for _,w in s.solids.items()))
(ROOT/'evidence/electro-cage-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'cage checks passed')

