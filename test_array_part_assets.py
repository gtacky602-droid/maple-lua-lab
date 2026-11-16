import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
lua,c=runtime();s=c.new(16);c.action(s,'boss_array');s.array.hp=560;c.step(s,1/60,lua.table());metrics=[]
for i in range(1,5):
 d=json.loads((ROOT/f'assets/array-part-{i}-sprites.json').read_text(encoding='utf8'));p=ROOT/'assets'/d['source'];assert hashlib.sha256(p.read_bytes()).hexdigest()==d['sha256'];assert Image.open(p).getchannel('A').getextrema()[0]==0
 for facing in [-1,1]:
  s.array.parts[i].facing=facing;f=c.frame(s,'sprite','legacy');ds=[x for x in f.draws.values() if x.kind=='boss_sprite' and x.source==d['source']];assert len(ds)==1 and ds[0].flip==(facing>0) and ds[0].y==480
 for profile in d['profiles']:assert len(c.frame(s,'rect',profile).draws)>len(d['profiles'][profile]['runs'])
 counts={k:len(v['runs']) for k,v in d['profiles'].items()};metrics.append({'part':i,'counts':counts,'reduction':1-counts['h32c16']/counts['legacy'],'sha256':d['sha256'],'anchor':d.get('anchorX',.5)})
(ROOT/'evidence/array-parts-metrics.json').write_text(json.dumps({'parts':metrics,'checks':'4 hashes, transparency, both facings, 3 profiles, shared bottom baseline'},indent=2),encoding='utf8');print('4 sentinel asset validations passed')
