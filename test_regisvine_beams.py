import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def fresh():
 s=c.new(16);c.action(s,'boss_cryo_regisvine');s.actors[2].hp=0;a=s.actors[1];a.x=200;a.inv=0;b=s.regisvine;b.cycle=2;b.timer=.001;c.step(s,1/60,lua.table());return s,b,a
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=fresh();check('third cycle creates two warning rays',b.phase=='beam_warning' and len(b.beams)==2)
x=b.beams[1].x2;hp=a.hp;tick(s,60);check('warning does no damage',a.hp==hp)
a.x=920;tick(s,25);check('aim remains locked and moving away avoids',b.beams[1].x2==x and a.hp==hp)
a.x=290;a.y=480;a.inv=0;tick(s);check('entering active beam damages',a.hp==hp-28)
a.inv=0;tick(s,5);check('overlapping cells cannot multiply damage',a.hp==hp-28)
c.action(s,'pause');t=b.timer;tick(s,50);check('pause freezes active beam',b.timer==t);c.action(s,'pause');tick(s,45);check('beam ends and clears geometry',b.beams is None and b.phase=='recover')
s,b,a=fresh();b.core=1;c.resolveCast(s,lua.table_from(dict(id=1,key='break',atk=1,x=620,y=480,dir=1,range=100,limit=1,mult=1,element='pyro',color='#fff',gain=0)));check('core break cancels telegraph',b.phase=='down' and b.beams is None)
hp=a.hp;tick(s,90);check('canceled beam cannot resolve later',a.hp==hp)
s,b,a=fresh();b.hp=0;tick(s);check('defeat removes warning',b.beams is None)
s,b,a=fresh();c.action(s,'town');check('exit removes encounter',s.regisvine is None)
(ROOT/'evidence/regisvine-beam-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'beam checks passed')
