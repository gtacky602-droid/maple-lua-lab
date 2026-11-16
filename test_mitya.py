import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.companion='mitya';s.active=2;s.actors[1].lock=999;a=s.actors[2];a.atk=100
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
for key,hits,damage in [('normal',2,180),('skill1',5,665),('skill2',8,608),('skill3',3,327),('skill4',7,994)]:
 s,a,e=scene();c.attack(s,a,key);ticks(s,550 if key=='skill2' else 50);check(key+' source hit count and multiplier',s.hits==hits and s.damage==damage)
s,a,e=scene();c.attack(s,a,'skill3');check('jump grants invulnerability',c.damageActor(s,a,40,e,False)==0);ticks(s,12);check('jump lifts actor',a.y<440);ticks(s,16);check('invulnerability ends',c.damageActor(s,a,40,e,False)==40)
s,a,e=scene();c.attack(s,a,'skill2');traveler=s.actors[1];cast=lua.table_from({'id':1,'damageElements':['cryo','electro']},recursive=True);check('mixed cryo electro gets twelve percent only once',c.damageBonus(s,cast,'star',e)==.12);traveler.x=900;check('leaving field removes bonus',c.damageBonus(s,cast,'star',e)==0)
traveler.x=200;check('physical and normal excluded',c.damageBonus(s,lua.table_from({'id':1,'isNormal':True}),'electro',e)==0 and c.damageBonus(s,lua.table_from({'id':1}),'physical',e)==0)
check('companion excluded',c.damageBonus(s,lua.table_from({'id':2}),'electro',e)==0)
ticks(s,601);check('field expires after ten seconds',s.stellarField is None)
s,a,e=scene();c.attack(s,a,'skill2');a.lock=999;c.action(s,'swap');ticks(s,550);check('field survives control swap',s.stellarField is not None and s.hits==8)
s,a,e=scene();c.attack(s,a,'skill2');a.hp=0;ticks(s,600);check('death clears field',s.stellarField is None and s.hits==0)
s,a,e=scene();c.attack(s,a,'skill2');a.cd.skill2=0;a.lock=0;c.attack(s,a,'skill2');check('field recast replaces pulses',len(s.pending)==1)
s,a,e=scene();s.active=1;a.lock=999;traveler=s.actors[1];traveler.lock=0;traveler.atk=100;check('mitya enables star slash',c.attack(s,traveler,'SK57'));ticks(s,43);check('electro prerequisite preserves all six hits',s.hits==6 and s.damage==2568)
s,a,e=scene();e.warning=.3;c.companionAI(s,a,e);check('AI prioritizes leap on danger',a.cd.skill3==10)
s,a,e=scene();c.action(s,'campaign');d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('selection saved',r.companion=='mitya')
(ROOT/'evidence/mitya-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'mitya checks passed')
