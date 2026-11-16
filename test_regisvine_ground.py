import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'boss_cryo_regisvine');b=s.regisvine;a=s.actors[1];s.actors[2].hp=0;checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
b.phase='rise_warning';b.timer=.001;b.breaks=1;a.x=100;a.inv=0;tick();g=b.frozenGround;check('first recovery warns outer ground',g.kind=='outer' and g.starts>s.t)
hp=a.hp;tick(80);check('telegraph deals no damage',a.hp==hp)
tick(15);check('outer ground damages after warning',a.hp==hp-10)
hp=a.hp;tick(20);check('ground damage cooldown per actor',a.hp==hp)
a.x=600;a.inv=0;hp=a.hp;tick(65);check('inner area safe during outer freeze',a.hp==hp)
a.x=100;a.y=340;a.vy=-100;a.inv=0;tick();check('airborne avoids ground freeze',a.hp==hp)
b.phase='ready';b.timer=100;tick(500);check('ground field expires',b.frozenGround is None)
b.phase='rise_warning';b.timer=.001;b.breaks=2;a.x=100;a.y=480;a.inv=0;tick();check('second recovery uses inner ground',b.frozenGround.kind=='inner')
hp=a.hp;tick(100);check('outer safe during inner freeze',a.hp==hp)
a.x=600;a.y=480;a.inv=0;tick();check('inner ground now damages',a.hp==hp-10)
c.action(s,'pause');t=s.t;hp=a.hp;tick(100);check('pause freezes hazard and damage',s.t==t and a.hp==hp);c.action(s,'pause')
b.hp=0;tick();check('defeat removes frozen ground',b.frozenGround is None)
(ROOT/'evidence/regisvine-ground-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'frozen ground checks passed')
