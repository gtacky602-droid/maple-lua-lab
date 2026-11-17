import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
lua,c=runtime();s=c.new(16);c.action(s,'boss_oceanid');b=s.oceanid
kinds=['host','boar','crane','mallard','ferret','crab','raptor','frog','finch'];metrics={};seen=set();waves={}
for kind in kinds:
 name='oceanid'+('' if kind=='host' else '-'+kind)
 data=json.loads((ROOT/'assets'/f'{name}-sprites.json').read_text())
 source=ROOT/'assets'/data['source'];assert hashlib.sha256(source.read_bytes()).hexdigest()==data['sha256']
 im=Image.open(source);assert im.getchannel('A').getextrema()[0]==0 and im.getpixel((0,0))[3]==0
 metrics[kind]={p:len(a['runs']) for p,a in data['profiles'].items()}
 assert metrics[kind]['h32c16']<metrics[kind]['h48c32']<metrics[kind]['legacy']
 # Sprite anchor has to stay inside source bounds for both orientations.
 assert 0<=data.get('anchorX',.5)<=1
 for flip in [False,True]:
  for mode in ['sprite','rect']:
   f=lua.table_from({'draws':lua.table()});assert c.drawOceanidPart(f,kind,480,480,64,mode,'h32c16',flip)
   assert len(f.draws)>0
for _ in range(3000):
 if b.hp<=0:break
 s.actors[1].inv=1;s.actors[2].inv=1
 c.step(s,1/60,lua.table())
 if b.phase=='mimics' and b.wave not in waves:
  f=c.frame(s,'sprite','legacy')
  sources=[d.source for d in f.draws.values() if d.source and d.source.startswith('oceanid-')]
  living=[s.enemies[i] for i in range(2,len(s.enemies)+1) if s.enemies[i].hp>0]
  assert len(sources)==len(living)+1
  for e in living:assert f'oceanid-{e.mimic}-source-v1.png' in sources;seen.add(e.mimic)
  waves[b.wave]={p:len(c.frame(s,'rect',p).draws) for p in ['legacy','h48c32','h32c16']}
  for e in living:c.defeatEnemy(s,e,1)
assert len(seen)==8 and len(waves)==5 and b.hp==0
out={'assets':metrics,'wave_scene_commands':waves,'checks':'9 hashes/transparent sources; all profiles; both directions; 8 species rendered across 5 waves','scope':'rectangle counts, not PNG or native performance'}
(ROOT/'evidence/oceanid-all-art-metrics.json').write_text(json.dumps(out,indent=2),encoding='utf8');print(json.dumps(out))
