"""Verify the selected export of each backdrop against its measured RGB raster."""
import argparse
import hashlib
import json
from pathlib import Path

from lupa.lua53 import LuaRuntime
from PIL import Image, ImageDraw


def check(codec, directory):
    lua=LuaRuntime(encoding=None)
    ctx=lua.table()
    lua.execute(codec.read_bytes())(ctx)
    groups={}
    for i, row in enumerate(json.loads((directory/'files.json').read_text('utf8')), start=1):
        raw=(directory/row['file']).read_bytes()
        assert len(raw)==row['bytes']
        scenes=lua.execute(raw)
        filename=row['source'].encode()
        assert list(scenes.keys())==[filename]
        scene=scenes[filename]
        n=row['rectangles']
        assert scene[b'count']==n-4096
        ctx[b'profiles'][i]=scene[b'base']
        key=row['file'].encode()
        ctx[b'scenerySplits'][key]=scene[b'details']
        profile=ctx[b'refinedScenery'](key,ctx[b'profile'](i))
        runs=profile[b'runs']
        assert len(runs)==n
        image=Image.new('RGB',(512,288))
        draw=ImageDraw.Draw(image)
        for index in range(1,n+1):
            rect=runs[index]
            x,y,w,h,color=(rect[j] for j in range(1,6))
            draw.rectangle((x,y,x+w-1,y+h-1),fill=color.decode())
        assert hashlib.sha256(image.tobytes()).hexdigest()==row['rgbSha256'],row['file']
        groups.setdefault(row['source'],{})[n]=len(raw)
    for costs in groups.values():
        assert list(costs)==[4096,4608,5120,5632,6144]
        assert all(a<b for a,b in zip(costs.values(),list(costs.values())[1:]))
    return {'codecSha256':hashlib.sha256(codec.read_bytes()).hexdigest(),'verifiedModules':sum(map(len,groups.values())),
            'dimensions':[512,288],'fileBytesByRectangles':groups}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('codec',type=Path,nargs='?',default=Path(__file__).resolve().parents[1]/'assets/MapleCodec.lua')
    parser.add_argument('--directory',type=Path,default=Path('work/scenery-download-check'))
    args=parser.parse_args()
    report=check(args.codec,args.directory)
    Path('evidence/scenery-download-tiers.json').write_text(json.dumps(report,indent=2)+'\n','utf8')
    print(f"{report['verifiedModules']} independent Lua exports matched the displayed tiers.")
