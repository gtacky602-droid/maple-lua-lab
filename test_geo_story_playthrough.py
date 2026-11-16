import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK05'],['SK07'],['SK21'],['SK25'],['SK18'],[],[],[]]]))
# Fixture establishes the unlocked regional hub; subsequent route and battle use inputs only.
c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,20)),'quest');c.enterStoryNode(s,'liyue-harbor')
saved=validate_save(native(c.checkpoint(s)));(ROOT/'work/geo-harbor-fixture.json').write_text(json.dumps(saved),encoding='utf8')
c.action(s,'story_accept:geo-commission')
def walk(x):
 for _ in range(60*30):
  a=s.actors[s.active]
  if abs(a.x-x)<8:return
  c.step(s,1/60,lua.table_from({'left':a.x>x,'right':a.x<x,'attack':True}))
 raise AssertionError('route timeout')
walk(1380);c.action(s,'story_portal:liyue-field');assert s.story.node=='liyue-field'
walk(400);c.action(s,'story_portal:geo-approach');assert s.story.node=='geo-approach'
walk(720);c.action(s,'world_boss:geo');assert s.bossJourney.id=='geo'
battle_start=s.t;phases=set();initial=[{'atk':s.actors[i].atk,'maxhp':s.actors[i].maxhp} for i in (1,2)]
for i in range(60*360):
 b=s.geoHypostasis
 if b is None or b.hp<=0:break
 phases.add(b.phase);a=s.actors[s.active];target=b;breaking=False
 if b.phase=='revival':
  targets=[s.enemies[j] for j in range(1,len(s.enemies)+1) if s.enemies[j].geoPillar and s.enemies[j].hp>0]
  if targets:target=min(targets,key=lambda e:abs(a.x-e.x));breaking=True
 elif b.activePillar:target=b.activePillar;breaking=True
 desired=target.x-65
 if b.phase=='hammer_warning':desired=b.target+180 if b.target<480 else b.target-180
 if a.lock<=0 and not s.macro:
  if a.hp<a.maxhp*.8 and (a.cd['SK18'] or 0)<=0:c.action(s,'slot5')
  elif abs(a.x-target.x)<130 and (target.x-a.x)*a.dir>0:
   for slot,key in ([(1,'SK05'),(2,'SK07')] if breaking else [(3,'SK21'),(4,'SK25')]):
    if (a.cd[key] or 0)<=0:c.action(s,'slot'+str(slot));break
 jump=b.phase=='pulse_warning' and b.timer<.4
 if jump and a.ground:c.action(s,'jump')
 c.step(s,1/60,lua.table_from({'left':a.x>desired+6,'right':a.x<desired-6 or (abs(a.x-desired)<=6 and a.dir<0),'jump':jump,'attack':True}))
result={'initial_stats':initial,'seconds':s.t-battle_start,'route_seconds':battle_start,'returns':s.returns,'kills':s.kills,'phases':sorted(phases),'boss_hp':s.geoHypostasis.hp if s.geoHypostasis else None,'pillar_breaks':s.geoHypostasis.breaks if s.geoHypostasis else None,'revival_destroyed':s.geoHypostasis.destroyed if s.geoHypostasis else None,'actor_hp':[s.actors[i].hp for i in (1,2)],'note':'Lv20 Liyue hub fixture; then route and battle use actions and movement only; sample flower, lab-unlocked skills; no HP/ATK/position edits.'}
(ROOT/'evidence/geo-story-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.geoHypostasis and s.geoHypostasis.hp==0 and s.returns==0

assert s.story.quests['geo-commission'].count==1 and s.bossJourney.defeated
c.action(s,'world_boss_return');assert s.story.node=='geo-approach'
c.action(s,'story_fast:liyue-harbor');assert s.story.node=='liyue-harbor'
money=s.mora;c.action(s,'story_report:geo-commission');assert s.mora==money+300
c.action(s,'story_report:geo-commission');assert s.mora==money+300
validate_save(native(c.checkpoint(s)))
result['reported_once']=True
(ROOT/'evidence/geo-story-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8')
