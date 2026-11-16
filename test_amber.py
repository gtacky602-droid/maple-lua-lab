import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
def scene(boss=False):
 s=c.new(12);s.active=2;s.actors[1].hp=0
 a=s.actors[2];a.x=200;a.dir=1
 e=s.enemies[1];e.x=350;e.home=350;e.y=480;e.hp=1000;e.maxhp=1000;e.cd=999;e.boss=boss
 s.enemies=lua.table_from([e]);return s,a,e
def tick(s,n):
 for _ in range(n): c.step(s,1/60,lua.table())
s,a,e=scene();c.attack(s,a,'skill3');check('deploy starts with no hit',s.hits==0 and len(s.decoys)==1)
tick(s,227);check('explosion waits 3.8 seconds',s.hits==0)
tick(s,1);check('first explosion pulse',s.hits==1)
tick(s,12);check('three explosion hits and single gauge award',s.hits==3 and s.gauge==65)
tick(s,1);check('decoy expires at four seconds',len(s.decoys)==0)
s,a,e=scene();e.x=330;e.cd=0;c.attack(s,a,'skill3');x=e.x;tick(s,50)
check('ordinary enemy approaches decoy',e.x>x)
check('enemy attacks decoy',any(v.kind=='decoy_hit' for _,v in s.events.items()))
s,a,e=scene(True);e.x=200;e.home=200;e.cd=0;c.attack(s,a,'skill3');hp=a.hp;tick(s,45)
check('boss ignores taunt and hits player',a.hp<hp and not any(v.kind=='decoy_hit' for _,v in s.events.items()))
s,a,e=scene();c.attack(s,a,'skill4');check('leap has invulnerability and lift',a.inv==.45 and a.vy<0)
tick(s,20);check('leap deals three timed hits',s.hits==3 and a.y<480)
check('leap cooldown enforced',not c.attack(s,a,'skill4'))
s,a,e=scene();c.attack(s,a,'skill3');c.action(s,'campaign');tick(s,250)
check('zone change removes decoy and explosion',len(s.decoys)==0 and s.hits==0)
# Keep a durable enemy nearby for all cooldown cycles, and inject a telegraph
# only when Amber is free to react, matching the AI's decision opportunity.
s,a,e=scene();s.auto=True;e.hp=100000;e.maxhp=100000;e.custom=True
seen=set()
for _ in range(2400):
 if a.lock<=0: e.warning=.6
 c.step(s,1/60,lua.table())
 seen.update(v.kind for _,v in s.events.items() if v.actor==2 and str(v.kind).startswith('cast:'))
check('AI uses all five skills',all('cast:'+k in seen for k in ['normal','skill1','skill2','skill3','skill4']))
(ROOT/'evidence/amber-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'ai_casts':sorted(seen)},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'Amber checks passed')
