"""Build the 16-color torso, spending extra samples on the mask and Electro emblem."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
BASE = ASSETS / 'shouki-weekly-torso-sprites-v2.json'
PALETTE = ['#140e16', '#362735', '#514455', '#765951', '#a18160', '#cba576', '#e6c38c',
           '#f4dfb3', '#fff4ec', '#9c3439', '#50225b', '#71328b', '#9665ab', '#ae41eb',
           '#d77afa', '#f3cbff']
RGB = np.array(
    [list(bytes.fromhex(c[1:])) for c in PALETTE], dtype=np.int32)
FOCUS = {'mask': (458, 413, 587, 562), 'emblem': (467, 562, 576, 676),
         'left_trim': (182, 612, 254, 670), 'right_trim': (787, 612, 859, 670)}


def sample(source, size):
    rgba = np.asarray(source.resize(size, Image.Resampling.BOX)).astype(np.int32)
    delta = rgba[:, :, None, :3] - RGB
    nearest = ((delta ** 2 * [3, 4, 3]).sum(axis=3)).argmin(axis=2)
    return np.where(rgba[:, :, 3] >= 128, nearest, -1)


def pack(grid):
    runs = []
    previous = {}
    for y, row in enumerate(grid):
        edges = [0, *list(np.flatnonzero(row[1:] != row[:-1]) + 1), len(row)]
        active = {}
        for x, end in zip(edges, edges[1:]):
            color = int(row[x])
            if color < 0:
                continue
            key = (int(x), int(end-x), color)
            item = previous.get(key)
            if item is None:
                item = [key[0], y, key[1], 0, PALETTE[color]]
                runs.append(item)
            item[3] += 1
            active[key] = item
        previous = active
    return runs


def paint(profile, size):
    image = Image.new('RGBA', (profile['width'], profile['height']))
    draw = ImageDraw.Draw(image)
    for x, y, w, h, c in profile['runs']:
        draw.rectangle((x,y,x+w-1,y+h-1), fill=c)
    return image.resize(size, Image.Resampling.NEAREST)


def main():
    data = json.loads(BASE.read_text('utf8'))
    src = ASSETS / data['source']
    assert hashlib.sha256(src.read_bytes()).hexdigest() == data['sha256']
    left, top, w, h = data['box']
    original = Image.open(src).convert('RGBA').crop((left, top, left+w, top+h))
    previous = data['profiles']['h32c16']
    size = (previous['width'], previous['height'])
    fine_size = (size[0]*2, size[1]*2)
    grid = sample(original, size).repeat(2, axis=0).repeat(2, axis=1)
    fine = sample(original, fine_size)
    yy, xx = np.indices(grid.shape)
    xx = left + (xx + .5)*w/fine_size[0]
    yy = top + (yy + .5)*h/fine_size[1]
    for x0, y0, x1, y1 in FOCUS.values():
        inside = (xx>=x0) & (xx<x1) & (yy>=y0) & (yy<y1)
        grid[inside] = fine[inside]
    # Give the three curved marks inside the gem three samples per base cell.
    # Both the doubled face and tripled gem fit a common sixfold integer grid.
    grid = grid.repeat(3, axis=0).repeat(3, axis=1)
    gem = sample(original, (size[0]*3, size[1]*3)).repeat(2,axis=0).repeat(2,axis=1)
    fine_size = (size[0]*6, size[1]*6)
    yy, xx = np.indices(grid.shape)
    in_gem = (((left+(xx+.5)*w/fine_size[0]-522)/38)**2
              + ((top+(yy+.5)*h/fine_size[1]-622)/40)**2 <= 1)
    grid[in_gem] = gem[in_gem]
    runs = pack(grid)
    profile = dict(width=fine_size[0], height=fine_size[1], colors=len(PALETTE), runs=runs)
    data['profiles']['h32c16'] = profile
    (ASSETS/'shouki-weekly-torso-sprites-v3.json').write_text(
        json.dumps(data, separators=(',',':'))+'\n', 'utf8')

    old, new = (paint(p, original.size) for p in (previous,profile))
    metrics = {}
    for name, (x0,y0,x1,y1) in FOCUS.items():
        box = (x0-left,y0-top,x1-left,y1-top)
        ref, a, b = [np.asarray(im.crop(box),dtype=np.int32) for im in (original,old,new)]
        solid = ref[:,:,3] >= 240
        mae = lambda im: round(float(np.abs(ref[:,:,:3]-im[:,:,:3])[solid].mean()),2)
        metrics[name] = {'v2RgbMae':mae(a),'v3RgbMae':mae(b)}
        assert mae(b)<mae(a)
    (ROOT/'evidence/shouki-focus-color.json').write_text(json.dumps(metrics,indent=2)+'\n','utf8')
    box = (420-left,395-top,625-left,700-top)
    result = Image.new('RGB',(615,333),'#27303b')
    draw = ImageDraw.Draw(result)
    for i,(im,label) in enumerate(zip((original,old,new),('PNG','16 colors / before','16 colors / focus'))):
        crop = im.crop(box)
        result.paste(crop,(205*i,28),crop)
        draw.text((205*i+10,8),label,fill='white')
    result.save(ROOT/'evidence/shouki-focus-comparison.png')
    print(metrics, len(runs))


if __name__ == '__main__':
    main()
