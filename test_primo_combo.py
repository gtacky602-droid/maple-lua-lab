import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def setup(cycle,x=500):
 s=c.new(16);c.action(s,'boss_primo');s.actors[2].hp=0
 b=s.primo;a=s.actors[1];a.x=x;a.inv=0;b.phase='recover';b.timer=0;b.cycle=cycle;tick(s)
 return s,b,a
s,b,a=setup(5);check('sixth attack is combo',b.phase=='combo_warning' and b.combo==1)
hp=a.hp;b.timer=0;tick(s);check('first strike and second warning',a.hp==hp-18 and b.combo==2)
tick(s,43);check('second strike and wider final warning',a.hp==hp-36 and b.combo==3)
tick(s,61);check('third strike then recovery',a.hp==hp-62 and b.phase=='recover')
s,b,a=setup(5);facing=b.facing;a.x=b.x+90;b.timer=0;hp=a.hp;tick(s,110);check('moving behind avoids all strikes and facing stays locked',a.hp==hp and b.facing==facing)
s,b,a=setup(6);check('seventh attack is breath warning',b.phase=='breath_warning')
hp=a.hp;tick(s,40);check('warning does no damage',a.hp==hp)
b.timer=0;tick(s);check('breath starts with delay',b.phase=='breath' and a.hp==hp)
tick(s,180);check('four breath pulses then recovery',b.breathPulses==4 and a.hp==hp-48 and b.phase=='recover')
s,b,a=setup(6);a.x=b.x+100;hp=a.hp;b.timer=0;tick(s,181);check('behind breath stays safe',a.hp==hp)
s,b,a=setup(6);a.x=200;hp=a.hp;b.timer=0;tick(s,181);check('outside breath reach stays safe',a.hp==hp)
s,b,a=setup(6);b.timer=0;tick(s);c.action(s,'pause');clock=b.breathClock;tick(s,80);check('pause freezes breath pulse clock',b.breathClock==clock);c.action(s,'pause')
b.hp=0;tick(s);f=c.frame(s,'sprite','legacy');check('defeat cancels active breath',b.phase=='defeated' and not any(d.kind=='rect' and d.color=='#83d6ea' and d.w==20 for d in f.draws.values()))
s,b,a=setup(6,800);b.timer=0;tick(s);hp=a.hp;tick(s,20);check('right facing breath also hits',a.hp==hp-12)
c.action(s,'town');check('exit clears encounter',s.primo is None)
(ROOT/'evidence/primo-combo-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'combo and breath checks passed')
