import json
from runtime import runtime,ROOT
lua,c=runtime();graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf-8'));results=[]
for n in graph['nodes']:
 s=c.new(12);c.action(s,'story_start');s.camera=1920;c.enterStoryNode(s,n['id']);assert s.camera==0
 s.enemies=lua.table()
 for x in [20,n['width']/2,n['width']-20]:
  s.actors[1].x=x;c.step(s,1/60,lua.table());f=c.frame(s,'sprite','h32c16')
  assert 0<=f.camera<=n['width']-960
  ground=next(p for p in f.platforms.values() if p.y==480 and p.x==0)
  assert ground.x-f.camera<=0 and ground.x+ground.w-f.camera>=960
  assert 0<=s.actors[1].x-f.camera<=960
 results.append({'node':n['id'],'width':n['width'],'rightCamera':s.camera})
# Returning through the left-hand exit spawns at the previous map's right end;
# the first frame (no simulation step) must already use that map's camera limit.
s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,'mond-road');s.actors[1].x=60;c.action(s,'story_portal:mond-town');assert s.story.node=='mond-town';f=c.frame(s,'sprite','legacy');assert f.camera==480 and f.actors[1].x==1280
# The standalone three-screen test field keeps its original right edge.
s=c.new(12);s.enemies=lua.table();s.actors[1].x=2860;c.step(s,1/60,lua.table());assert s.camera==1920
# Wider future maps and narrow arenas use the declared dimensions, not 1920.
for width in [960,1440,2880,4800]:
 s=c.new(12);s.enemies=lua.table();s.worldwidth=width;s.platforms=lua.table_from([{'x':0,'y':480,'w':width}],recursive=True);s.actors[1].x=width-20;c.step(s,1/60,lua.table());assert s.camera==width-960
(ROOT/'evidence/map-camera-bounds.json').write_text(json.dumps({'nodes':results,'checks':['All story nodes: left/middle/right ground covers viewport','player stays on screen','node entry clears prior camera immediately','return portal first frame clamped','original 2880 test field unchanged','declared widths 960 through 4800']},indent=2)+'\n')
print(f'{len(results)} node camera bounds, ground coverage, immediate return and legacy field passed')
