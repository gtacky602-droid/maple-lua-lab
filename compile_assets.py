"""Read atlas pixels into palette-quantized rectangle data; does not edit PNGs."""
from pathlib import Path
from PIL import Image
import json
P=Path(__file__).resolve().parent
im=Image.open(P/'assets/atlas-transparent.png').convert('RGBA')
sprites=[]
for i in range(8):
    x0=round(i%4*im.width/4);x1=round((i%4+1)*im.width/4)
    y0=round(i//4*im.height/2);y1=round((i//4+1)*im.height/2)
    # Alpha-bound extraction preserves the source image and all nontransparent pixels.
    pts=[(x,y) for y in range(y0,y1) for x in range(x0,x1) if im.getpixel((x,y))[3]>=128]
    left=min(x for x,y in pts);right=max(x for x,y in pts)+1
    top=min(y for x,y in pts);bottom=max(y for x,y in pts)+1
    height=64 if i<4 else 32;width=round((right-left)/(bottom-top)*height)
    runs=[];active={}
    for y in range(height):
        colors=[]
        for x in range(width):
            rgba=im.getpixel((min(right-1,int(left+(x+.5)*(right-left)/width)),min(bottom-1,int(top+(y+.5)*(bottom-top)/height))))
            colors.append(None if rgba[3]<128 else '#'+''.join(f'{min(255,round(c/17)*17):02x}' for c in rgba[:3]))
        x=0;following={}
        while x<width:
            c=colors[x];end=x+1
            while end<width and colors[end]==c:end+=1
            if c:
                key=(x,end-x,c)
                if key in active: idx=active[key];runs[idx][3]+=1
                else:idx=len(runs);runs.append([x,y,end-x,1,c])
                following[key]=idx
            x=end
        active=following
    sprites.append({'id':i+1,'box':[left,top,right-left,bottom-top],'width':width,'height':height,'runs':runs})
out={'source':'atlas-transparent.png','status':'generated style candidate; not approved animation','method':'alpha >=128, nearest pixel sampling, 16 levels/channel, horizontal and vertical equal-run merge','sprites':sprites}
(P/'assets/sprites.json').write_text(json.dumps(out,separators=(',',':')),encoding='utf-8')
print(json.dumps([{'id':s['id'],'box':s['box'],'rectangles':len(s['runs'])} for s in sprites],indent=2))
