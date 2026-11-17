import json,hashlib
from PIL import Image
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign');c.action(s,'companion:amber');data=json.loads((ROOT/'assets/amber-idle-sprites-v3.json').read_text());assert hashlib.sha256((ROOT/'assets'/data['source']).read_bytes()).hexdigest()==data['sha256'];assert Image.open(ROOT/'assets'/data['source']).getchannel('A').getextrema()[0]==0
checks=[]
for direction in [-1,1]:
 s.actors[2].dir=direction
 for profile in ['legacy','h48c32','h32c16']:
  f=c.frame(s,'sprite',profile);ds=[d for d in f.draws.values() if d.kind=='boss_sprite' and d.source==data['source']];assert len(ds)==1 and ds[0].flip==(direction<0) and ds[0].h==88
  f=c.frame(s,'rect',profile);assert not any(d.kind=='rect' and d.color=='#a4b1d4' for d in f.draws.values());checks.append([direction,profile])
s.actors[2].hp=0;assert not any(d.kind=='boss_sprite' and d.source==data['source'] for d in c.frame(s,'sprite','legacy').draws.values())
s.actors[2].hp=140;s.actors[2].lock=1
bow=json.loads((ROOT/'assets/amber-bow-sprites-v3.json').read_text());assert hashlib.sha256((ROOT/'assets'/bow['source']).read_bytes()).hexdigest()==bow['sha256']
for direction in [-1,1]:
 s.actors[2].dir=direction
 for profile in ['legacy','h48c32','h32c16']:
  f=c.frame(s,'sprite',profile)
  d=next(d for d in f.draws.values() if d.source==bow['source']);assert (d.h,d.y,d.anchorX,d.flip)==(88,480,bow['anchorX'],direction<0)
  assert not any(d.source==data['source'] or (d.kind=='sprite' and d.asset==4) for d in f.draws.values())
  def rect_count(): return sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
  armed=rect_count();s.actors[2].lock=0
  assert armed-rect_count()==len(bow['profiles'][profile]['runs'])-len(data['profiles'][profile]['runs'])
  s.actors[2].lock=1
s.actors[2].lock=0;f=c.frame(s,'sprite','legacy');assert any(d.source==data['source'] for d in f.draws.values())
(ROOT/'evidence/amber-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True,'bow_grounded':True,'bow_png_and_rect_profiles':checks,'idle_restored':True},indent=2))
print('Amber bow and idle art switch in both directions and all three profiles')
