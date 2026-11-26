"""Pack all character gallery poses while preserving anchors and profile dimensions."""
import sys
import argparse
import json
from pathlib import Path
from palette_rects import pack_grid
from build_placement_pose_index import build_placement_pose_index

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
parser = argparse.ArgumentParser()
parser.add_argument('--gallery', choices=['character','boss','common-boss'], default='character')
gallery = parser.parse_args().gallery
if gallery=='common-boss':
    sys.path.insert(0,str(root))
    from common_boss_art import FILES
    files=FILES
    output=assets/'common-boss-packed.json'
else:
    catalog=json.loads((root/f'content/{gallery}-art-gallery.json').read_bytes())
    files=[file for item in catalog['items'] for file in
           (item['file'],item.get('leftFile'),item.get('rear',{}).get('file')) if file]
    output=assets/f'{gallery}-gallery-packed.json'
packed = {}
source_bytes = 0
for file in dict.fromkeys(files):
    raw = (assets/file).read_bytes()
    art = json.loads(raw)
    source_bytes += len(raw)
    art['profiles'] = {name:dict(pack_grid(grid), colors=grid['colors'])
                       for name,grid in art['profiles'].items()}
    packed[file] = art
output.write_bytes((json.dumps(packed, ensure_ascii=False, separators=(',', ':'))+'\n').encode())
if gallery in ('character', 'boss'):
    build_placement_pose_index(assets)
print(f'{len(packed)} poses: {source_bytes} bytes -> {output.stat().st_size} bytes')
