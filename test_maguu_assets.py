import json,hashlib
from PIL import Image
from runtime import ROOT,runtime
p=ROOT/'assets/maguu-sprites.json';d=json.loads(p.read_text(encoding='utf8'));source=ROOT/'assets'/d['source'];assert hashlib.sha256(source.read_bytes()).hexdigest()==d['sha256'];assert Image.open(source).getchannel('A').getextrema()[0]==0
lua,c=runtime();s=c.new(16);c.action(s,'boss_maguu')
for direction in [-1,1]:
 s.maguu.facing=direction
 f=c.frame(s,'sprite','legacy');draw=[x for x in f.draws.values() if x.kind=='boss_sprite' and x.source==d['source']];assert len(draw)==1 and draw[0].flip==(direction>0)
 for profile in d['profiles']:
  f=c.frame(s,'rect',profile);assert len(f.draws)>len(d['profiles'][profile]['runs'])
counts={k:len(v['runs']) for k,v in d['profiles'].items()};metrics={'rectangles':counts,'reduction_vs_128px_rectangles':1-counts['h32c16']/counts['legacy'],'source_hash_verified':True,'transparent':True,'anchor':d.get('anchorX'),'initial_frame_and_both_orientations':True,'scope':'No native performance claim; PNG is a different draw primitive'}
(ROOT/'evidence/maguu-art-metrics.json').write_text(json.dumps(metrics,indent=2),encoding='utf8');print(json.dumps(metrics))
