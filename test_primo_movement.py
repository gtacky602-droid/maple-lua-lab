import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_primo');s.actors[2].hp=0;return s,s.primo,s.actors[1]
def burrow():
 s,b,a=start();a.x=400;a.inv=0;b.phase='burrow_warning';b.timer=0;b.target=200;tick(s);b.stones=lua.table();return s,b,a
s,b,a=burrow();hp=a.hp;tick(s,45);check('moving underground hits swept ground corridor',a.hp==hp-18 and b.burrowHits[1])
a.x=b.x;a.inv=0;tick(s);check('one burrow only hits an actor once',a.hp==hp-18)
s,b,a=burrow();a.inv=5;hp=a.hp;tick(s,60);check('invulnerable actor avoids underground contact',a.hp==hp and b.burrowHits[1] is None)
s,b,a=burrow();hp=a.hp
for _ in range(60):a.y=340;a.vy=0;tick(s)
check('airborne actor avoids underground contact',a.hp==hp)
s,b,a=burrow();c.action(s,'pause');x=b.x;tick(s,100);check('pause freezes burrow position',b.x==x);c.action(s,'pause')
c.action(s,'town');check('exit clears underground attack',s.primo is None)
s,b,a=start();b.phase='recover';b.timer=0;b.facing=-1;b.cycle=4;a.x=b.x+100;tick(s)
check('nearby rear actor triggers spin without consuming sequence',b.phase=='spin_warning' and b.rearResponse and b.cycle==4 and b.rearResponses==1 and b.facing==-1)
b.phase='recover';b.timer=0;tick(s);check('cooldown permits next normal attack',b.phase=='stones_warning' and not b.rearResponse and b.cycle==5)
s,b,a=start();b.phase='recover';b.timer=0;b.facing=-1;a.x=b.x-100;tick(s);check('front actor does not trigger rear priority',not b.rearResponse)
s,b,a=start();b.phase='recover';b.timer=0;b.facing=-1;a.x=b.x+230;tick(s);check('distant rear actor does not trigger priority',not b.rearResponse)
s,b,a=start();b.phase='recover';b.timer=0;b.facing=-1;a.x=b.x+100;a.y=340;tick(s);check('high airborne rear actor does not trigger priority',not b.rearResponse)
s,b,a=start();b.phase='stunned';b.timer=0;b.facing=-1;a.x=b.x+100;tick(s);check('stun exit resumes sequence without extra spin',not b.rearResponse)
s,b,a=start();b.phase='recover';b.timer=0;b.facing=1;a.x=b.x-100;b.rearReady=s.t-1;tick(s);check('rear priority works facing right',b.rearResponse and b.facing==1)
s,b,a=start();b.phase='recover';b.timer=0;b.cycle=3;a.x=20;tick(s);f=c.frame(s,'sprite','legacy')
check('warning marks clamped destination and full path',b.target==100 and any(d.kind=='rect' and d.y==477 and d.w==abs(b.target-b.origin)+110 for d in f.draws.values()))
(ROOT/'evidence/primo-movement-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'burrow and rear priority checks passed')
