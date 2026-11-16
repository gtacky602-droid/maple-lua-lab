"""Compile alternate rectangle encodings; original PNG and legacy JSON stay intact."""
from runtime import ROOT
from PIL import Image
import json, hashlib
im=Image.open(ROOT/'assets/atlas-transparent.png').convert('RGBA')
base=json.loads((ROOT/'assets/sprites.json').read_text())

def merge(grid):
    runs=[];active={}
    for y,row in enumerate(grid):
        following={};x=0
        while x<len(row):
            c=row[x];end=x+1
            while end<len(row) and row[end]==c:end+=1
            if c is not None:
                key=(x,end-x,c)
                if key in active:idx=active[key];runs[idx][3]+=1
                else:idx=len(runs);runs.append([x,y,end-x,1,c])
                following[key]=idx
            x=end
        active=following
    return runs

variants={'legacy':{'label':'従来 64px / RGB各16階調','sprites':base['sprites']}}
packed=[]
for s in base['sprites']:
    grid=[[None]*s['width'] for _ in range(s['height'])]
    for x,y,w,h,c in s['runs']:
        for yy in range(y,y+h):
            for xx in range(x,x+w):grid[yy][xx]=c
    transposed=[list(row) for row in zip(*grid)]
    vertical=[[y,x,h,w,c] for x,y,w,h,c in merge(transposed)]
    # Greedy maximal same-color rectangles, including different width/height choices.
    work=[row[:] for row in grid];greedy=[]
    for y in range(s['height']):
        for x in range(s['width']):
            c=work[y][x]
            if c is None:continue
            width=s['width']-x;best=(1,1,1)
            for yy in range(y,s['height']):
                ww=0
                while ww<width and work[yy][x+ww]==c:ww+=1
                width=ww
                if not width:break
                height=yy-y+1
                if width*height>best[0]:best=(width*height,width,height)
            _,w,h=best;greedy.append([x,y,w,h,c])
            for yy in range(y,y+h):
                for xx in range(x,x+w):work[yy][xx]=None
    chosen=min([s['runs'],vertical,greedy],key=len)
    restored=[[None]*s['width'] for _ in range(s['height'])]
    for x,y,w,h,c in chosen:
        for yy in range(y,y+h):
            for xx in range(x,x+w):assert restored[yy][xx] is None;restored[yy][xx]=c
    assert restored==grid
    packed.append({**s,'runs':chosen})
variants['lossless']={'label':'従来画質 / 矩形の再結合','sprites':packed,'pixel_exact_to':'legacy'}
for height in (32,48,64):
    sampled=[]
    for i,s in enumerate(base['sprites']):
        left,top,w,h=s['box'];hh=height if i<4 else height//2;ww=round(w/h*hh)
        grid=[[im.getpixel((min(left+w-1,int(left+(x+.5)*w/ww)),min(top+h-1,int(top+(y+.5)*h/hh)))) for x in range(ww)] for y in range(hh)]
        sampled.append(grid)
    for count in (16,32):
        # Palette shared across each character's two poses, preserving pose consistency.
        palettes={}
        for group,ids in enumerate(((0,1),(2,3),(4,5),(6,),(7,))):
            pixels=[p[:3] for i in ids for row in sampled[i] for p in row if p[3]>=128]
            strip=Image.new('RGB',(len(pixels),1));strip.putdata(pixels)
            q=strip.quantize(colors=count,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
            pal=q.getpalette();used=sorted(set(q.getdata()))
            colors=[tuple(pal[n*3:n*3+3]) for n in used]
            for i in ids:palettes[i]=colors
        sprites=[]
        for i,grid in enumerate(sampled):
            pal=palettes[i];cache={};error=0;opaque=0;encoded=[]
            for row in grid:
                line=[]
                for p in row:
                    if p[3]<128:line.append(None);continue
                    rgb=p[:3]
                    if rgb not in cache:cache[rgb]=min(pal,key=lambda c:sum((a-b)**2 for a,b in zip(rgb,c)))
                    c=cache[rgb];error+=sum((a-b)**2 for a,b in zip(rgb,c));opaque+=1
                    line.append('#'+''.join(f'{v:02x}' for v in c))
                encoded.append(line)
            runs=merge(encoded)
            # Exact reconstruction test ensures merging does not change any sampled pixels.
            restored=[[None]*len(grid[0]) for _ in grid]
            for x,y,w,h,c in runs:
                for yy in range(y,y+h):
                    for xx in range(x,x+w):assert restored[yy][xx] is None;restored[yy][xx]=c
            assert restored==encoded
            sprites.append({'id':i+1,'box':base['sprites'][i]['box'],'width':len(grid[0]),'height':len(grid),'runs':runs,'opaque_pixels':opaque,'palette_colors':len(pal),'rgb_rmse':(error/max(1,opaque*3))**.5})
        variants[f'h{height}c{count}']={'label':f'{height}px / {count}色','height':height,'colors':count,'sprites':sprites}
out={'source_sha256':hashlib.sha256((ROOT/'assets/atlas-transparent.png').read_bytes()).hexdigest(),'notes':'Character height; enemies half height. Palette shared per character, no dithering. Alpha threshold 128. RMSE measures color quantization only, not silhouette quality. Original PNG unchanged.','variants':variants}
(ROOT/'assets/variants.json').write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False),encoding='utf8')
summary={k:{'label':v['label'],'rectangles':[len(s['runs']) for s in v['sprites']],'json_bytes':len(json.dumps(v,separators=(',',':')).encode())} for k,v in variants.items()}
(ROOT/'evidence/variants-build.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
