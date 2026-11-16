import json,hashlib
from PIL import Image
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'companion:columbina');data=json.loads((ROOT/'assets/columbina-idle-sprites.json').read_text());assert hashlib.sha256((ROOT/'assets'/data['source']).read_bytes()).hexdigest()==data['sha256'];assert Image.open(ROOT/'assets'/data['source']).getchannel('A').getextrema()[0]==0
checks=[]
for direction in [-1,1]:
 s.actors[2].dir=direction
 for profile in ['legacy','h48c32','h32c16']:
  f=c.frame(s,'sprite',profile);ds=[d for d in f.draws.values() if d.kind=='boss_sprite' and d.source==data['source']];assert len(ds)==1 and ds[0].flip==(direction<0) and ds[0].h==88
  f=c.frame(s,'rect',profile);assert not any(d.kind=='rect' and d.color=='#a4b1d4' for d in f.draws.values());checks.append([direction,profile])
s.actors[2].hp=0;assert not any(d.kind=='boss_sprite' and d.source==data['source'] for d in c.frame(s,'sprite','legacy').draws.values())
(ROOT/'evidence/columbina-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True},indent=2));print('Columbina art checks passed')
