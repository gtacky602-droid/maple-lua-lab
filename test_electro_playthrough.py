import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK21'],['SK18'],['SK25'],['SK09'],[],[],[],[]]]))
c.action(s,'story_start');c.action(s,'story_accept:electro-commission')
def walk(x):
 for _ in range(60*30):
  a=s.actors[s.active]
  if abs(a.x-x)<8:return
  c.step(s,1/60,lua.table_from({'left':a.x>x,'right':a.x<x,'attack':True}))
 raise AssertionError('route movement timeout')
walk(1380);c.action(s,'story_portal:mond-road');assert s.story.node=='mond-road'
walk(400);c.action(s,'story_portal:electro-approach');assert s.story.node=='electro-approach'
walk(720);c.action(s,'world_boss:electro');assert s.bossJourney.id=='electro'
battle_start=s.t;phases=set();initial=[{'atk':s.actors[j].atk,'maxhp':s.actors[j].maxhp} for j in (1,2)]
for i in range(60*480):
 b=s.electroHypostasis
 if b is None or b.hp<=0:break
 phases.add(b.phase);a=s.actors[s.active];target=b.x;desired=target-80
 if b.phase=='revival':
  prisms=[s.enemies[j] for j in range(1,len(s.enemies)+1) if s.enemies[j].electroPrism and s.enemies[j].hp>0]
  if prisms:target=min(prisms,key=lambda e:abs(e.x-a.x)).x;desired=target-35
 if b.phase in ('laser_warning','laser'):desired=b.x-25
 if b.phase=='collapse_warning':desired=b.x-190
 if b.phase=='clap_warning':desired=b.clapCenter+190 if b.clapCenter<480 else b.clapCenter-190
 if b.phase=='cage':desired=min(930,b.cageCenter+210)
 if b.phase=='combo_warning':desired=b.target+190 if b.target<480 else b.target-190
 if a.lock<=0 and not s.macro:
  if a.hp<a.maxhp*.8 and (a.cd['SK18'] or 0)<=0:c.action(s,'slot2')
  elif 'clap_impact' in phases and b.phase in ('exposed','revival','laser','air_burst','air_recover') and abs(a.x-target)<130 and (target-a.x)*a.dir>0:
   for slot,key in [(1,'SK21'),(3,'SK25'),(4,'SK09')]:
    if (a.cd[key] or 0)<=0:c.action(s,'slot'+str(slot));break
 jump=(b.phase=='wave' and abs(a.x-b.waveX)<150) or (b.phase=='drill' and abs(a.x-b.x)<220) or (b.flying and abs(a.x-b.x)<160) or b.phase=='cage'
 if jump and a.ground:c.action(s,'jump')
 if b.phase=='combo_warning' and b.timer<.15 and abs(a.x-b.target)<150:c.action(s,'dodge')
 c.step(s,1/60,lua.table_from({'left':a.x>desired+6,'right':a.x<desired-6 or (abs(a.x-desired)<=6 and a.dir<0),'jump':jump,'attack':b.phase=='exposed' and 'clap_impact' in phases}))
result={'initial_stats':initial,'seconds':s.t-battle_start,'route_seconds':battle_start,'returns':s.returns,'kills':s.kills,'phases':sorted(phases),'destroyed':s.electroHypostasis.destroyed if s.electroHypostasis else None,'boss_hp':s.electroHypostasis.hp if s.electroHypostasis else None,'actor_hp':[s.actors[j].hp for j in (1,2)],'note':'Actions and movement inputs only; no position/HP/ATK mutations. Sample flower, level-unlocked lab skills. Walk from town, accepted commission, actual prism victory, return and report.'}
(ROOT/'evidence/electro-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.electroHypostasis and s.electroHypostasis.hp==0 and s.returns==0
assert 'clap_impact' in phases
assert s.story.quests['electro-commission'].count==1 and s.bossJourney.defeated
c.action(s,'world_boss_return');assert s.story.node=='electro-approach'
c.action(s,'story_fast:mond-town');assert s.story.node=='mond-town'
money=s.mora;c.action(s,'story_report:electro-commission');assert s.mora==money+300
c.action(s,'story_report:electro-commission');assert s.mora==money+300
result['story_report_once']=True
(ROOT/'evidence/electro-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8')
