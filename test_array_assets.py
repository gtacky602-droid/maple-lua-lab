import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
lua,c=runtime();s=c.new(16);c.action(s,'boss_array');b=s.array
p=ROOT/'assets/array-sprites.json';d=json.loads(p.read_text(encoding='utf8'));assert hashlib.sha256((ROOT/'assets'/d['source']).read_bytes()).hexdigest()==d['sha256'];assert Image.open(ROOT/'assets'/d['source']).getchannel('A').getextrema()[0]==0
for phase,h,y in [('ready',140,465),('rocket',140,280),('down',90,480),('split',75,465)]:
 b.phase=phase;f=c.frame(s,'sprite','legacy');ds=[x for x in f.draws.values() if x.kind=='boss_sprite' and x.source==d['source']];assert len(ds)==1 and ds[0].h==h and ds[0].y==y
 for profile in d['profiles']:assert len(c.frame(s,'rect',profile).draws)>=len(d['profiles'][profile]['runs'])
b.hp=0;assert not any(x.kind=='boss_sprite' and x.source==d['source'] for x in c.frame(s,'sprite','legacy').draws.values())
counts={k:len(v['runs']) for k,v in d['profiles'].items()};m={'counts':counts,'reduction':1-counts['h32c16']/counts['legacy'],'checks':'source hash, alpha, four phase display states x three profiles, death hidden','scope':'static candidate, rectangle count comparison only'};(ROOT/'evidence/array-art-metrics.json').write_text(json.dumps(m,indent=2),encoding='utf8');print(m)
