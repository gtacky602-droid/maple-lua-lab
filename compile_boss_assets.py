"""Read generated pixels into numeric render encodings; never rewrite source art."""
from pathlib import Path
from PIL import Image
import json,hashlib,argparse,re
parser=argparse.ArgumentParser();parser.add_argument("--source",default="cryo-regisvine-source-v1.png");parser.add_argument("--output",default="boss-sprites.json");parser.add_argument("--height",type=int,default=128);parser.add_argument("--foot-anchor",action="store_true");parser.add_argument('--accent-color',action='append',default=[],help='Reserve a #RRGGBB color within the existing palette budget');parser.add_argument('--foot-anchor-band',type=float,default=.035,help='Bottom fraction used to locate the support foot; narrow for low weapons');args=parser.parse_args()
if not 0<args.foot_anchor_band<=1:parser.error('foot-anchor-band must be greater than 0 and at most 1')
if any(not re.fullmatch(r'#[0-9a-fA-F]{6}',c) for c in args.accent_color):parser.error('accent-color must be #RRGGBB')
accents=list(dict.fromkeys(tuple(int(c[i:i+2],16) for i in (1,3,5)) for c in args.accent_color))
if len(accents)>8:parser.error('at most 8 distinct accent colors')
ROOT=Path(__file__).resolve().parent
im=Image.open(ROOT/'assets'/args.source).convert('RGBA');box=im.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox();left,top,right,bottom=box

def merge(grid):
 runs=[];active={}
 for y,row in enumerate(grid):
  nxt={};x=0
  while x<len(row):
   color=row[x];end=x+1
   while end<len(row) and row[end]==color:end+=1
   if color:
    key=(x,end-x,color)
    if key in active:idx=active[key];runs[idx][3]+=1
    else:idx=len(runs);runs.append([x,y,end-x,1,color])
    nxt[key]=idx
   x=end
  active=nxt
 return runs
out={'source':args.source,'sha256':hashlib.sha256((ROOT/'assets'/args.source).read_bytes()).hexdigest(),'box':[left,top,right-left,bottom-top],'profiles':{}}
if accents:out['reserved_colors']=['#'+''.join(f'{v:02x}' for v in c) for c in accents]
for key,h,count in [('legacy',args.height,32),('h48c32',round(args.height*.75),32),('h32c16',args.height//2,16)]:
 w=round((right-left)/(bottom-top)*h)
 grid=[[im.getpixel((int(left+(x+.5)*(right-left)/w),int(top+(y+.5)*(bottom-top)/h))) for x in range(w)] for y in range(h)]
 pixels=[p[:3] for row in grid for p in row if p[3]>=128];strip=Image.new('RGB',(len(pixels),1));strip.putdata(pixels);q=strip.quantize(colors=count-len(accents),method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE);pal=q.getpalette();colors=list(dict.fromkeys([tuple(pal[i*3:i*3+3]) for i in sorted(set(q.getdata()))]+accents));cache={}
 encoded=[]
 for row in grid:
  line=[]
  for p in row:
   if p[3]<128:line.append(None);continue
   rgb=p[:3]
   if rgb not in cache:cache[rgb]=min(colors,key=lambda c:sum((a-b)**2 for a,b in zip(c,rgb)))
   line.append('#'+''.join(f'{v:02x}' for v in cache[rgb]))
  encoded.append(line)
 runs=merge(encoded);reconstructed=[[None]*w for _ in range(h)]
 for x,y,rw,rh,c in runs:
  for yy in range(y,y+rh):
   for xx in range(x,x+rw):assert reconstructed[yy][xx] is None;reconstructed[yy][xx]=c
 assert reconstructed==encoded
 out['profiles'][key]={'width':w,'height':h,'colors':count,'runs':runs}
if args.foot_anchor:
 xs=[x for y in range(bottom-max(2,round((bottom-top)*args.foot_anchor_band)),bottom) for x in range(left,right) if im.getpixel((x,y))[3]>=128]
 out['anchorX']=((min(xs)+max(xs)+1)/2-left)/(right-left)
 out['anchor_method']=f'midpoint of opaque pixels in bottom {args.foot_anchor_band*100:g} percent band'
(ROOT/'assets'/args.output).write_text(json.dumps(out,separators=(',',':')),encoding='utf8')
print(json.dumps({k:len(v['runs']) for k,v in out['profiles'].items()}))
