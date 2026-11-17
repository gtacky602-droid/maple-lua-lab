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
actor=s.actors[1];actor.hp=140;actor.light=2;s.camera=28
run_checks=[]
for direction,side in [(-1,'left'),(1,'right')]:
 actor.dir=direction
 art=json.loads((ROOT/f'assets/traveler-run-{side}-sprites-v3.json').read_text())
 assert hashlib.sha256((ROOT/'assets'/art['source']).read_bytes()).hexdigest()==art['sha256']
 assert Image.open(ROOT/'assets'/art['source']).getchannel('A').getextrema()[0]==0
 for profile in ['legacy','h48c32','h32c16']:
  actor.walk=1
  frame=c.frame(s,'sprite',profile)
  draw=next(d for d in frame.draws.values() if d.source==art['source'])
  assert (draw.x,draw.y,draw.h,draw.flip,draw.anchorX,draw.glow)==(actor.x-s.camera,actor.y,88,False,art['anchorX'],True)
  assert not any(d.source==data['source'] or (d.kind=='sprite' and d.asset==2) for d in frame.draws.values())
  running=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
  actor.walk=0
  waiting=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
  assert running-waiting==len(art['profiles'][profile]['runs'])-len(data['profiles'][profile]['runs'])
  assert any(d.source==data['source'] for d in c.frame(s,'sprite',profile).draws.values())
  run_checks.append([side,profile])
(ROOT/'evidence/traveler-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True,'run_profiles':run_checks,'native_facing':True,'actor_anchor':True,'light_outline':True,'idle_restored':True},indent=2))
print('Traveler idle and direction-specific run art passed in PNG and all three profiles')
