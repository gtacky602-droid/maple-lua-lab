import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_primo');s.actors[2].hp=0;return s,s.primo,s.actors[1]
def shielded(hp=25):
 s,b,a=start();a.x=b.x-100;a.inv=0;a.lock=0;c.attack(s,a,'SK20');a.waterShield.hp=hp;a.waterShield.maxhp=hp
 b.phase='shower_warning';b.timer=0;return s,b,a
s,b,a=start();check('starts awake and immune',b.invulnerable and b.element=='hydro');tick(s,121);check('first claw attack',b.phase=='claw_warning' and not b.invulnerable)
s,b,a=shielded();hp=a.hp;tick(s);check('matching shield reflects 15 percent',b.reflections==1 and b.lastReflection==120 and a.hp==hp and a.waterShield.hp==5)
check('successful reflection stuns with reduced resistance',b.phase=='stunned' and abs(b.resist.geo)<.001 and abs(b.resist.hydro+.2)<.001)
tick(s,301);check('resistance recovers after stun',b.resist.geo==.5 and b.phase!='stunned')
s,b,a=shielded(5);hp=a.hp;tick(s);check('broken shield does not reflect and excess hurts',b.reflections==0 and a.hp==hp-15 and a.waterShield is None)
s,b,a=shielded();a.waterShield.life=0;hp=a.hp;tick(s);check('expired shield cannot reflect',b.reflections==0 and a.hp==hp-20)
s,b,a=shielded();a.inv=1;tick(s);check('dodge immunity cannot reflect',b.reflections==0 and a.waterShield.hp==25)
s,b,a=shielded();a.x=100;tick(s);check('outside shower cannot reflect',b.reflections==0)
s,b,a=start();c.action(s,'town');c.action(s,'companion:beidou');c.action(s,'boss_primo');b=s.primo;a=s.actors[2];a.hp=140;a.x=b.x-100;a.inv=0;a.lock=0;c.companionAttack(s,a,'skill4');s.actors[1].x=20;b.phase='shower_warning';b.timer=0;tick(s)
check('Beidou surviving shield reflects different element 5 percent',b.reflections==1 and b.lastReflection==40 and a.thunderShield.hp==5)
s,b,a=start();b.hp=70;b.cycle=2;b.phase='recover';b.timer=0;tick(s);check('critical health replaces shower with stones',b.phase=='stones_warning')
s,b,a=start();b.phase='stones_warning';b.timer=0;a.x=400;a.inv=0;hp=a.hp;tick(s);check('stones spawn without immediate damage',len(b.stones)==3 and a.hp==hp);tick(s,121);check('stones explode after warning',a.hp<hp and len(b.stones)==0)
s,b,a=start();b.phase='burrow_warning';b.timer=0;b.target=200;tick(s);check('burrow becomes invulnerable',b.phase=='burrow' and b.invulnerable);tick(s,73);check('burrow reaches locked target',abs(b.x-200)<.001 and b.phase=='slam_warning')
c.action(s,'pause');time=b.timer;tick(s,60);check('pause freezes fight',time==b.timer);c.action(s,'pause');c.action(s,'town');check('exit clears boss',s.primo is None)
s,b,a=shielded();b.hp=80;tick(s);check('reflection can defeat boss once',b.hp==0 and s.kills==1 and b.phase=='defeated');tick(s,400);check('no respawn or repeated kill',b.hp==0 and s.kills==1)
(ROOT/'evidence/primo-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'Primo checks passed')
