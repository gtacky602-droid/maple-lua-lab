import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);a=s.actors[1];a.atk=100;s.actors[2].hp=0
 e=s.enemies[1];e.x=300;e.y=480;e.home=300;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s,a,e=scene();c.attack(s,a,'SK17');ticks(s,18);check('water shots three 155 percent hits',s.hits==3 and s.damage==441)
s,a,e=scene();c.attack(s,a,'SK19');ticks(s,48);check('wave pushes small targets through five hits',s.hits==5 and e.x==420)
s,a,e=scene();e.boss=True;c.attack(s,a,'SK19');check('wave cannot push boss',e.x==300)
s,a,e=scene();s.enemies=lua.table();a.hp=50;b=s.actors[2];b.hp=50;b.x=a.x;c.attack(s,a,'SK18');ticks(s,59)
check('healing waits one second',a.hp==50 and b.hp==50)
ticks(s,1);check('both actors healed 2.5 percent',a.hp==53.5 and b.hp==53.5)
ticks(s,300);check('six pulses total 15 percent then expire',a.hp==71 and b.hp==71 and s.healingField is None)
s,a,e=scene();s.enemies=lua.table();a.hp=139;c.attack(s,a,'SK18');ticks(s,60);check('healing capped at max hp',a.hp==140)
check('field does not resurrect',s.actors[2].hp==0)
s,a,e=scene();s.enemies=lua.table();a.hp=50;c.attack(s,a,'SK18');a.x=600;ticks(s,60);check('outside field no heal',a.hp==50)
s,a,e=scene();s.enemies=lua.table();a.hp=50;c.attack(s,a,'SK18');a.cd.SK18=0;a.lock=0;c.attack(s,a,'SK18');ticks(s,60);check('replacement field does not stack',a.hp==53.5)
s,a,e=scene();c.attack(s,a,'SK20');check('shield durability 140 percent attack',a.waterShield.hp==140)
c.damageActor(s,a,30,e,False);check('shield absorbs area damage and counters once',a.hp==140 and a.waterShield.hp==110 and s.hits==1 and s.damage==61)
c.damageActor(s,a,30,e,False);check('invulnerability prevents duplicate counter',s.hits==1 and a.waterShield.hp==110)
for _ in range(3):a.inv=0;c.damageActor(s,a,10,e,False)
check('counter capped three despite remaining shield',s.hits==3 and a.waterShield.hp==80)
a.inv=0;c.damageActor(s,a,100,e,False);check('break overflow damages actor',a.hp==120 and a.waterShield is None)
s,a,e=scene();c.attack(s,a,'SK20');ticks(s,421);check('shield expires after seven seconds',a.waterShield is None)
s,a,e=scene();c.attack(s,a,'SK20');a.lock=0;c.attack(s,a,'SK06');c.damageActor(s,a,30,e,True)
check('wall intercept does not spend shield or counter',a.waterShield.hp==140 and s.hits==0)
s,a,e=scene();c.attack(s,a,'SK20');a.lock=0;c.attack(s,a,'SK18');c.action(s,'pause');ticks(s,120)
check('pause freezes field and shield',a.waterShield.life==7 and s.healingField.pulses==0)
c.action(s,'campaign');check('map clears field and shield',a.waterShield is None and s.healingField is None)
s,a,e=scene();c.attack(s,a,'SK20');a.lock=0;c.attack(s,a,'SK18');a.hp=0;ticks(s,1);check('death clears owned support effects',a.waterShield is None and s.healingField is None)
s,a,e=scene();c.action(s,'campaign');slots=[['SK17','SK18','SK19'],['SK20']]+[[] for _ in range(6)]
check('hydro skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('hydro slots persist',r.loadout[1][3]=='SK19' and r.loadout[2][1]=='SK20')
(ROOT/'evidence/hydro-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'hydro checks passed')
