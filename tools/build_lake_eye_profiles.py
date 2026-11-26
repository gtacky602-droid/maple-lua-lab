"""Restore the approved eye shape inside the half-resolution idle profiles."""
import json
from pathlib import Path

from PIL import Image


assets = Path(__file__).resolve().parents[1] / 'assets'
# Pixel bounds in the cropped v6 PNG. The surrounding water is opaque throughout.
regions = {'vivianne': (46, 11, 59, 19), 'ninianne': (77, 34, 96, 45)}


def restore_eye(base, image, region):
    width, height = base['width'] * 2, base['height'] * 2
    x0, y0, x1, y1 = region
    x0, x1 = [round(x * width / image.width) for x in (x0, x1)]
    y0, y1 = [round(y * height / image.height) for y in (y0, y1)]
    runs = []
    for x, y, w, h, color in base['runs']:
        x, y, w, h = x*2, y*2, w*2, h*2
        l, t, r, b = max(x, x0), max(y, y0), min(x+w, x1), min(y+h, y1)
        if l >= r or t >= b:
            runs.append([x, y, w, h, color])
            continue
        for rect in [(x,y,w,t-y), (x,b,w,y+h-b), (x,t,l-x,b-t), (r,t,x+w-r,b-t)]:
            if rect[2] and rect[3]:
                runs.append([*rect, color])
    reference = image.resize((width, height), Image.Resampling.NEAREST)
    palette = {row[4] for row in base['runs']}
    active = {}
    for y in range(y0, y1):
        following = {}
        x = x0
        while x < x1:
            rgba = reference.getpixel((x, y))
            color = '#%02x%02x%02x' % rgba[:3]
            assert rgba[3] == 255 and color in palette
            end = x+1
            while end < x1 and reference.getpixel((end,y)) == rgba:
                end += 1
            key = (x, end, color)
            if key in active:
                row = active[key]
                row[3] += 1
            else:
                row = [x,y,end-x,1,color]
                runs.append(row)
            following[key] = row
            x = end
        active = following
    # Check the entire output, including transparent space outside the silhouette.
    expected = Image.new('RGBA',(width,height))
    for x,y,w,h,color in base['runs']:
        expected.paste(color,(x*2,y*2,(x+w)*2,(y+h)*2))
    expected.paste(reference.crop((x0,y0,x1,y1)),(x0,y0))
    actual = Image.new('RGBA',(width,height))
    pixels = 0
    for x,y,w,h,color in runs:
        actual.paste(color,(x,y,x+w,y+h))
        pixels += w*h
    assert actual.tobytes() == expected.tobytes()
    assert actual.getchannel('A').histogram()[255] == pixels
    return dict(width=width,height=height,colors=base['colors'],runs=runs)


def build():

    for name, region in regions.items():
        prefix = 'lake-'+name+'-field-idle'
        base = json.loads((assets/(prefix+'-a-sprites-v5.json')).read_bytes())['profiles']['h32c16']
        path = assets/(prefix+'-sprites-v6.json')
        art = json.loads(path.read_bytes())
        l,t,w,h = art['box']
        with Image.open(assets/art['source']) as sheet:
            image = sheet.convert('RGBA').crop((l,t,l+w,t+h))
        updated = restore_eye(base, image, region)
        art['profiles']['h32c16'] = updated
        path.write_bytes(json.dumps(art,ensure_ascii=False,separators=(',', ':')).encode())

        print(name,len(base['runs']),len(updated['runs']))



if __name__ == '__main__':
    build()
