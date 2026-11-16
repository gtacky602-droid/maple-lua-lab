import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK05'],['SK07'],['SK21'],['SK25'],['SK18'],[],[],[]]]))
c.action(s,'companion:beidou');c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,40)),'quest');c.enterStoryNode(s,'inazuma-port');c.action(s,'story_accept:maguu-commission')
def walk(x):
 for _ in range(1800):
  a=s.actors[1]
  if abs(a.x-x)<8:return
  c.step(s,1/60,lua.table_from({'left':a.x>x,'right':a.x<x}))
 raise AssertionError('walking timeout')
walk(1380);c.action(s,'story_portal:inazuma-road');assert s.story.node=='inazuma-road';walk(1100);c.action(s,'story_portal:maguu-approach');assert s.story.node=='maguu-approach';walk(720)
c.action(s,'world_boss:maguu');assert s.bossJourney.id=='maguu'
phases=set();battle_start=s.t
for i in range(60*240):
 b=s.maguu
 if b is None or b.hp<=0:break
 phases.add(b.phase);a=s.actors[s.active];desired=b.x-65
 radius=None;center=None
 if b.phase=='transition':center=b.x;radius=230
 elif b.phase=='phantom_warning':center=b.ghost.x;radius=b.ghost.r
 elif b.phase.endswith('_warning'):center=b.zoneX;radius=b.radius
 if radius is not None:
  candidates=[x for x in (center-radius-35,center+radius+35) if 25<=x<=935]
  if candidates:desired=min(candidates,key=lambda x:abs(x-a.x))
 if a.lock<=0 and not s.macro and radius is None:
  if a.hp<a.maxhp*.85 and (a.cd['SK18'] or 0)<=0:c.action(s,'slot5')
  elif abs(a.x-b.x)<150 and a.dir==(1 if b.x>a.x else -1):
   for slot,key in [(3,'SK21'),(4,'SK25'),(1,'SK05'),(2,'SK07')]:
    if (a.cd[key] or 0)<=0:c.action(s,'slot'+str(slot));break
 c.step(s,1/60,lua.table_from({'left':a.x>desired+6 or (abs(a.x-desired)<=6 and b.x<a.x and a.dir>0),'right':a.x<desired-6 or (abs(a.x-desired)<=6 and b.x>a.x and a.dir<0),'attack':radius is None}))
result={'seconds':s.t-battle_start,'returns':s.returns,'boss_hp':s.maguu.hp if s.maguu else None,'actor_hp':[s.actors[i].hp for i in (1,2)],'phases':sorted(phases),'note':'Lv40 Inazuma port fixture, sample flower, lab skills. Walking/battle/return/report via inputs. No HP/ATK/position edits in combat.'}
p=ROOT/'evidence/maguu-playthrough.json';p.write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.maguu and s.maguu.hp==0 and s.returns==0
assert s.story.quests['maguu-commission'].count==1
c.action(s,'world_boss_return');assert s.story.node=='maguu-approach';c.action(s,'story_fast:inazuma-port');money=s.mora;c.action(s,'story_report:maguu-commission');assert s.mora==money+300;c.action(s,'story_report:maguu-commission');assert s.mora==money+300
result['reported_once']=True;p.write_text(json.dumps(result,indent=2),encoding='utf8')
