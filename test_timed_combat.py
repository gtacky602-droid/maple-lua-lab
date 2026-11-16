import json
from runtime import runtime, ROOT
lua,c=runtime();checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
def scene():
    s=c.new(12);s.actors[2].hp=0
    e=s.enemies[1];e.hp=1000;e.maxhp=1000;e.custom=True
    s.enemies=lua.table_from([e]);s.actors[1].x=e.x-20
    return s,e
def tick(s,n):
    for _ in range(n): c.step(s,1/60,lua.table())
s,e=scene();c.attack(s,s.actors[1],'skill1')
check('only first hit occurs at cast',s.hits==1)
tick(s,7);check('next hit waits for interval',s.hits==1)
tick(s,1);check('second hit occurs later',s.hits==2)
tick(s,7);check('all three hits resolve',s.hits==3 and len(s.pending)==0)
check('one gauge award for full cast',s.gauge==65)
s,e=scene();c.attack(s,s.actors[1],'skill1');e.x=2000;tick(s,20)
check('leaving attack area avoids later hits',s.hits==1)
s,e=scene();c.attack(s,s.actors[1],'skill1');e.invulnerable=True;tick(s,20)
check('new shield blocks pending hits',s.hits==1)
s,e=scene();c.attack(s,s.actors[1],'skill1');s.actors[1].hp=0;tick(s,1)
check('death cancels remaining hits',s.hits==1 and len(s.pending)==0)
s,e=scene();c.attack(s,s.actors[1],'skill2');c.action(s,'pause');tick(s,120)
check('pause freezes pending attacks',s.hits==1 and len(s.pending)==1)
check('paused input cannot add attacks',not c.attack(s,s.actors[1],'normal'))
c.action(s,'pause');tick(s,127);check('tornado eight pulses finish',s.hits==8 and len(s.pending)==0)
s,e=scene();c.attack(s,s.actors[1],'skill2');c.action(s,'campaign');tick(s,180)
check('map transition cancels old attacks',len(s.pending)==0 and len(s.enemies)==0)
s=c.new(12);c.action(s,'boss_anemo');b=s.encounter;b.phase='exposed';b.timer=20;b.invulnerable=False
s.actors[2].hp=0;a=s.actors[1];a.x=b.x-20
c.attack(s,a,'skill1');tick(s,20)
check('Anemo immunity rejects all wind hits',b.hp==300 and s.hits==0 and s.gauge==60)
a.lock=0;c.attack(s,a,'normal');tick(s,8)
check('physical normal attacks work',b.hp<300)
s.actors[2].hp=140;c.action(s,'swap');a=s.actors[2];a.x=b.x-20;a.atk=10;a.lock=0
# Keep companion from interfering with the exact resistance assertion.
s.actors[1].lock=20
hp=b.hp;c.attack(s,a,'skill1');tick(s,9)
check('Amber pyro uses ten percent resistance',hp-b.hp==14)
tick(s,15);check('Amber fire arrow resolves four pulses',sum(1 for _,ev in s.events.items() if ev.kind=='hit' and ev.actor==2)==4)
(ROOT/'evidence/timed-combat-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'timed combat checks passed')

