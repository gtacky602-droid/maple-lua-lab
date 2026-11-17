import json,hashlib
from PIL import Image
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'companion:beidou')
actor=s.actors[2];s.camera=28
checks=[]
for direction,side in [(-1,'left'),(1,'right')]:
 actor.dir=direction
 data=json.loads((ROOT/f'assets/beidou-idle-{side}-sprites-v4.json').read_text(encoding='utf8'))
 source=ROOT/'assets'/data['source']
 assert hashlib.sha256(source.read_bytes()).hexdigest()==data['sha256']
 with Image.open(source) as image:
  assert image.getchannel('A').getextrema()[0]==0
 for profile in ['legacy','h48c32','h32c16']:
  f=c.frame(s,'sprite',profile)
  ds=[d for d in f.draws.values() if d.source and d.source.startswith('beidou-idle-')]
  assert len(ds)==1
  draw=ds[0]
  assert (draw.source,draw.flip,draw.h,draw.x,draw.y,draw.anchorX)==(data['source'],False,88,actor.x-s.camera,actor.y,data['anchorX'])
  assert abs(draw.w/draw.h-data['box'][2]/data['box'][3])<1e-9
  f=c.frame(s,'rect',profile);count=sum(d.kind=='rect' for d in f.draws.values())
  actor.hp=0
  assert not any(d.source==data['source'] for d in c.frame(s,'sprite',profile).draws.values())
  without=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
  assert count-without==len(data['profiles'][profile]['runs'])
  actor.hp=140
  checks.append({'side':side,'profile':profile,'source':draw.source,'rectangles':count-without})
(ROOT/'evidence/beidou-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True},indent=2));print('Beidou art checks passed')
