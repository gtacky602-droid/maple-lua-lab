import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);a=s.actors[1];a.atk=100;s.actors[2].lock=999
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
def ready(key='SK09'):
 s,a,e=scene();c.attack(s,a,key);ticks(s,190);a.light=12;s.damage=0;s.hits=0;return s,a,e
s,a,e=scene();check('form required',not c.attack(s,a,'SK59'));a.light=12;check('eligible source required',not c.attack(s,a,'SK59'))
s,a,e=ready();check('echo accepted',c.attack(s,a,'SK59'));check('echo waits for first hit',s.hits==0);ticks(s,30);check('echo inherits two hits at fifty five percent',s.hits==2 and s.damage==246)
check('echo does not replace its source',s.echoSource.cast.key=='SK09' and s.echoSource.cast.mult==2 and s.echoSource.cast.remaining==2)
s,a,e=ready();a.atk=200;e.defense=100;e.resist=lua.table_from({'electro':.5});c.attack(s,a,'SK59');ticks(s,30);check('current attack defense resistance recalculated',s.damage==128)
s,a,e=ready();a.critRate=1;c.attack(s,a,'SK59');ticks(s,30);check('critical recalculated',s.damage==370)
s,a,e=ready();c.attack(s,a,'SK59');ticks(s,30);a.cd.SK59=0;c.attack(s,a,'SK59');ticks(s,30);check('second echo uses original multiplier not recursive attenuation',s.damage==492 and s.hits==4)
s,a,e=ready();c.attack(s,a,'normal');ticks(s,30);check('normal leaves last eligible source',s.echoSource.cast.key=='SK09')
s,a,e=ready();c.attack(s,a,'SK18');ticks(s,30);check('healing leaves last eligible source',s.echoSource.cast.key=='SK09')
s,a,e=ready();c.attack(s,a,'SK12');ticks(s,40);check('deployment excluded',s.echoSource.cast.key=='SK09')
s,a,e=ready();c.attack(s,a,'SK21');ticks(s,60);check('new eligible skill replaces record',s.echoSource.cast.key=='SK21')
s,a,e=ready();a.lock=0;a.cd.SK09=9;check('failed source cast leaves record',not c.attack(s,a,'SK09') and s.echoSource.cast.key=='SK09')
s,a,e=ready('SK52');c.attack(s,a,'SK59');check('channel copied with twelve pulses',a.channel=='SK59' and s.pending[1].remaining==12);c.action(s,'cancel_channel');check('echo channel interrupt retains cooldown',len(s.pending)==0 and a.cd.SK59==24)
s,a,e=ready('SK51');c.attack(s,a,'SK59');ticks(s,65);check('shared projectile total stays ten',s.hits==10)
s,a,e=ready();c.action(s,'campaign');check('map clears copy record',s.echoSource is None)
s,a,e=ready();a.hp=0;ticks(s,1);check('death clears copy record',s.echoSource is None)
s,a,e=scene();c.action(s,'campaign');slots=[['SK58','SK09','SK59']]+[[] for _ in range(7)];c.configure(s,lua.table_from(slots,recursive=True));d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('echo loadout persists without combat record',r.loadout[1][3]=='SK59' and r.echoSource is None);c.action(s,'slot1');ticks(s,80);check('macro casts source then echo once',s.macro is None and a.cd.SK59>0 and s.echoSource.cast.key=='SK09')
(ROOT/'evidence/echo-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'echo checks passed')
