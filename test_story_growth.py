import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
s=c.new(12);c.action(s,'story_start')
for id in ('mond-patrol','mond-contract'):c.action(s,'story_accept:'+id)
rounds=0;ticks=0
while s.progression.level<20:
 if rounds: c.action(s,'story_accept:mond-contract')
 s.actors[s.active].x=1380;c.action(s,'story_portal:mond-road');s.auto=True
 for i in range(18000):
  c.step(s,1/30,lua.table());ticks+=1
  if s.story.quests['mond-contract'].count==12:break
  if s.story.node=='mond-town':
   s.actors[s.active].x=1380;c.action(s,'story_portal:mond-road')
 else:raise AssertionError('contract did not complete in ten simulation minutes')
 s.auto=False;c.action(s,'story_fast:mond-town')
 if rounds==0:
  c.action(s,'story_report:mond-patrol')
 before=s.progression.total;c.action(s,'story_report:mond-contract');check('cycle '+str(rounds)+' pays fixed reward',s.progression.total==before+2500)
 total=s.progression.total;c.action(s,'story_report:mond-contract');check('cycle '+str(rounds)+' duplicate report blocked',s.progression.total==total)
 rounds+=1
 if rounds>30:raise AssertionError('level target not reached')
check('natural combat and reports reach twenty',s.progression.level>=20 and s.kills>=12*rounds)
d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('repeatable cycles survive save',r.story.quests['mond-contract'].cycles==rounds)
for target in ('mond-road','mond-border','liyue-entry'):
 s.actors[s.active].x=1380;s.actors[s.active].y=480;c.action(s,'story_portal:'+target)
check('earned level unlocks Liyue without all quests',s.story.node=='liyue-entry' and s.story.quests['mond-border-check'] is None)
(ROOT/'evidence/story-growth-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'rounds':rounds,'kills':s.kills,'level':s.progression.level,'simulation_seconds':ticks/30,'quest_xp':s.progression.questXp,'kill_xp':s.progression.killXp},indent=2));print(len(checks),'growth checks passed',rounds,'contracts',ticks/30,'sim seconds')
