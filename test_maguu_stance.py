import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
lua,c=runtime();s=c.new(16);c.action(s,'boss_maguu');b=s.maguu
p=ROOT/'assets/maguu-stance-sprites.json';d=json.loads(p.read_text(encoding='utf8'));assert hashlib.sha256((ROOT/'assets'/d['source']).read_bytes()).hexdigest()==d['sha256'];assert Image.open(ROOT/'assets'/d['source']).getchannel('A').getextrema()[0]==0
for phase in ['iai_warning','sweep_warning','combo_warning','recover']:
 b.phase=phase;b.zoneX=400;b.radius=100
 for facing in [-1,1]:
  b.facing=facing;f=c.frame(s,'sprite','legacy');ds=[x for x in f.draws.values() if x.kind=='boss_sprite' and x.source.startswith('maguu-')];assert len(ds)==1
  assert ds[0].source==('maguu-source-v1.png' if phase=='recover' else d['source']);assert ds[0].y==480 and ds[0].flip==(facing>0);assert ds[0].h==(150 if phase=='recover' else 130)
  for profile in d['profiles']:assert len(c.frame(s,'rect',profile).draws)>100
counts={k:len(v['runs']) for k,v in d['profiles'].items()};m={'counts':counts,'reduction':1-counts['h32c16']/counts['legacy'],'anchor':d['anchorX'],'checks':'3 anticipation phases and recovery; both orientations; same foot baseline; 3 profiles; hash/alpha'};(ROOT/'evidence/maguu-stance-metrics.json').write_text(json.dumps(m,indent=2),encoding='utf8');print(m)
