import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');f=c.frame(s,'sprite','legacy');sizes=[]
for data in [c.travelerIdleArt,c.amberIdleArt]:
 d=next(d for d in f.draws.values() if d.source==data.source);box=data.box;assert abs(d.w/d.h-box[3]/box[4])<1e-9;sizes.append({'source':d.source,'w':d.w,'h':d.h})
s.actors[1].walk=1;s.actors[2].lock=1;f=c.frame(s,'sprite','legacy')
d=next(d for d in f.draws.values() if d.kind=='sprite' and d.asset==2);box=c.assets[2].box;assert abs(d.w/d.h-box[3]/box[4])<1e-9;sizes.append({'asset':2,'w':d.w,'h':d.h})
d=next(d for d in f.draws.values() if d.source==c.amberBowArt.source);box=c.amberBowArt.box;assert abs(d.w/d.h-box[3]/box[4])<1e-9;sizes.append({'source':d.source,'w':d.w,'h':d.h})
(ROOT/'evidence/character-aspect-test.json').write_text(json.dumps(sizes,indent=2));print(sizes)
