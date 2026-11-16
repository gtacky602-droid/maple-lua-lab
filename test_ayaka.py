import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.companion='ayaka';s.active=2;s.actors[1].lock=999;a=s.actors[2];a.atk=100
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
for key,hits,damage in [('normal',3,285),('skill1',3,357),('skill2',6,912),('skill4',12,1704)]:
 s,a,e=scene();c.attack(s,a,key);ticks(s,192 if key=='skill4' else 45);check(key+' source multipliers and hits',s.hits==hits and s.damage==damage)
s,a,e=scene();c.attack(s,a,'skill1');ticks(s,20);check('dash moves on ground',290<a.x<320 and a.dash==0)
s,a,e=scene();s.solids=lua.table_from([{'x':200,'y':400,'w':25,'h':80}],recursive=True);c.attack(s,a,'skill1');ticks(s,20);check('dash stops before solid wall',a.x<200 and a.dash==0)
s,a,e=scene();s.platforms=lua.table_from([{'x':0,'y':480,'w':180}],recursive=True);c.attack(s,a,'skill1');ticks(s,20);check('dash stops at unsupported edge',a.x<=180)
s,a,e=scene();c.attack(s,a,'skill3');check('dodge rejects incoming damage',c.damageActor(s,a,40,e,False)==0);ticks(s,37);check('dodge expires after point six seconds',c.damageActor(s,a,40,e,False)==40 and s.hits==0)
s,a,e=scene();e.boss=True;c.attack(s,a,'skill2');ticks(s,40);check('cryo attacks do not fully freeze boss',not e.frozen and not e.root)
s,a,e=scene();c.attack(s,a,'skill4');a.x=800;ticks(s,192);check('blizzard stays at placed origin',s.hits==12 and s.blizzard.x==290);ticks(s,19);check('blizzard expires at three point five seconds',s.blizzard is None)
s,a,e=scene();c.attack(s,a,'skill4');a.cd.skill4=0;a.lock=0;c.attack(s,a,'skill4');check('blizzard recast replaces previous pulses',len(s.pending)==1)
s,a,e=scene();c.attack(s,a,'skill4');s.paused=True;ticks(s,240);check('pause freezes blizzard',s.hits==0 and s.blizzard is not None)
s,a,e=scene();c.attack(s,a,'skill4');a.hp=0;ticks(s,240);check('death cancels blizzard',s.hits==0 and s.blizzard is None)
s,a,e=scene();c.attack(s,a,'skill4');c.action(s,'campaign');check('map clears blizzard',s.blizzard is None and len(s.pending)==0)
s,a,e=scene();e.warning=.4;c.companionAI(s,a,e);check('AI prioritizes danger dodge',a.inv==.6 and a.cd.skill3==10)
s,a,e=scene();c.action(s,'campaign');d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('ayaka saved and restored',r.companion=='ayaka')
(ROOT/'evidence/ayaka-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'ayaka checks passed')
