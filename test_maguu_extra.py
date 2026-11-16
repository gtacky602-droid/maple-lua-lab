import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start(stage=2):
 s=c.new(16);c.action(s,'boss_maguu');b=s.maguu;b.stage=stage;b.invulnerable=False;b.minhp=0;b.phase='recover';b.timer=0;s.actors[2].hp=0;return s,b,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=start();b.cycle=3;a.x=300;tick(s);check('push warning selects locked corridor',b.phase=='push_warning' and b.pushTo<b.pushFrom);x=b.pushTo;a.x=800;tick(s,73);check('push retains direction',b.phase=='push' and b.pushTo==x)
a.x=b.mask.x-45;a.inv=0;hp=a.hp;tick(s,4);check('moving mask makes contact',a.hp==hp-24);a.inv=0;tick(s,2);check('same mask cannot hit actor twice',a.hp==hp-24);tick(s,40);check('mask removed after travel',b.mask is None)
s,b,a=start();b.cycle=4;a.x=300;tick(s);check('combo starts facing player',b.phase=='combo_warning' and b.combo==1 and b.facing==-1);a.x=850;tick(s,67);check('first strike spawns locked phantom',b.phase=='phantom_warning' and b.ghost.x<b.x);tick(s,46);check('second strike retargets opposite side',b.phase=='combo_warning' and b.combo==2 and b.facing==1);tick(s,190);check('exactly three strikes then recover',b.combo is None and b.phase=='recover')
s,b,a=start(1);b.cycle=4;tick(s);tick(s,165);check('stage one combo has no phantom',b.combo is None and b.ghost is None and b.phase=='recover')
s,b,a=start();b.phase='transition';b.timer=1;a.x=b.x;target=c.aiAvoidTarget(s,a);check('AI target outside warning',abs(target-b.x)>230+12);a.x=target;check('AI holds safe location during warning',c.aiAvoidTarget(s,a)==a.x);b.phase='recover';check('normal AI resumes after warning',c.aiAvoidTarget(s,a) is None)
s,b,a=start();b.mask=lua.table_from({'x':200});b.combo=2;b.hp=497;b.stage=1;tick(s);check('transition cancels old hazards',b.mask is None and b.combo is None)
s,b,a=start();b.phase='phantom_warning';b.timer=1;b.ghost=lua.table_from({'x':300,'r':120});f=c.frame(s,'sprite','legacy');sprites=[d for d in f.draws.values() if d.kind=='boss_sprite' and d.source=='maguu-source-v1.png'];check('phantom uses sprite with visible label',len(sprites)==2 and any(d.kind=='text' and d.text=='分身' for d in f.draws.values()))
(ROOT/'evidence/maguu-extra-test.json').write_text(json.dumps({'checks':checks,'count':len(checks)},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'additional Maguu checks passed')
