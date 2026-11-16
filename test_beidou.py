import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.companion='beidou';s.active=2;s.actors[1].lock=999;a=s.actors[2];a.atk=100
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
for key,hits,damage in [('normal',2,218),('skill2',4,568),('skill4',8,832)]:
 s,a,e=scene();c.attack(s,a,key);ticks(s,560 if key=='skill4' else 45)
 check(key+' source hits and damage',s.hits==hits and s.damage==damage)
s,a,e=scene();c.attack(s,a,'skill1');ticks(s,60);check('missed counter causes no damage',s.hits==0 and a.counterCast is None and a.cd.skill1>6)
s,a,e=scene();c.attack(s,a,'skill1');check('telegraphed attack caught',c.damageActor(s,a,40,e,True,True)==0 and a.hp==140)
ticks(s,35);check('successful counter five hits',s.hits==5 and s.damage==1235)
s,a,e=scene();c.attack(s,a,'skill1');c.damageActor(s,a,40,e,True,False);ticks(s,60);check('unwarned hit cannot trigger counter',s.hits==0 and a.hp==100)
s,a,e=scene();c.attack(s,a,'skill1');ticks(s,52);c.damageActor(s,a,40,e,True,True);ticks(s,35);check('expired window cannot counter',s.hits==0 and a.hp==100)
s,a,e=scene();c.attack(s,a,'skill3');check('guard halves damage',c.damageActor(s,a,40,e,False)==20)
ticks(s,121);a.inv=0;check('guard expires',c.damageActor(s,a,40,e,False)==40)
s,a,e=scene();c.attack(s,a,'skill4');check('shield equals floor of maxHP eighteen percent',a.thunderShield.hp==25)
check('shield absorbs then residual reaches HP',c.damageActor(s,a,40,e,False)==15 and a.thunderShield is None)
s,a,e=scene();c.attack(s,a,'skill4');a.cd.skill4=0;a.lock=0;c.attack(s,a,'skill4');check('shield recast replaces both shield and pulses',a.thunderShield.hp==25 and len(s.pending)==1)
ticks(s,601);check('shield expires after ten seconds',a.thunderShield is None)
s,a,e=scene();c.attack(s,a,'skill4');c.action(s,'campaign');check('map clears defensive buffs',a.thunderShield is None)
s,a,e=scene();e.warning=.65;c.companionAI(s,a,e);check('AI prioritizes counter for warning',a.counterCast is not None)
s,a,e=scene();s.active=1;a.lock=999;s.actors[1].atk=100;s.actors[1].lock=0;c.attack(s,s.actors[1],'SK57');ticks(s,43);check('star slash six 450 percent hits',s.hits==6 and s.damage==2568)
check('star slash does not apply ordinary aura',e.aura is None)
s,a,e=scene();s.companion='amber';check('star slash requires electro partner',not c.attack(s,s.actors[1],'SK57'))
s,a,e=scene();a.hp=0;check('star slash requires living partner',not c.attack(s,s.actors[1],'SK57'))
s,a,e=scene();c.action(s,'campaign');c.configure(s,lua.table_from([['SK57']]+[[] for _ in range(7)],recursive=True));data=c.checkpoint(s);validate_save(native(data));r=c.restore(data);check('beidou and star slash save validated and restored',r.companion=='beidou' and r.loadout[1][1]=='SK57')
s,a,e=scene();s.actors[1].x=800;e.custom=False;e.x=170;e.home=170;e.warning=.2;e.cd=0;c.attack(s,a,'skill1');ticks(s,48);check('ordinary enemy warning reaches counter hook',a.hp==140 and s.hits==5)
(ROOT/'evidence/beidou-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'beidou checks passed')
