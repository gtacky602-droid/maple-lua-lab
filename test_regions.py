import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
nodes={n['id']:n for n in graph['nodes']}
def check(n,v):
 assert v,n
 checks.append(n)
def go(s,id,x=1380):
 s.actors[s.active].x=x;s.actors[s.active].y=480;c.action(s,'story_portal:'+id)
s=c.new(12);c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,100)),'quest')
for id in ('mond-road','mond-border','liyue-entry','liyue-harbor'):go(s,id)
go(s,'liyue-ferry',720)
for _ in range(900):c.step(s,1/30,lua.table())
for id in ('inazuma-road','inazuma-town'):go(s,id)
for prefix,owner in [('sumeru','wanderer'),('fontaine','emilie'),('natlan','kachina')]:
 for suffix in ('entry','hub','field'):
  if suffix=='field':c.action(s,'story_accept:'+owner+'-join')
  id=prefix+'-'+suffix;go(s,id);check(id+' connected and enterable',s.story.node==id)
  if prefix=='natlan' and suffix!='hub':
   hunter=s.enemies[2]
   check(id+' hunter uses ground support and existing combat kind',hunter.art=='hunter-seeker' and hunter.spawnId==id+'-2' and hunter.kind==1 and hunter.y==480)
 check(prefix+' authored platforms and enemies',native(s.platforms)==nodes[id]['platforms'] and len(s.enemies)==6)
 a=s.actors[1];e=s.enemies[2 if prefix=='natlan' else 1];a.x=e.x-20;e.hp=1;a.lock=0;a.cd.normal=0;c.attack(s,a,'normal');check(prefix+' lethal hit advances local join',s.story.quests[owner+'-join'].count==1)
 d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check(prefix+' checkpoint resumes regional hub',r.story.node==prefix+'-hub')
 if prefix!='natlan':
  nextlevel=80 if prefix=='sumeru' else 100;old=s.progression.level;s.progression.level=nextlevel-1
  target='fontaine-entry' if prefix=='sumeru' else 'natlan-entry';go(s,target);check(target+' rejects underlevel',s.story.node==prefix+'-field');s.progression.level=old
go(s,'natlan-port');check('Natlan harbor reached through entire graph',s.story.node=='natlan-port' and len(s.enemies)==0)
d=c.checkpoint(s);validate_save(native(d));(ROOT/'work/natlan-fixture.json').write_text(json.dumps(native(d)),encoding='utf8')
ids=set(nodes);check('every edge and checkpoint references existing stage',all(n['checkpoint'] in ids and all(e['to'] in ids for e in n['exits']) for n in graph['nodes']));check('every quest target and hub exist',all(q['hub'] in ids and q['target'] in ({n['challenge'] for n in graph['nodes'] if 'challenge' in n} if q['kind']=='boss' else ids) for q in graph['quests']))
(ROOT/'evidence/regions-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'nodes':len(ids),'quests':len(graph['quests'])},indent=2));print(len(checks),'region checks passed')
