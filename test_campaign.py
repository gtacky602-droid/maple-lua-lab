import json
from runtime import runtime, native, ROOT
lua, c = runtime()
s = c.new(12)
checks=[]
def check(name, condition):
    assert condition, name
    checks.append(name)
def step(n=1):
    for _ in range(n): c.step(s,1/60,lua.table())
c.action(s,'campaign')
check('town has no enemies',len(s.enemies)==0)
c.action(s,'arena')
check('boss gate rejects unaccepted quest',s.campaign.zone=='town')
c.action(s,'accept');c.action(s,'field')
# Exercise actual attack/kill callbacks with deterministic positions.
for i in range(1,9):
    e=s.enemies[i];a=s.actors[1]
    a.x=e.x-10;a.y=e.y;a.dir=1;a.lock=0;a.cd=lua.table();a.atk=100
    c.attack(s,a,'normal');step()
check('kills advance accepted quest',s.campaign.quest=='boss')
c.action(s,'arena')
b=s.enemies[1]
check('boss encounter initializes',b.boss and b.maxhp==360)
s.actors[1].atk=4
s.actors[2].hp=0
s.actors[1].x=200;s.actors[1].inv=0
step(130)
check('boss telegraph exists',b.strike is not None)
x=b.strike.x;s.actors[1].x=x+300
hp=s.actors[1].hp;step(60)
check('leave locked telegraph avoids damage',s.actors[1].hp==hp)
b.hp=100
check('boss phase two visible',c.frame(s,'sprite',None).boss.phase==2)
a=s.actors[1];a.x=b.x-20;a.y=b.y;a.dir=1;a.atk=500;a.lock=0;a.cd=lua.table()
c.attack(s,a,'normal');step(420)
check('boss stays defeated beyond respawn interval',b.hp==0)
check('boss unlocks report',s.campaign.quest=='report')
money=s.mora;c.action(s,'report')
check('report requires town',s.mora==money)
c.action(s,'town');c.action(s,'report');c.action(s,'report')
check('reward paid once',s.mora==money+200 and s.campaign.quest=='complete')
check('town heals both actors',all(s.actors[i].hp==140 for i in (1,2)))
c.action(s,'field');s.actors[1].hp=0;s.actors[2].hp=0;step()
check('wipe returns to town preserving quest',s.campaign.zone=='town' and s.campaign.quest=='complete')
(ROOT/'evidence/campaign-test.json').write_text(json.dumps({'passed':checks,'count':len(checks)},ensure_ascii=False,indent=2),encoding='utf8')
print(f'{len(checks)} campaign checks passed')
