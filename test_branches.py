import json
from experience import LEVELS
from runtime import runtime,ROOT,native
from savegame import validate_save
from tools.waypoint_test import TrailWalk
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
s=c.new(12);c.action(s,'story_start');s.actors[1].x=1380;c.action(s,'story_portal:mond-road');s.actors[1].x=1380;c.action(s,'story_portal:mond-border');s.actors[1].x=720;c.action(s,'story_portal:dragonspine-camp');check('low-level player can enter high-light branch',s.story.node=='dragonspine-camp' and s.progression.level==1)
c.action(s,'story_accept:dragonspine-survey');s.actors[1].x=1380;c.action(s,'story_portal:dragonspine-depth');check('branch encounter carries barrier threshold',s.enemies[1].barrier==3 and s.story.quests['dragonspine-survey'].count==1)
a=s.actors[1];a.atk=100;e=s.enemies[1];e.hp=10000;e.maxhp=10000;e.custom=True;a.x=e.x-20;c.attack(s,a,'normal');check('zero trial light reduces actual damage to ten percent',s.damage==10)
c.action(s,'barrier_trial:50');check('field cannot edit trial power',s.imprintTrial is None)
c.action(s,'story_fast:dragonspine-camp');c.action(s,'barrier_trial:3');check('safe hub can set trial power',s.imprintTrial==3)
s.actors[1].x=1380;c.action(s,'story_portal:dragonspine-depth');a.x=s.enemies[1].x-20;a.lock=0;a.cd.normal=0;s.enemies[1].hp=10000;before=s.damage;c.attack(s,a,'normal');check('meeting threshold restores full damage',s.damage-before==104)
check('over-threshold cannot amplify above baseline',c.damageFactor(s,lua.table(),lua.table_from({'barrier':1}))==1)
s.imprintTrial=25;check('partial threshold scales linearly in provisional formula',abs(c.damageFactor(s,lua.table(),lua.table_from({'barrier':50}))-.55)<1e-8)
d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('save restores branch hub but not test power',r.story.node=='dragonspine-camp' and r.imprintTrial is None)
c.action(r,'barrier_trial:51');check('above fifty rejected',r.imprintTrial is None)
g=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'));nodes={n['id']:n for n in g['nodes']};branches={n['region'] for n in nodes.values() if n.get('branch')};check('nine requested branch regions represented',len(branches)==9)
def has_return_path(id):
 visited,pending={id},[id]
 while pending:
  current=nodes[pending.pop()]
  if current['hub']:return True
  next_nodes={edge['to'] for edge in current['exits'] if not edge.get('visitedOnly')}-visited
  visited.update(next_nodes)
  pending.extend(next_nodes)
 return False

check('every branch depth has a route to a safe camp',all(has_return_path(n['id']) for n in nodes.values() if n.get('branch') and not n['hub']))
check('branch threshold is independent of entry level',nodes['dornman-depth']['lightReference']==30 and nodes['dornman-depth']['level']==1)

exits={node['id']:node['exits'] for node in g['nodes']}
edges={(origin,edge['to']):edge for origin,route in exits.items() for edge in route}
round_trips=[]
for level,approach,camp,depth in [
 (1,'mond-road','dornman-camp','dornman-depth'),
 (120,'nod-field','nod-special-camp','nod-special-depth'),
 (140,'snezhnaya-field','wingspan-camp','wingspan-lookout'),
]:
 state=c.new(12)
 c.action(state,'story_start')
 c.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
 c.enterStoryNode(state,approach)
 for actor in state.actors.values():
  actor.inv=1000
 walk=TrailWalk(lua,c,state,edges,exits)
 for stop in (camp,depth):
  walk.cross(stop)
 checkpoint=c.checkpoint(state)
 validate_save(native(checkpoint))
 restored=c.restore(checkpoint)
 assert restored.story.node==camp and restored.story.visited[depth]
 for stop in (camp,approach):
  walk.cross(stop)
 round_trips.append(dict(level=level,stages=[approach,camp,depth],restoredAt=camp))
checks.append('Dornman, Nod special area and Wingspan entrances, depths, returns and checkpoints')

t=c.new(12);c.action(t,'story_start');c.grantExp(t,sum(c.expNeeded(i) for i in range(1,60)),'quest')
c.enterStoryNode(t,'tunigi-camp')
d=c.checkpoint(t);validate_save(native(d));(ROOT/'work/tunigi-fixture.json').write_text(json.dumps(native(d)),encoding='utf8')
q='tunigi-survey';c.action(t,'story_accept:'+q);t.actors[1].x=1380;c.action(t,'story_portal:tunigi-depth')
e=t.enemies[2]
check('Tunigi visit advances survey and loads the authored ground enemy',t.story.node=='tunigi-depth' and t.story.quests[q].count==1 and (e.spawnId,e.art,e.y,e.kind,e.barrier)==('tunigi-depth-2','fanged-beast',480,1,13))
c.action(t,'story_fast:tunigi-camp');c.action(t,'story_report:'+q)
check('Tunigi survey completes on return to camp',t.story.quests[q].status=='complete')
(ROOT/'work/branch-fixture.json').write_text(json.dumps(native(c.checkpoint(r))),encoding='utf8');(ROOT/'evidence/branches-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'nodes':len(nodes),'quests':len(g['quests']),'roundTrips':round_trips},indent=2));print(len(checks),'branch checks passed')
