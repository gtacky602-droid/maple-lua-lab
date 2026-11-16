import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(16);c.action(s,'boss_array');b=s.array;b.splitUsed=True;s.actors[2].hp=0;a=s.actors[1];a.inv=0;return s,b,a
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();b.cycle=3;b.phase='recover';b.timer=0;a.x=300;tick(s);check('beam telegraph begins',b.phase=='beam_warning' and b.aimX==300);hp=a.hp;tick(s,60);check('warning deals no damage',a.hp==hp);tick(s,20);check('beam damages on contact',b.phase=='beam' and a.hp<hp);x=b.aimX;a.x=800;tick(s);check('beam follows at bounded speed',0<b.aimX-x<=3.01);tick(s,181);check('beam ends',b.phase=='recover')
s,b,a=start();b.cycle=4;b.phase='recover';b.timer=0;a.x=100;tick(s);check('long range selects rolling',b.phase=='roll_warning' and b.rollCount==1);locked=b.rollTo;a.x=800;tick(s,55);check('roll target stays locked',b.phase=='roll' and b.rollTo==locked);a.x=b.x-25;a.inv=0;hp=a.hp;tick(s);check('roll swept contact damages',a.hp==hp-20);a.inv=0;tick(s);check('one hit per pass',a.hp==hp-20)
for i in range(600):
 a.x=30
 tick(s)
 if b.phase=='recover':break
check('three rolls finish',b.rollCount==3 and b.phase=='recover')
s,b,a=start();b.cycle=4;b.phase='recover';b.timer=0;a.x=b.x-50;tick(s);check('close range avoids roll',b.phase=='spin_warning')
s,b,a=start();b.phase='roll';b.timer=1;b.rollTo=100;b.rollHits=lua.table();b.rollCount=1;a.x=b.x-10;a.y=350;a.vy=0;hp=a.hp;tick(s);check('airborne actor avoids roll',a.hp==hp)
s,b,a=start();b.phase='beam';b.timer=2;b.aimX=a.x;b.aimY=450;b.beamClock=0;b.splitUsed=False;b.hp=560;hp=a.hp;tick(s);check('split cancels beam',b.phase=='split' and a.hp==hp)
s,b,a=start();b.phase='roll';b.timer=1;b.rollTo=100;b.rollHits=lua.table();b.rollCount=1;c.action(s,'pause');x=b.x;tick(s,60);check('pause freezes rolling',b.x==x)
(ROOT/'evidence/array-attacks-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'array additional checks passed')

