import json
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');f=c.frame(s,'sprite','legacy');sizes=[]
for i in [1,3]:
 d=next(d for d in f.draws.values() if d.kind=='sprite' and d.asset==i);box=c.assets[i].box;assert abs(d.w/d.h-box[3]/box[4])<1e-9;sizes.append({'asset':i,'w':d.w,'h':d.h})
(ROOT/'evidence/character-aspect-test.json').write_text(json.dumps(sizes,indent=2));print(sizes)
