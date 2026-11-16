import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
lua,c=runtime();s=c.new(16);c.action(s,'boss_maguu');b=s.maguu
p=ROOT/'assets/maguu-mask-sprites.json';d=json.loads(p.read_text(encoding='utf8'));assert hashlib.sha256((ROOT/'assets'/d['source']).read_bytes()).hexdigest()==d['sha256'];assert Image.open(ROOT/'assets'/d['source']).getchannel('A').getextrema()[0]==0
for phase in ['ready','mask_warning','push_warning','push']:
 b.phase=phase;b.maskFlash=.2 if phase=='ready' else 0;b.zoneX=400;b.radius=100;b.pushFrom=500;b.mask=lua.table_from({'x':450}) if phase=='push' else None
 for facing in [-1,1]:
  b.facing=facing
  f=c.frame(s,'sprite','legacy');ds=[x for x in f.draws.values() if x.kind=='boss_sprite' and x.source==d['source']];assert len(ds)==1 and ds[0].flip==(facing>0)
  for profile in d['profiles']:assert len(c.frame(s,'rect',profile).draws)>len(d['profiles'][profile]['runs'])
counts={k:len(v['runs']) for k,v in d['profiles'].items()};m={'counts':counts,'reduction':1-counts['h32c16']/counts['legacy'],'checks':'4 uses x 2 orientations x 3 rectangle profiles; source hash and alpha','scope':'rectangle counts, not native performance'};(ROOT/'evidence/maguu-mask-metrics.json').write_text(json.dumps(m,indent=2),encoding='utf8');print(m)
