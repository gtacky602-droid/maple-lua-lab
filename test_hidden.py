import json
from experience import LEVELS
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
def check(n,v):
 assert v,n
 checks.append(n)
for group,hub,parent,x in [('golden','mond-town','mond-road',1380),('veluriyam','sumeru-hub','sumeru-entry',60),('simulanka','fontaine-hub','fontaine-hub',0)]:
 s=c.new(12);c.action(s,'story_start');c.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
 c.enterStoryNode(s,hub)
 if parent!=hub:s.actors[s.active].x=x;c.action(s,'story_portal:'+parent)
 frame=native(c.frame(s));check(group+' hidden nodes absent before discovery',not any(n.get('hiddenGroup')==group for n in frame['storyGraph']['nodes']))
 c.action(s,'story_discover:'+group);check(group+' remote discovery rejected',not s.story.discovered[group])
 s.actors[s.active].x=1050;s.actors[s.active].y=480;c.action(s,'story_portal:'+group+'-hub');check(group+' direct undiscovered portal rejected',s.story.node==parent)
 c.action(s,'story_discover:'+group)
 visible={n['id'] for n in native(c.frame(s))['storyGraph']['nodes'] if n.get('hiddenGroup')}
 check(group+' clue unlocks exactly this group',visible=={n['id'] for n in graph['nodes'] if n.get('hiddenGroup')==group})
 if group=='golden':
  c.action(s,'story_portal:golden-mainland-coast')
  check('golden clue leads to mainland dock',s.story.node=='golden-mainland-coast')
  q=next(q for q in graph['quests'] if q['id']=='golden-little-boat')
  c.action(s,'story_accept:'+q['id'])
  for mark in q['itinerary'][:3]:
   s.actors[s.active].x=mark['x'];s.actors[s.active].y=mark['y'];c.action(s,'story_collect')
  s.actors[s.active].x=1530;c.action(s,'story_portal:golden-hub')
  for _ in range(127): c.step(s,1/60,lua.table_from({}))
 elif group=='veluriyam':
  s.actors[s.active].x=1125
  c.action(s,'story_portal:veluriyam-bottle-yard')
  check('veluriyam clue leads to bottle yard',s.story.node=='veluriyam-bottle-yard')
  q=next(q for q in graph['quests'] if q['id']=='veluriyam-bottle-ticket')
  c.action(s,'story_accept:'+q['id'])
  bottle,dial=q['itinerary'][:2]
  s.actors[s.active].x=bottle['x'];c.action(s,'story_collect')
  s.actors[s.active].x=dial['x'];s.actors[s.active].y=dial['y']
  for _ in range(3):c.action(s,'story_collect')
  c.action(s,'story_airflow_commit')
  s.actors[s.active].x=1260;s.actors[s.active].y=480;c.action(s,'story_portal:veluriyam-hub')
 else:
  c.action(s,'story_portal:'+group+'-hub')
 check(group+' discovered portal enters',s.story.node==group+'-hub')
 c.action(s,'story_accept:'+group+'-explore');s.actors[s.active].x=1380;c.action(s,'story_portal:'+group+'-play');check(group+' exploration progresses',s.story.quests[group+'-explore'].count==1)
 d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check(group+' discovery persists and resumes safe hidden hub',r.story.node==group+'-hub' and r.story.discovered[group])
 c.action(r,'story_fast:'+group+'-hub');r.actors[r.active].x=60;c.action(r,'story_portal:'+parent);check(group+' return to parent route works',r.story.node==parent)
 if group=='golden':
  bad=native(d);bad['story']['discovered']={}
  try:validate_save(bad);raise AssertionError('accepted missing discovery')
  except ValueError:checks.append('undiscovered hidden checkpoint rejected')
s=c.new(12);c.action(s,'story_start');s.actors[1].x=1380;c.action(s,'story_portal:mond-road')
work=ROOT/'work';work.mkdir(exist_ok=True)
(work/'hidden-fixture.json').write_text(json.dumps(native(c.checkpoint(s))),encoding='utf8')
(ROOT/'evidence/hidden-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'hidden checks passed')
