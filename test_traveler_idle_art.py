import json,hashlib
from PIL import Image
from runtime import runtime,ROOT
lua,c=runtime();s=c.new(16);c.action(s,'campaign')
actor=s.actors[1]
profiles=['legacy','h48c32','h32c16']
checks=[]
for direction,side in [(-1,'left'),(1,'right')]:
 actor.dir=direction
 idle=c.travelerIdleArt[side]
 source=ROOT/'assets'/idle.source
 assert hashlib.sha256(source.read_bytes()).hexdigest()==idle.sha256
 with Image.open(source) as image:
  assert image.getchannel('A').getextrema()[0]==0
 for profile in profiles:
  f=c.frame(s,'sprite',profile)
  ds=[d for d in f.draws.values() if d.source and d.source.startswith('traveler-idle')]
  assert len(ds)==1
  assert (ds[0].source,ds[0].x,ds[0].y,ds[0].h,ds[0].flip)==(idle.source,actor.x-s.camera,actor.y,88,False)
  assert abs(ds[0].w/ds[0].h-idle.box[3]/idle.box[4])<1e-9
  count=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
  actor.hp=0
  assert not any(d.source==idle.source for d in c.frame(s,'sprite',profile).draws.values())
  invisible_count=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
  assert count-invisible_count==len(idle.profiles[profile].runs)
  actor.hp=140
  checks.append([side,profile,idle.source,count-invisible_count])
actor.light=2;s.camera=28
run_checks=[]
for direction,side in [(-1,'left'),(1,'right')]:
 actor.dir=direction
 idle=c.travelerIdleArt[side]
 for phase,art in c.travelerRunArt[side].items():
  source=ROOT/'assets'/art.source
  assert hashlib.sha256(source.read_bytes()).hexdigest()==art.sha256
  with Image.open(source) as image:
   alpha=image.getchannel('A')
   assert alpha.getextrema()[0]==0
   if phase>1:
    assert image.size==(100,100)
    assert alpha.point(lambda value: 255 if value>=128 else 0).getbbox()[3]==100
  actor.runDistance=(phase-1)*16
  for profile in profiles:
   actor.walk=direction
   frame=c.frame(s,'sprite',profile)
   draw=next(d for d in frame.draws.values() if d.source==art.source)
   height=88 if phase==1 else 88*art.box[4]/100
   assert (draw.x,draw.y,draw.h,draw.flip,draw.anchorX,draw.glow)==(actor.x-s.camera,actor.y,height,False,art.anchorX,True)
   assert abs(draw.w/draw.h-art.box[3]/art.box[4])<1e-9
   assert not any(d.source==idle.source or (d.kind=='sprite' and d.asset==2) for d in frame.draws.values())
   running=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
   actor.walk=0
   waiting=sum(d.kind=='rect' for d in c.frame(s,'rect',profile).draws.values())
   assert running-waiting==len(art.profiles[profile].runs)-len(idle.profiles[profile].runs)
   assert any(d.source==idle.source for d in c.frame(s,'sprite',profile).draws.values())
   run_checks.append([side,phase,profile])

def step(key,frames=1,**inputs):
 for _ in range(frames):
  c.step(s,1/60,lua.table_from({key:True,**inputs}))

def current_source():
 return next(d.source for d in c.frame(s,'sprite','legacy').draws.values() if d.source and d.source.startswith('traveler-'))

s=c.new(16);c.action(s,'campaign');actor=s.actors[1];start=actor.x
step('right',6);assert actor.x==start+21 and current_source()==c.travelerRunArt.right[2].source
step('left');assert actor.runDistance==0 and current_source()==c.travelerRunArt.left[1].source
step('left',5);assert current_source()==c.travelerRunArt.left[2].source
c.action(s,'jump');step('left',jump=True)
assert not actor.ground and current_source()==c.travelerRunArt.left[1].source
step('left',35);assert actor.ground
actor.x=20;phase=current_source();step('left',20);assert actor.x==20 and current_source()==phase
c.step(s,1/60,lua.table());assert actor.runDistance==0 and current_source()==c.travelerIdleArt.left.source

(ROOT/'evidence/traveler-art-test.json').write_text(json.dumps({'hash_alpha':True,'facings_profiles':checks,'dead_hidden':True,'run_profiles':run_checks,'native_facing':True,'actor_anchor':True,'light_outline':True,'idle_restored':True,'right_left_reversal':True,'travel_rate':True,'airborne_first_frame':True,'at_boundary_frozen':True},indent=2))
print('Traveler idle and all eight run poses passed in PNG and all three rectangle profiles')
