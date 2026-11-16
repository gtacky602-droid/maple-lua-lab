import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start(x=300):
 s=c.new(16);c.action(s,'boss_thunder');s.actors[2].hp=0;b=s.thunder;a=s.actors[1];a.x=x;b.enraged=True;b.cycle=3;b.phase='recover';b.timer=0;tick(s);return s,b,a
s,b,a=start();check('fourth attack repositions to opposite edge',b.phase=='dash_warning' and b.x==900 and b.dashTo==60)
a.x=800;tick(s);check('route remains fixed after target moves',b.dashFrom==900 and b.dashTo==60)
c.action(s,'pause');t=b.timer;tick(s,50);check('pause freezes dash warning',b.timer==t);c.action(s,'pause')
b.timer=0;tick(s);check('dash moves at 700 per second',abs(b.x-(900-700/60))<1e-8)
a.x=b.x-30;a.inv=0;hp=a.hp;tick(s);check('ground contact damages',a.hp==hp-24)
a.x=b.x;a.inv=0;tick(s);check('only one contact per actor',a.hp==hp-24)
tick(s,75);check('arrives and clears route',b.x==60 and b.phase=='recover' and b.dashFrom is None and b.dashHits is None)
s,b,a=start(700);check('opposite direction starts left',b.x==60 and b.dashTo==900)
b.timer=0;tick(s);a.x=b.x+10;a.y=390;a.ground=False;a.vy=0;a.inv=0;hp=a.hp;tick(s);check('airborne actor avoids contact',a.hp==hp)
c.action(s,'pause');x=b.x;tick(s,40);check('pause freezes moving dash',b.x==x);c.action(s,'pause')
b.hp=0;tick(s);check('death clears dash',b.phase=='defeated' and b.dashTo is None)
s,b,a=start();c.action(s,'town');check('exit clears encounter',s.thunder is None)
(ROOT/'evidence/thunder-dash-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'dash checks passed')
