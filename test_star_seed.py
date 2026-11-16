import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);a=s.actors[1];a.atk=100;s.companion='wanderer';s.actors[2].lock=999
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s,a,e=scene();s.companion='amber';check('requires wind companion',not c.attack(s,a,'SK56'))
s,a,e=scene();s.actors[2].hp=0;check('requires living companion',not c.attack(s,a,'SK56'))
s,a,e=scene();check('cast succeeds',c.attack(s,a,'SK56'));ticks(s,720)
check('twelve fixed 110 percent pulses',s.hits==12 and s.damage==1248)
check('self pulses cannot grow seed',s.starSeed.growth==0)
ticks(s,6);check('one 300 percent final burst',s.hits==13 and s.damage==1533 and s.starSeed is None)
ticks(s,60);check('burst occurs once',s.hits==13)
s,a,e=scene();c.attack(s,a,'SK56');ticks(s,40);c.attack(s,a,'normal');check('direct hit grows seed',s.starSeed.growth==1)
check('growth changes radius only',s.starSeed.cast.range==185 and s.starSeed.cast.mult==1.1)
for _ in range(20):
 s.t+=.26;c.afterElementHit(s,lua.table_from({'id':1}),e,'physical')
check('growth capped at twelve',s.starSeed.growth==12 and s.starSeed.cast.range==240)
s,a,e=scene();c.attack(s,a,'SK56');c.action(s,'pause');ticks(s,800);check('pause freezes seed',s.hits==0 and s.starSeed is not None)
s,a,e=scene();c.attack(s,a,'SK56');s.actors[2].hp=0;ticks(s,800);check('partner death cancels burst and pulses',s.hits==0 and s.starSeed is None)
s,a,e=scene();c.attack(s,a,'SK56');c.action(s,'campaign');ticks(s,800);check('map transition cancels seed',s.starSeed is None)
s,a,e=scene();c.action(s,'campaign');c.configure(s,lua.table_from([['SK56']]+[[] for _ in range(7)],recursive=True));r=c.restore(c.checkpoint(s));check('loadout persists',r.loadout[1][1]=='SK56')
(ROOT/'evidence/star-seed-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'star seed checks passed')
