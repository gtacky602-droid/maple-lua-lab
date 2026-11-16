import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_geo');b=s.geoHypostasis;b.cycle=2;b.timer=0;s.actors[2].hp=0;tick(s)
 return s,b,s.actors[1]
def hit(s,e,key,element='physical'):
 c.resolveCast(s,lua.table_from(dict(id=1,key=key,x=e.x-10,y=480,dir=1,range=50,limit=1,atk=999,mult=1,element=element,gain=0,color='#fff',targetId=e.id)))
def ward(s,b):
 e=b.crystal
 for i in range(3):hit(s,e,str(i))
s,b,a=start();check('third attack creates crystal during warning',b.phase=='barrage_warning' and b.crystal.hp==3)
e=b.crystal;hit(s,e,'a');hit(s,e,'a');check('crystal gauge ignores ATK and repeats cooldown',e.hp==2)
hit(s,e,'b');hit(s,e,'c');check('breaking creates ward without rewards',b.ward is not None and b.crystal is None and s.kills==0 and s.mora==0)
a.x=b.ward.x;a.inv=0;hp=a.hp;tick(s,165);check('inside field blocks first pulse',b.phase=='barrage' and b.pulses==1 and a.hp==hp)
a.x=b.ward.x+120;a.inv=0;tick(s,55);check('outside field takes pulse',a.hp==hp-18)
a.x=b.ward.x;a.inv=0;hp=a.hp;tick(s,55);check('returning inside protects again',a.hp==hp)
c.damageActor(s,a,7,b,False,True);check('ward does not grant unrelated global immunity',a.hp==hp-7)
c.action(s,'pause');t=b.timer;tick(s,40);check('pause freezes wave timer',b.timer==t);c.action(s,'pause')
tick(s,240);check('duration end clears ward and crystal',b.phase=='perch_exposed' and b.ward is None and not any(e.geoWard for _,e in s.enemies.items()))
s,b,a=start();ward(s,b);p=b.activePillar
for i in range(3):hit(s,p,str(i),'geo')
check('occupied pillar collapse cancels barrage and field',b.phase=='down' and b.ward is None and b.crystal is None)
s,b,a=start();ward(s,b);b.hp=1;tick(s);check('revival clears field and support object',b.phase=='revival' and b.ward is None and len(s.enemies)==4)
s,b,a=start();b.hp=0;tick(s);check('death clears support object',len(s.enemies)==1 and b.crystal is None)
s,b,a=start();a.hp=0;tick(s);check('wipe clears encounter',s.geoHypostasis is None)
(ROOT/'evidence/geo-ward-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'ward checks passed')
