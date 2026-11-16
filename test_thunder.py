import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(16);c.action(s,'boss_thunder');s.actors[2].hp=0;return s,s.thunder,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();check('electro immunity',b.immune=='electro');a.x=20;tick(s,61);check('three probes',len(b.probes)==3);tick(s,150);check('outside probes no fury',b.fury==0);a.x=200;b.probes[1].clock=0;tick(s);check('probe detection adds 25 fury',b.fury==25)
for _ in range(3):b.probes[1].clock=0;tick(s)
check('four detections enrage and clear probes',b.enraged and b.phase=='enrage_warning' and len(b.probes)==0)
s,b,a=start();b.hp=525;tick(s);check('75 percent HP enrage',b.enraged and b.fury==100);tick(s,85);check('enrage leads to recovery',b.phase=='recover')
s,b,a=start();b.enraged=True;b.phase='recover';b.timer=0;tick(s);check('first rage attack warns walls',b.phase=='walls_warning');a.x=20;tick(s,73);left=b.wallLeft;right=b.wallRight;tick(s);check('walls close toward each other',b.wallLeft>left and b.wallRight<right);tick(s,180);check('walls cleared after closing',b.wallLeft is None and b.wallRight is None)
s,b,a=start();b.enraged=True;b.cycle=1;b.phase='recover';b.timer=0;tick(s);a.x=350;tick(s);check('prison warning follows actor',b.prisonX==350);b.timer=0;tick(s);locked=b.prisonX;a.x=800;tick(s,20);check('lock delay holds aim',b.phase=='prison_lock' and b.prisonX==locked);tick(s,18);x=b.prisonX;tick(s);check('prison homes at bounded speed',b.phase=='prison' and 0<b.prisonX-x<=1.67);a.x=b.prisonX;a.inv=0;hp=a.hp;tick(s);check('inside prison damages',a.hp==hp-12)
c.action(s,'pause');x=b.prisonX;tick(s,60);check('pause freezes prison',b.prisonX==x);c.action(s,'pause');c.action(s,'town');check('exit clears encounter',s.thunder is None)
s,b,a=start();b.hp=0;tick(s);check('death clears hazards',b.phase=='defeated' and len(b.probes)==0 and b.prisonX is None);tick(s,400);check('no respawn',b.hp==0)
(ROOT/'evidence/thunder-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'thunder checks passed')
