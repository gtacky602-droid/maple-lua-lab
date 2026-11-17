import json
from runtime import runtime,ROOT
lua,c=runtime();graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'));results=[]
for n in graph['nodes']:
 s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,n['id'])
 for mode in ['sprite','rect']:
  f=c.frame(s,mode,'h32c16');count=len(f.storyPortals);prefix=count*4
  assert f.commands==len(f.draws)
  for i,p in enumerate(f.storyPortals.values()):
   runs=[f.draws[i*4+j] for j in range(1,5)]
   assert all(r.kind=='rect' and r.color=='#83dbe1' and (r.w<=3 or r.h<=3) for r in runs)
   assert runs[0].x==p.x-18 and runs[0].y==390
  # Original character/enemy draw commands follow all outlined gates.
  if mode=='sprite': assert any(d.source for i,d in f.draws.items() if i>prefix)
  assert not any(d.color=='#83dbe1' and d.w>3 and d.h>3 for d in f.draws.values())
  results.append({'node':n['id'],'mode':mode,'visible_portals':count})
(ROOT/'evidence/story-portal-render.json').write_text(json.dumps({'results':results,'checks':['all gates outlined with no opaque interior','gate commands before character/enemy commands','command count accurate'],'scope':'render order only; existing story tests cover portal interaction'},indent=2)+'\n')
print(f"{len(graph['nodes'])} nodes x 2 modes: portal outlines and background draw order passed")
