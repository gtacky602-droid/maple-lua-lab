import hashlib,json,subprocess,sys
from PIL import Image
from runtime import ROOT

old=json.loads((ROOT/'assets/ruin-guard-idle-sprites-baseline.json').read_text())
new=json.loads((ROOT/'assets/ruin-guard-idle-sprites.json').read_text())
assert old['sha256']==new['sha256']==hashlib.sha256((ROOT/'assets'/new['source']).read_bytes()).hexdigest()
assert old['box']==new['box'] and old['anchorX']==new['anchorX']
image=Image.open(ROOT/'assets'/new['source']).convert('RGBA')
def decode(p):
 grid=[[None]*p['width'] for _ in range(p['height'])]
 for x,y,w,h,color in p['runs']:
  for yy in range(y,y+h):
   for xx in range(x,x+w):
    assert grid[yy][xx] is None
    grid[yy][xx]=tuple(int(color[i:i+2],16) for i in (1,3,5))
 return grid
results=[]
for key,p in new['profiles'].items():
 a,b=decode(old['profiles'][key]),decode(p)
 assert len({v for row in b for v in row if v})<=p['colors']
 assert [[v is None for v in row] for row in a]==[[v is None for v in row] for row in b]
 errors=[0,0];samples=0
 left,top,w,h=new['box']
 for y,row in enumerate(b):
  for x,value in enumerate(row):
   sx=int(left+(x+.5)*w/p['width']);sy=int(top+(y+.5)*h/p['height'])
   # Visually identified central core, fixed source coordinates, excluding armor.
   if 730<=sx<=790 and 240<=sy<=300 and value:
    rgb=image.getpixel((sx,sy))[:3];samples+=1
    for i,grid in enumerate([a,b]):errors[i]+=sum((v-c)**2 for v,c in zip(rgb,grid[y][x]))
 assert samples>0 and errors[1]<errors[0],(key,samples,errors)
 results.append({'profile':key,'core_samples':samples,'core_rgb_squared_error_before':errors[0],'core_rgb_squared_error_after':errors[1],'runs_before':len(old['profiles'][key]['runs']),'runs_after':len(p['runs'])})
# Existing callers without accents must retain the original encoding.
output=ROOT/'work/palette-baseline-check.json'
subprocess.run([sys.executable,str(ROOT/'compile_boss_assets.py'),'--source',new['source'],'--output','../work/palette-baseline-check.json','--height','144','--foot-anchor'],check=True,capture_output=True)
assert json.loads(output.read_text())==old
(ROOT/'evidence/palette-accents.json').write_text(json.dumps({'results':results,'checks':['source unchanged','alpha mask and anchors unchanged','palette budget preserved','default compiler output unchanged'],'scope':'core color error only; not whole-image perceptual quality or FPS'},indent=2)+'\n')
print('Core colors improved in all profiles; palette budgets, silhouette and default output preserved')
