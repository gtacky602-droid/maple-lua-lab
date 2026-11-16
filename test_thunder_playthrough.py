import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK05'],['SK07'],['SK21'],['SK25'],['SK18'],[],[],[]]]))
c.action(s,'companion:amber');c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,40)),'quest');c.enterStoryNode(s,'inazuma-port');c.action(s,'story_accept:thunder-commission')
def walk(x):
 for _ in range(1800):
  a=s.actors[1]
  if abs(a.x-x)<8:return
  c.step(s,1/60,lua.table_from({'left':a.x>x,'right':a.x<x}))
 raise AssertionError('walking timeout')
walk(1380);c.action(s,'story_portal:inazuma-road');assert s.story.node=='inazuma-road';walk(900);c.action(s,'story_portal:thunder-approach');assert s.story.node=='thunder-approach';walk(720)
c.action(s,'world_boss:thunder');assert s.bossJourney.id=='thunder'
phases=set();battle_start=s.t
for i in range(60*240):
 b=s.thunder
 if b is None or b.hp<=0:break
 phases.add(b.phase);a=s.actors[s.active];desired=b.x-65
 hazards=[];jump=False
 if b.phase=='bolt_warning':hazards.append((b.target,70))
 elif b.phase in ('walls_warning','walls'):
  options=[x for x in (b.wallLeft-70,b.wallRight+70) if 25<=x<=935]
  if options:desired=min(options,key=lambda x:abs(x-a.x))
  hazards=[(b.wallLeft,25),(b.wallRight,25)]
 elif b.phase in ('prison_lock','prison'):
  desired=900 if b.prisonX<480 else 60
  hazards=[(b.prisonX,75)]
 elif b.phase=='enrage_warning':jump=b.timer<.4
 elif b.phase in ('dash_warning','dash'):
  desired=a.x;hazards=[(a.x,0)]
  jump=(b.phase=='dash' and abs(b.x-a.x)<230) or (b.phase=='dash_warning' and b.timer<.3 and abs(b.x-a.x)<230)
 if b.phase=='bolt_warning':
  options=[x for x in (b.target-110,b.target+110) if 25<=x<=935];desired=min(options,key=lambda x:abs(x-a.x))
 if jump and a.ground:c.action(s,'jump')
 if a.lock<=0 and not s.macro and not hazards and b.phase not in ('enrage_warning','prison_warning'):
  if a.hp<a.maxhp*.85 and (a.cd['SK18'] or 0)<=0:c.action(s,'slot5')
  elif abs(a.x-b.x)<150 and a.dir==(1 if b.x>a.x else -1):
   for slot,key in [(3,'SK21'),(4,'SK25'),(1,'SK05'),(2,'SK07')]:
    if (a.cd[key] or 0)<=0:c.action(s,'slot'+str(slot));break
 c.step(s,1/60,lua.table_from({'left':a.x>desired+6 or (abs(a.x-desired)<=6 and b.x<a.x and a.dir>0),'right':a.x<desired-6 or (abs(a.x-desired)<=6 and b.x>a.x and a.dir<0),'attack':not hazards,'jump':jump}))
result={'seconds':s.t-battle_start,'returns':s.returns,'boss_hp':s.thunder.hp if s.thunder else None,'actor_hp':[s.actors[i].hp for i in (1,2)],'phases':sorted(phases),'note':'Lv40 Inazuma port fixture, sample flower, lab skills. Walking/battle/return/report via inputs. No HP/ATK/position edits in combat.'}
p=ROOT/'evidence/thunder-playthrough.json';p.write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.thunder and s.thunder.hp==0 and s.returns==0
assert s.story.quests['thunder-commission'].count==1
c.action(s,'world_boss_return');assert s.story.node=='thunder-approach';c.action(s,'story_fast:inazuma-port');money=s.mora;c.action(s,'story_report:thunder-commission');assert s.mora==money+300;c.action(s,'story_report:thunder-commission');assert s.mora==money+300
result['reported_once']=True;p.write_text(json.dumps(result,indent=2),encoding='utf8')
