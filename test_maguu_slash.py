import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
lua,c=runtime();s=c.new(16);c.action(s,'boss_maguu');b=s.maguu
p=ROOT/'assets/maguu-slash-sprites.json';d=json.loads(p.read_text(encoding='utf8'));assert hashlib.sha256((ROOT/'assets'/d['source']).read_bytes()).hexdigest()==d['sha256'];assert Image.open(ROOT/'assets'/d['source']).getchannel('A').getextrema()[0]==0
for direction in [-1,1]:
 b.facing=direction;b.slashTime=.3
 for profile in d['profiles']:assert len(c.frame(s,'rect',profile).draws)>100
 ds=[x for x in c.frame(s,'sprite','legacy').draws.values() if x.kind=='boss_sprite' and x.source==d['source']];assert len(ds)==1 and ds[0].y==480 and ds[0].h==140 and ds[0].flip==(direction>0)
b.phase='recover';b.timer=2
for _ in range(20):c.step(s,1/60,lua.table())
assert b.slashTime==0 and not any(x.kind=='boss_sprite' and x.source==d['source'] for x in c.frame(s,'sprite','legacy').draws.values())
counts={k:len(v['runs']) for k,v in d['profiles'].items()};m={'counts':counts,'reduction':1-counts['h32c16']/counts['legacy'],'checks':'hash alpha; both orientations; foot baseline; three profiles; slash expires'};(ROOT/'evidence/maguu-slash-metrics.json').write_text(json.dumps(m,indent=2),encoding='utf8');print(m)
