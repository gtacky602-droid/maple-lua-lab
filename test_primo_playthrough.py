import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK05'],['SK07'],['SK21'],['SK25'],['SK18'],[],[],[]]]))
c.action(s,'companion:beidou');c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,20)),'quest');c.enterStoryNode(s,'liyue-harbor')
c.action(s,'story_accept:primo-commission')
def walk(x):
 for _ in range(1800):
  a=s.actors[1]
  if abs(a.x-x)<8:return
  c.step(s,1/60,lua.table_from({'left':a.x>x,'right':a.x<x}))
 raise AssertionError('walking timeout')
walk(1380);c.action(s,'story_portal:liyue-field');walk(650);c.action(s,'story_portal:primo-approach');walk(720)
for _ in range(60*23):c.step(s,1/60,lua.table())
c.action(s,'world_boss:primo')
assert s.bossJourney.id=='primo'
c.action(s,'swap')
phases=set();battle_start=s.t
for i in range(60*240):
 b=s.primo
 if b is None or b.hp<=0:break
 phases.add(b.phase);a=s.actors[s.active]
 waiting=b.reflections==0
 desired=b.x-240 if waiting else b.x-65
 if waiting:
  if b.phase=='shower_warning' and b.timer<.8 and a.lock<=0:c.action(s,'skill4')
 else:
  if s.active==2:c.action(s,'swap')
  if a.lock<=0 and not s.macro and len(b.stones)==0 and len(b.fields)==0:
   if a.hp<a.maxhp*.85 and (a.cd['SK18'] or 0)<=0:c.action(s,'slot5')
   elif abs(a.x-b.x)<150 and a.dir>0:
    for slot,key in [(3,'SK21'),(4,'SK25'),(1,'SK05'),(2,'SK07')]:
     if (a.cd[key] or 0)<=0:c.action(s,'slot'+str(slot));break
 if not waiting and b.phase in ('breath_warning','breath'):desired=b.x-b.facing*100
 hazards=[(r.x-100,r.x+100) for r in b.stones.values()]
 for field in b.fields.values():
  width=150 if field.element=='cryo' else 130 if field.element=='electro' else 100
  hazards.append((field.x-width,field.x+width))
 if hazards:
  safe=[x for x in range(30,931,20) if all(x<left-20 or x>right+20 for left,right in hazards)]
  if safe:desired=min(safe,key=lambda x:abs(x-a.x))
 jump=b.phase in ['claw_warning','spin_warning','slam_warning'] and b.timer<.4
 if jump and a.ground:c.action(s,'jump')
 c.step(s,1/60,lua.table_from({'left':a.x>desired+6,'right':a.x<desired-6 or (abs(a.x-desired)<=6 and a.dir<0),'jump':jump,'attack':not waiting}))
result={'seconds':s.t-battle_start,'returns':s.returns,'boss_hp':s.primo.hp if s.primo else None,'reflections':s.primo.reflections if s.primo else None,'actor_hp':[s.actors[i].hp for i in (1,2)],'phases':sorted(phases),'note':'Lv20 Liyue hub fixture, sample flower, lab skills. Walking/battle/return/report via inputs. No HP/ATK/position edits in combat.'}
(ROOT/'evidence/primo-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.primo and s.primo.hp==0 and s.returns==0 and s.primo.reflections>0
assert s.story.quests['primo-commission'].count==1
c.action(s,'world_boss_return');assert s.story.node=='primo-approach';c.action(s,'story_fast:liyue-harbor');money=s.mora;c.action(s,'story_report:primo-commission');assert s.mora==money+300;c.action(s,'story_report:primo-commission');assert s.mora==money+300
result['reported_once']=True;(ROOT/'evidence/primo-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8')
