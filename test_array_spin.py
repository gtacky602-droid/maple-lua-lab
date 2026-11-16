import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(16);c.action(s,'boss_array');b=s.array;b.splitUsed=True;b.cycle=4;b.phase='recover';b.timer=0;s.actors[2].hp=0;a=s.actors[1];a.inv=0;a.x=b.x-50;return s,b,a
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();tick(s);check('near range selects spin',b.phase=='spin_warning');check('path alternates direction',b.spinPath[1]<b.x and b.spinPath[2]>b.x and b.spinPath[3]<b.x);check('warning contains whole route',all(b.spinLo<=x-55 and b.spinHi>=x+55 for x in b.spinPath.values()));a.x=20;hp=a.hp;tick(s,73);check('safe point avoids first contact',b.phase=='spin' and a.hp==hp);a.x=b.x;a.inv=0;hp=a.hp;tick(s);check('moving blade damages',a.hp==hp-12);a.inv=0;tick(s);check('contact capped within leg',a.hp==hp-12);a.x=20;tick(s,65);check('three legs lead to final warning',b.spinLeg==3 and b.phase=='spin_slash_warning');a.x=b.x;a.inv=0;hp=a.hp;tick(s,46);check('final slash hits once',a.hp==hp-26 and b.phase=='recover')
s,b,a=start();tick(s);c.action(s,'pause');timer=b.timer;tick(s,90);check('pause freezes spin warning',b.timer==timer)
s,b,a=start();tick(s);b.hp=560;b.splitUsed=False;tick(s);check('split interrupts spin',b.phase=='split');check('spin visual absent after split',not any(d.kind=='rect' and d.color=='#f2c57b' for d in c.frame(s,'sprite','legacy').draws.values()))
(ROOT/'evidence/array-spin-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'spin checks passed')
