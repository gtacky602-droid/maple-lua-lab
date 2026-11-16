import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_geo');s.actors[2].hp=0;return s,s.geoHypostasis,s.actors[1]
s,b,a=start();b.phase='perch_exposed';b.timer=0;tick(s);check('moves to next living pillar',b.activePillar.index==2 and b.x==370)
s.enemies[4].hp=0;b.phase='perch_exposed';b.timer=0;tick(s);check('skips broken pillar',b.activePillar.index==4)
b.phase='perch_exposed';b.timer=0;tick(s);check('cycles around surviving pillars',b.activePillar.index==1)
def rain():
 s,b,a=start()
 for i in range(2,6):s.enemies[i].hp=0
 b.activePillar=None;b.phase='ground_ready';b.timer=0;b.groundCycle=1;a.x=500;a.inv=0;tick(s)
 return s,b,a
s,b,a=rain();check('ground second attack has five warning positions',b.phase=='rain_warning' and len(b.rainTargets)==5)
target=b.rainTargets[3];a.x=target+50;hp=a.hp;tick(s,100);check('moving between marks avoids falling rocks',a.hp==hp and b.rainVolley==1)
check('next volley retargets after impact',b.rainTargets[3]==a.x)
tick(s,200);check('three volleys end in exposure',b.rainVolley==3 and b.phase=='ground_exposed' and b.rocks is None)
s,b,a=rain();hp=a.hp;tick(s,100);check('standing at target is hit once per volley',a.hp==hp-18)
s,b,a=rain();tick(s,73);a.x=b.rocks[3].x;a.y=300;a.inv=0;hp=a.hp;tick(s,12);check('airborne actor can be struck by falling rock',a.hp==hp-18)
c.action(s,'pause');y=b.rocks[3].y;tick(s,30);check('pause freezes rock positions',b.rocks[3].y==y);c.action(s,'pause')
b.hp=1;tick(s);check('revival clears falling rocks and targets',b.phase=='revival' and b.rocks is None and b.rainTargets is None)
c.action(s,'town');check('exit clears encounter',s.geoHypostasis is None)
s,b,a=rain();tick(s,73);b.hp=0;tick(s);check('death clears rocks',b.phase=='defeated' and b.rocks is None)
(ROOT/'evidence/geo-rain-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'rain and rotation checks passed')
