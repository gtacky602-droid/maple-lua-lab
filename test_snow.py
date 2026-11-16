import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def go(s,id,x=1380):
 s.actors[s.active].x=x;s.actors[s.active].y=480;c.action(s,'story_portal:'+id)
d=json.loads((ROOT/'work/stopover-fixture.json').read_text());s=c.restore(lua.table_from(d,recursive=True));go(s,'natlan-voyage',720)
for _ in range(2700):c.step(s,1/30,lua.table())
for id in ('nod-field','nod-town'):go(s,id)
go(s,'snezhnaya-entry');check('below140 cannot cross',s.story.node=='nod-town')
c.grantExp(s,sum(c.expNeeded(i) for i in range(1,140))-s.progression.total,'quest');go(s,'snezhnaya-entry');check('140 enters without prior quests completed',s.story.node=='snezhnaya-entry')
saved=c.checkpoint(s);validate_save(native(saved));r=c.restore(saved);check('entry checkpoint uses previous visited town',r.story.node=='nod-town')
go(s,'snezhnaya-hub');check('snow hub reached',s.campaign.zone=='town' and s.story.visited['snezhnaya-hub'])
c.action(s,'story_accept:mitya-join');go(s,'snezhnaya-field');check('snow battlefield has authored layout',len(s.platforms)==3 and len(s.enemies)==6)
for i in range(4):
 a=s.actors[1];e=s.enemies[i+1];a.x=e.x-20;e.hp=1;a.lock=0;a.cd.normal=0;c.attack(s,a,'normal')
check('four actual kills finish join objective',s.story.quests['mitya-join'].count==4)
c.action(s,'story_fast:snezhnaya-hub');before=s.mora;c.action(s,'story_report:mitya-join');check('join report records Mitya',c.frame(s).storyJoined.mitya and s.mora==before+500)
c.action(s,'story_report:mitya-join');check('join reward cannot duplicate',s.mora==before+500)
d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('join and snow checkpoint persist',r.story.node=='snezhnaya-hub' and c.frame(r).storyJoined.mitya)
(ROOT/'work/snow-fixture.json').write_text(json.dumps(native(d)),encoding='utf8')
g=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'));nodes={n['id']:n for n in g['nodes']};seen={'mond-town'};queue=['mond-town']
while queue:
 for e in nodes[queue.pop(0)]['exits']:
  if e['to'] not in seen:seen.add(e['to']);queue.append(e['to'])
check('all authored stages reachable by declared edges',seen==set(nodes))
main=['モンド','璃月','稲妻','スメール','フォンテーヌ','ナタ','ナド・クライ','スネージナヤ']
check('all eight main regions have hub and combat nodes',all(any(n['region']==r and n['hub'] for n in nodes.values()) and any(n['region']==r and not n['hub'] for n in nodes.values()) for r in main))
check('all eight selected companions have join quest records',set(q['join'] for q in g['quests'] if q.get('join'))=={'amber','beidou','ayaka','wanderer','emilie','kachina','columbina','mitya'})
check('quest hubs are safe hubs',all(nodes[q['hub']]['hub'] for q in g['quests']))
(ROOT/'evidence/snow-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'nodes':len(nodes),'quests':len(g['quests'])},indent=2));print(len(checks),'snow checks passed')
