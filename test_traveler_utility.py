import json
from runtime import runtime,ROOT,native
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.enemies=lua.table();s.actors[2].hp=0;return s
def ticks(s,n,**inp):
 for _ in range(n):c.step(s,1/60,lua.table_from(inp))
s=scene();a=s.actors[1];x=a.x;c.attack(s,a,'SK03');ticks(s,60,right=True)
check('haste movement +25 percent',abs(a.x-x-262.5)<.001)
check('haste allows attacks',c.attack(s,a,'normal'))
ticks(s,301);check('haste expires after six seconds',a.haste==0)
check('haste cooldown not bypassed',not c.attack(s,a,'SK03'))
s=scene();s.actors[2].hp=140;s.actors[2].x=s.actors[1].x
c.attack(s,s.actors[1],'SK04');ticks(s,30)
check('updraft lifts both party members',s.actors[1].y<340 and s.actors[2].y<340)
ticks(s,272);check('updraft expires after five seconds',s.updraft is None)
s=scene();a=s.actors[1];c.attack(s,a,'SK08');p=s.platforms[len(s.platforms)]
check('stone placed within world',p.temporary and p.x>=0 and p.x+p.w<=2880)
a.x=p.x+60;a.y=p.y-20;a.vy=100;ticks(s,15)
check('stone supports collision',a.y==p.y and a.ground)
ticks(s,350);check('expired stone releases player',len(s.platforms)==4 and a.y>p.y)
s=scene();a=s.actors[1]
for _ in range(3):a.lock=0;a.cd.SK08=0;c.attack(s,a,'SK08')
check('at most two stones',sum(1 for _,p in s.platforms.items() if p.temporary)==2)
c.action(s,'campaign');check('zone change clears transient structures',len(s.platforms)==4 and s.updraft is None)
s=c.new(12);s.actors[2].hp=0;a=s.actors[1];a.atk=100;a.x=200;e=s.enemies[1];e.x=250;e.home=250;e.hp=10000;e.maxhp=10000;e.custom=True;s.enemies=lua.table_from([e]);x=e.x
c.attack(s,a,'SK05');ticks(s,8)
check('spear two hits and small enemy knockback',s.hits==2 and e.x==x+48)
a.lock=0;a.cd.SK05=0;e.boss=True;x=e.x;c.attack(s,a,'SK05')
check('boss cannot be pushed',e.x==x)
s=c.new(12);s.actors[2].hp=0;a=s.actors[1];a.x=200;e=s.enemies[1];e.custom=True;e.hp=10000;e.maxhp=10000;e.x=350;e.home=350;s.enemies=lua.table_from([e]);c.attack(s,a,'SK07');ticks(s,49)
check('moving shockwave pulses resolve',s.hits>0 and len(s.pending)==0)
s=c.new(12);c.action(s,'campaign');slots=[['SK03','SK04','SK08']]+[[] for _ in range(7)]
check('utilities can be assigned as macro',c.configure(s,lua.table_from(slots,recursive=True))[0])
c.action(s,'slot1');ticks(s,30)
check('utility macro finishes with haste draft and stone',s.macro is None and s.actors[1].haste>0 and s.updraft is not None and any(p.temporary for _,p in s.platforms.items()))
(ROOT/'evidence/traveler-utility-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'traveler utility checks passed')
