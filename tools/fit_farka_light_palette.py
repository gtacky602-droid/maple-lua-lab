"""Fit a sixteen-color palette to a masked two-dimensional field sprite."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / 'assets'


def fit(art):
    grid = art['profiles']['h32c16']
    width, height = grid['width'], grid['height']
    x, y, w, h = art['box']
    with Image.open(ASSETS / art['source']) as source:
        target = source.convert('RGBA').crop((x,y,x+w,y+h)).resize(
            (2*width,2*height), Image.Resampling.NEAREST)
    samples = np.asarray(target).reshape(height,2,width,2,4).transpose(0,2,1,3,4).reshape(height,width,4,4)
    mask = np.zeros((height,width), dtype=bool)
    for x,y,w,h,_ in grid['runs']:
        mask[y:y+h,x:x+w] = True
    # Keep the authored mask. Only opaque reference samples influence an edge cell.
    blocks = samples[mask]
    pixels = blocks[:,:,:3].astype(np.int16)
    weights = blocks[:,:,3] >= 128
    weights[~weights.any(axis=1)] = True
    mean = (pixels*weights[:,:,None]).sum(axis=1)/weights.sum(axis=1)[:,None]
    seed = Image.fromarray(mean.astype(np.uint8)[None,:,:]).quantize(colors=16)
    palette = np.array(seed.getpalette()[:48], dtype=np.int16).reshape(16,3)
    for iteration in range(24):
        costs = (np.abs(pixels[:,:,None,:]-palette).sum(axis=3)*weights[:,:,None]).sum(axis=1)
        nearest = costs.argmin(axis=1)
        updated = palette.copy()
        for i in range(len(palette)):
            selected = nearest==i
            values = pixels[selected][weights[selected]]
            if len(values):
                updated[i] = np.median(values,axis=0).round()
        if np.array_equal(updated,palette):
            break
        palette=updated
    colors = ['#%02x%02x%02x'%tuple(row) for row in palette]
    image = np.full((height,width),-1)
    image[mask] = nearest
    runs = []
    previous = {}
    for y,row in enumerate(image):
        active = {}
        x = 0
        while x<width:
            index = row[x]
            right = x+1
            while right<width and row[right]==index:
                right+=1
            if index>=0:
                key=(x,right-x,index)
                run=previous.get(key)
                if run is None:
                    run=[x,y,right-x,1,colors[index]]
                    runs.append(run)
                else:
                    run[3]+=1
                active[key]=run
            x=right
        previous=active
    return dict(grid,runs=runs)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('roster',choices=('farka','tristars'),default='farka',nargs='?')
    roster=parser.parse_args().roster
    if roster=='farka':
        names=[f'farka-body-{side}-sprites-v1.json' for side in ('left','right')]
    else:
        names=[f'legend-tristars-{element}-field-idle-sprites-v1.json' for element in ('cryo','electro','pyro')]
    for name in names:
        path=ASSETS/name
        art=json.loads(path.read_bytes())
        old=art['profiles']['h32c16']
        new=fit(art)
        print(name,len(old['runs']),len(new['runs']))
        art['profiles']['h32c16']=new
        path.write_bytes((json.dumps(art,ensure_ascii=False,separators=(',',':'))+'\n').encode())
