import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1,jump=False):
 if jump:c.action(s,'jump')
 for _ in range(n):c.step(s,1/60,lua.table_from({'jump':jump}))
def start(x=200):
 s=c.new(16);c.action(s,'boss_electro');b=s.electroHypostasis;a=s.actors[1];a.x=x;a.inv=0;s.actors[2].hp=0;b.cycle=3;b.timer=0;tick(s)
 return s,b,a
s,b,a=start();check('fourth cycle warns and locks direction',b.phase=='drill_warning' and b.drillDir==-1 and b.x==880)
a.x=800;hp=a.hp;tick(s,60);check('warning harmless and does not retarget',a.hp==hp and b.drillDir==-1)
tick(s,8);check('drill moves while shielded',b.phase=='drill' and b.x<880 and b.invulnerable)
tick(s,12);check('grounded actor hit once',a.hp==hp-30)
a.inv=0;a.x=b.x;tick(s);check('same rush cannot hit actor twice',a.hp==hp-30)
tick(s,60);check('stops inside arena and exposes',b.x==80 and b.phase=='exposed' and not b.invulnerable)
s,b,a=start(700);check('rightward direction supported',b.drillDir==1 and b.x==80)
tick(s,67);old=b.x;a.x=old+20;a.inv=0;hp=a.hp;c.step(s,1/30,lua.table());check('swept movement catches actor between positions',a.hp==hp-30)
s,b,a=start();tick(s,67);a.x=500;a.inv=0;hp=a.hp;tick(s,45,True);check('normal jump input clears drill',a.hp==hp)
s,b,a=start();tick(s,67);c.action(s,'pause');x=b.x;tick(s,30);check('pause freezes rush',b.x==x);c.action(s,'pause')
b.hp=1;tick(s);check('revival cancels rush',b.phase=='revival' and b.x==480)
c.action(s,'town');check('exit clears encounter',s.electroHypostasis is None)
(ROOT/'evidence/electro-drill-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'drill checks passed')
