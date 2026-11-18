import json
from runtime import runtime,ROOT
lua,c=runtime();g=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf-8'));nodes={n['id']:n for n in g['nodes']};quests={q['id']:q for q in g['quests']};checked=[]
def state(node):
 s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,node);return s
# Every visible connection exposes the nearest name at the same range as traversal.
for n in g['nodes']:
 s=state(n['id']);s.progression.level=c.frame(s).levelCap
 for group in {x.get('hiddenGroup') for x in g['nodes']} - {None}:s.story.discovered[group]=True
 for edge in n['exits']:
  if edge.get('visitedOnly'):
   s.actors[1].x=edge['x'];s.actors[1].y=edge.get('y',480)
   unseen=c.frame(s,'sprite','h32c16').storyNearbyPortal
   assert unseen is None or unseen.to!=edge['to']
   s.story.visited[edge['to']]=True
  if edge.get('wind'):s.storyEnteredAt=s.t-edge['wind']['calmStart']
  if edge.get('darkOnly'):s.storyLightMode='dark'
  s.actors[1].x=edge['x'];s.actors[1].y=edge.get('y',480)
  rule=edge.get('requires')
  if edge.get('hideUntilAllowed'):
   unseen=c.frame(s,'sprite','h32c16').storyNearbyPortal
   assert unseen is None or unseen.to!=edge['to']
   s.story.quests[rule['quest']]=lua.table_from({
       'status':'active' if 'count' in rule else 'complete','count':rule.get('count',0)})
  p=c.frame(s,'sprite','h32c16').storyNearbyPortal
  assert p is not None and p.to==edge['to'] and p.name==edge.get('rideLabel',nodes[p.to]['name']),(n['id'],edge,p)
  if edge.get('hideUntilAllowed'):
   assert p.available
   s.story.quests[rule['quest']]=None
  elif rule:
   assert not p.available
   finished={'status':'complete','count':rule.get('count',0)}
   if rule.get('path') and quests[rule['quest']].get('anyPath'):
    finished['pathProgress']={path['id']:{'count':len(path['steps'])} for path in quests[rule['quest']]['paths']}
   if rule.get('construction'):
    finished['construction']={'plan':rule['construction'],'surveyed':{}}
   if rule['quest']=='inazuma-torii-maze':
    finished['forest']={'looped':True,'defeated':{}}
   s.story.quests[rule['quest']]=lua.table_from(finished,recursive=True)
   updated=c.frame(s,'sprite','h32c16').storyNearbyPortal
   assert updated.available,(n['id'],edge,updated.reason)
   s.story.quests[rule['quest']]=None
  elif not edge.get('windowStart') and not edge.get('requiresArrival'):assert p.available
  checked.append({'node':n['id'],'to':p.to})
s=state('mond-town');edge=nodes['mond-town']['exits'][0];s.actors[1].x=edge['x']
assert c.frame(s,'sprite','legacy').storyNearbyPortal.available
s.actors[1].x=edge['x']-90;assert c.frame(s,'sprite','legacy').storyNearbyPortal is None
s.actors[1].x=edge['x'];s.actors[1].y=420;assert c.frame(s,'sprite','legacy').storyNearbyPortal is None
s.actors[1].y=480;s.paused=True;assert not c.frame(s,'sprite','legacy').storyNearbyPortal.available;c.action(s,'story_nearby_portal');assert s.story.node=='mond-town'
s.paused=False;s.actors[1].hp=0;assert not c.frame(s,'sprite','legacy').storyNearbyPortal.available;c.action(s,'story_nearby_portal');assert s.story.node=='mond-town'
s.actors[1].hp=140;c.action(s,'story_nearby_portal');assert s.story.node==edge['to']
# Hidden names remain absent until discovery, even when standing at their gates.
hidden=0
for n in g['nodes']:
 for edge in n['exits']:
  target=nodes[edge['to']]
  if target.get('hiddenGroup'):
   s=state(n['id']);s.actors[1].x=edge['x'];p=c.frame(s,'sprite','legacy').storyNearbyPortal
   assert p is None or p.to!=edge['to'];hidden+=1
# Each level-gated destination remains gated through the shortcut.
s=state('mond-border');e=next(e for e in nodes['mond-border']['exits'] if e['to']=='liyue-entry');s.actors[1].x=e['x'];p=c.frame(s,'sprite','legacy').storyNearbyPortal;assert not p.available and '20' in p.reason;c.action(s,'story_nearby_portal');assert s.story.node=='mond-border'
# Time windows use the same inclusive start/exclusive end as traversal.
for node,dest,times in [('natlan-voyage','ochkanatlan-dock',[(29.9,False),(30,True),(49.9,True),(50,False)]),('liyue-ferry','inazuma-port',[(29.9,False),(30,True)])]:
 s=state(node);s.progression.level=c.frame(s).levelCap;s.actors[1].x=next(e['x'] for e in nodes[node]['exits'] if e['to']==dest)
 for elapsed,allowed in times:
  s.t=s.voyage.started+elapsed;p=c.frame(s,'sprite','legacy').storyNearbyPortal;assert p.to==dest and p.available==allowed
(ROOT/'evidence/nearby-portal.json').write_text(json.dumps({'connections':checked,'hidden_connections_checked':hidden,'checks':['nearest name from graph','strict distance/height boundaries','pause/dead blocks','keyboard action delegates existing traversal','level blocks','undiscovered names hidden','arrival and stopover boundaries']},indent=2)+'\n')
print('Nearby portal metadata, all graph connections, hidden/level/pause/dead and traversal passed')
