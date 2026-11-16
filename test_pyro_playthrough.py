import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'artifact_samples');c.action(s,'artifact_equip:1');c.action(s,'companion:columbina')
c.configure(s,lua.table_from([lua.table_from(x) for x in [['SK17'],['SK18'],['SK20'],['SK32'],['SK19'],[],[],[]]]))
c.action(s,'boss_pyro_regisvine');phases=set();breaks=0;initial_stats=[{'atk':s.actors[j].atk,'maxhp':s.actors[j].maxhp} for j in [1,2]]
for i in range(60*360):
 b=s.pyroRegisvine
 if b is None:break
 phases.add(b.phase);breaks=max(breaks,b.breaks)
 if b.hp<=0:break
 a=s.actors[s.active];desired=500
 if b.phase=='slam_warning' and abs(a.x-b.target)<130:desired=330 if b.target>430 else 530
 if b.phase=='rise_warning':desired=350
 if b.phase in ['beam_warning','beam_active']:desired=900
 if b.frozenGround and b.frozenGround.kind=='inner':desired=350
 if s.active==1:
  if not s.macro and a.lock<=0:
   for slot,skill in [(2,'SK18'),(3,'SK20'),(4,'SK32'),(5,'SK19'),(1,'SK17')]:
    if (a.cd[skill] or 0)<=0 and (slot!=2 or a.hp<a.maxhp*.9):
     c.action(s,'slot'+str(slot));break
 else:
  c.action(s,'skill1');c.action(s,'skill2')
 if b.phase=='slam_warning' and b.timer<.2:c.action(s,'dodge')
 jump=b.coreY==350 or (b.frozenGround is not None and s.t>=b.frozenGround.starts)
 c.step(s,1/60,lua.table_from({'left':a.x>desired+8,'right':a.x<desired-8,'jump':jump,'attack':True}))
result={'initial_stats':initial_stats,'seconds':s.t,'returns':s.returns,'kills':s.kills,'core_breaks':breaks,'phases':sorted(phases),'boss_hp':s.pyroRegisvine.hp if s.pyroRegisvine else None,'actor_hp':[s.actors[j].hp for j in [1,2]],'note':'Lv1 with UI sample flower equipped, other stats unmodified, lab-unlocked skills. Controller uses actions and input only; no HP/stat/position mutations.'}
(ROOT/'evidence/pyro-regisvine-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert s.pyroRegisvine and s.pyroRegisvine.hp==0 and s.returns==0
