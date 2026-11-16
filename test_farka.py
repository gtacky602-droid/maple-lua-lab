import json
from runtime import runtime,ROOT,native
lua,c=runtime();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
def fresh():
 s=c.new(16);c.action(s,'story_start');c.action(s,'boss_farka');s.actors[2].hp=0;s.actors[1].inv=0
 return s,s.farka,s.actors[1]
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s,b,a=fresh();check('original battle exits story',not s.story.active and b.hp==600)
tick(s,121);check('charge target locked',b.phase=='charge_warning' and b.target==a.x)
target=b.target;a.x=940;tick(s,73);check('no retarget during charge',b.target==target)
hp=a.hp;tick(s,35);check('off-path avoids charge',a.hp==hp and b.phase=='recover')
b.phase='charge_warning';b.timer=.001;b['from']=680;b.x=680;b.target=200;b.elapsed=0;b.struck=lua.table();a.x=450;a.inv=0
hp=a.hp;tick(s,30);check('swept charge hits once',a.hp==hp-30)
b.phase='sweep_warning';b.timer=.001;a.x=900;a.y=480;a.inv=0;hp=a.hp;tick(s);check('ground sweep damages',a.hp==hp-24)
b.phase='sweep_warning';b.timer=.001;a.y=350;a.vy=0;a.inv=0;hp=a.hp;tick(s);check('jump avoids sweep',a.hp==hp)
b.hp=300;b.phase='sweep_warning';b.timer=.001;tick(s);check('half hp adds warning for second sweep',b.phase=='followup_warning')
a.y=480;a.inv=0;hp=a.hp;tick(s,52);check('second sweep resolves separately',a.hp==hp-24 and b.phase=='recover')
c.action(s,'pause');clock=b.timer;tick(s,60);check('pause freezes boss',clock==b.timer);c.action(s,'pause')
a.x=b.x-30;a.y=480;a.dir=1;a.lock=0;a.cd=lua.table();a.atk=10000;c.attack(s,a,'normal');tick(s)
check('kill registered exactly once',b.hp==0 and s.kills==1 and b.phase=='defeated');tick(s,600);check('defeated boss cannot respawn',b.hp==0 and s.kills==1)
check('frame communicates provisional battle',native(c.frame(s,'sprite'))['boss']['phase']=='defeated')
c.action(s,'town');check('exit clears encounter',s.farka is None and len(s.enemies)==0)
s,b,a=fresh();a.hp=0;tick(s);check('wipe returns to town',s.campaign.zone=='town' and s.farka is None)
s,b,a=fresh();d=c.checkpoint(s);restored=c.restore(d,16);check('save resumes outside battle',restored.campaign.zone=='town' and restored.farka is None)
c.action(s,'boss_anemo');check('switching bosses clears previous state',s.farka is None and s.encounter is not None)
(ROOT/'evidence/farka-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'Farka checks passed')

