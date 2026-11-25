"""Check the nine ordinary hunting fields with a supplied native scenery decoder."""
import argparse
from hashlib import sha256
import json
from pathlib import Path

from check_scenery_download import check_modules

ROOT = Path(__file__).resolve().parents[1]

def verify(codec, downloads):
    assert codec.read_bytes() == (ROOT/'assets/MapleCodec.lua').read_bytes()
    hunts=json.loads((ROOT/'evidence/earned-hunt-contracts.json').read_bytes())['contracts']
    fields={row['field'] for row in hunts}
    sources={}
    for manifest in (ROOT/'assets').glob('*-background-generation.json'):
        for scene in json.loads(manifest.read_bytes()).get('scenes',[]):
            if scene.get('phase'):
                continue
            for field in fields.intersection([scene.get('node'),*scene.get('sharedNodes',[])]):
                assert field not in sources
                sources[field]=scene['source']
    assert fields==sources.keys()
    rows=[row for row in json.loads((downloads/'files.json').read_bytes()) if row['source'] in sources.values()]
    sizes=check_modules(codec,downloads,rows)
    assert set(sizes)==set(sources.values())
    return dict(codecSha256=sha256(codec.read_bytes()).hexdigest(), fields=dict(sorted(sources.items())),
                rasterMatches=len(rows), bytesByTier=sizes)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('codec',type=Path)
    parser.add_argument('--directory',type=Path,default=ROOT/'work/scenery-download-check')
    args=parser.parse_args()
    report=verify(args.codec,args.directory)
    (ROOT/'evidence/earned-hunt-scenery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(len(report['fields']),'fields;',report['rasterMatches'],'compressed files matched the reference pixels')
