"""Pack all character gallery poses while preserving anchors and profile dimensions."""
import argparse
import json
from pathlib import Path
from palette_rects import pack_grid

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
parser = argparse.ArgumentParser()
parser.add_argument('--gallery', choices=['character','boss'], default='character')
gallery = parser.parse_args().gallery
catalog = json.loads((root / f'content/{gallery}-art-gallery.json').read_bytes())
packed = {}
source_bytes = 0
for item in catalog['items']:
    for file in (item['file'], item.get('leftFile'), item.get('rear', {}).get('file')):
        if not file or file in packed:
            continue
        raw = (assets / file).read_bytes()
        art = json.loads(raw)
        source_bytes += len(raw)
        art['profiles'] = {
            name: dict(pack_grid(grid), colors=grid['colors']) for name, grid in art['profiles'].items()
        }
        packed[file] = art
output = assets / f'{gallery}-gallery-packed.json'
output.write_bytes((json.dumps(packed, ensure_ascii=False, separators=(',', ':'))+'\n').encode())
print(f'{len(packed)} poses: {source_bytes} bytes -> {output.stat().st_size} bytes')
