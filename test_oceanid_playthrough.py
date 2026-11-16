import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK05'],['SK07'],['SK21'],['SK25'],['SK18'],[],[],[]]]))
c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,20)),'quest');c.enterStoryNode(s,'liyue-harbor')
c.action(s,'story_accept:oceanid-commission')
def walk(x):
 for _ in range(1800):
  a=s.actors[1]
  if abs(a.x-x)<8:return
  c.step(s,1/60,lua.table_from({'left':a.x>x,'right':a.x<x}))
 raise AssertionError('walking timeout')
walk(1380);c.action(s,'story_portal:liyue-field');walk(900);c.action(s,'story_portal:oceanid-approach');walk(720);c.action(s,'world_boss:oceanid')
assert s.bossJourney.id=='oceanid'
phases=set();initial=[{'atk':s.actors[i].atk,'maxhp':s.actors[i].maxhp} for i in (1,2)]
seen=set()
for i in range(60*360):
 b=s.oceanid
 if b is None or b.hp<=0:break
 phases.add(b.phase);a=s.actors[s.active]
 enemies=[s.enemies[j] for j in range(2,len(s.enemies)+1) if s.enemies[j].hp>0]
 for e in enemies:seen.add(e.mimic)
 target=min(enemies,key=lambda e:abs(e.x-a.x)) if enemies else None
 desired=max(240,min(720,target.x-55)) if target else 480
 if len(b.bombs)>0:desired=480 if abs(b.bombs[1].x-480)>180 else (260 if b.bombs[1].x>480 else 700)
 if a.lock<=0 and not s.macro:
  if a.hp<a.maxhp*.85 and (a.cd['SK18'] or 0)<=0:c.action(s,'slot5')
  elif target and abs(a.x-target.x)<130 and abs(a.y-target.y)<75 and (target.x-a.x)*a.dir>0:
   for slot,key in [(3,'SK21'),(4,'SK25'),(1,'SK05'),(2,'SK07')]:
    if (a.cd[key] or 0)<=0:c.action(s,'slot'+str(slot));break
 jump=bool(target and (target.flying or target.state=='warning')) or len(b.bombs)>0
 if jump and a.ground:c.action(s,'jump')
 c.step(s,1/60,lua.table_from({'left':a.x>desired+6,'right':a.x<desired-6 or (abs(a.x-desired)<=6 and a.dir<0),'jump':jump,'attack':True}))
result={'initial_stats':initial,'seconds':s.t,'returns':s.returns,'kills':s.kills,'phases':sorted(phases),'species':sorted(seen),'boss_hp':s.oceanid.hp if s.oceanid else None,'actor_hp':[s.actors[i].hp for i in (1,2)],'note':'Action/movement only, sample flower, skills lab unlocked; no combat HP/ATK/position mutations'}
(ROOT/'evidence/oceanid-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.oceanid and s.oceanid.hp==0 and s.returns==0

assert s.story.quests['oceanid-commission'].count==1 and s.bossJourney.defeated
c.action(s,'world_boss_return');assert s.story.node=='oceanid-approach'
c.action(s,'story_fast:liyue-harbor');money=s.mora;c.action(s,'story_report:oceanid-commission');assert s.mora==money+300
c.action(s,'story_report:oceanid-commission');assert s.mora==money+300

result['story_report_once']=True
result['fixture']='Lv20 Liyue harbor; later walking, battle, return and reporting use actions'
(ROOT/'evidence/oceanid-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8')
