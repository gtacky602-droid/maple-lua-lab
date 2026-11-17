import json,hashlib
from PIL import Image
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');data=json.loads((ROOT/'assets/traveler-idle-sprites-v3.json').read_text());assert hashlib.sha256((ROOT/'assets'/data['source']).read_bytes()).hexdigest()==data['sha256'];assert Image.open(ROOT/'assets'/data['source']).getchannel('A').getextrema()[0]==0
checks=[]
for direction in [-1,1]:
 s.actors[1].dir=direction
 for profile in ['legacy','h48c32','h32c16']:
  f=c.frame(s,'sprite',profile);ds=[d for d in f.draws.values() if d.kind=='boss_sprite' and d.source==data['source']];assert len(ds)==1 and ds[0].flip==(direction<0) and ds[0].h==88
  f=c.frame(s,'rect',profile);assert not any(d.kind=='rect' and d.color=='#a4b1d4' for d in f.draws.values());checks.append([direction,profile])
s.actors[1].hp=0;assert not any(d.kind=='boss_sprite' and d.source==data['source'] for d in c.frame(s,'sprite','legacy').draws.values())
(ROOT/'evidence/traveler-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True},indent=2));print('Traveler art checks passed')

s.actors[1].hp=140;s.actors[1].walk=1
f=c.frame(s,'sprite','legacy');assert any(d.kind=='sprite' and d.asset==2 for d in f.draws.values());assert not any(d.source==data['source'] for d in f.draws.values())
s.actors[1].walk=0;f=c.frame(s,'sprite','legacy');assert any(d.source==data['source'] for d in f.draws.values())
print('Existing run pose preserved; idle restored')
