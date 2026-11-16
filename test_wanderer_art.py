import json,hashlib
from PIL import Image
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'companion:wanderer');data=json.loads((ROOT/'assets/wanderer-idle-sprites.json').read_text());assert hashlib.sha256((ROOT/'assets'/data['source']).read_bytes()).hexdigest()==data['sha256'];assert Image.open(ROOT/'assets'/data['source']).getchannel('A').getextrema()[0]==0
checks=[]
for direction in [-1,1]:
 s.actors[2].dir=direction
 for profile in ['legacy','h48c32','h32c16']:
  f=c.frame(s,'sprite',profile);ds=[d for d in f.draws.values() if d.kind=='boss_sprite' and d.source==data['source']];assert len(ds)==1 and ds[0].flip==(direction<0) and ds[0].h==88
  f=c.frame(s,'rect',profile);assert not any(d.kind=='rect' and d.color=='#a4b1d4' for d in f.draws.values());checks.append([direction,profile])
c.action(s,'swap');c.action(s,'skill1')
for _ in range(60):c.step(s,1/60,lua.table())
a=s.actors[2];ds=[d for d in c.frame(s,'sprite','legacy').draws.values() if d.kind=='boss_sprite' and d.source==data['source']];assert a.y<480 and len(ds)==1 and ds[0].y==a.y
s.actors[2].hp=0;assert not any(d.kind=='boss_sprite' and d.source==data['source'] for d in c.frame(s,'sprite','legacy').draws.values())
(ROOT/'evidence/wanderer-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True,'float_tracks_actor':True},indent=2));print('Wanderer art checks passed')
