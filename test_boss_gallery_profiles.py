"""Catch stale sprite profiles in the boss gallery after field art changes."""
import json
from pathlib import Path

from tools.palette_rects import pack_grid

root=Path(__file__).resolve().parent
assets=root/'assets'
catalog=json.loads((root/'content/boss-art-gallery.json').read_bytes())
bundle=json.loads((assets/'boss-gallery-packed.json').read_bytes())
expected={name for item in catalog['items'] for name in
          (item['file'],item.get('leftFile'),item.get('rear',{}).get('file')) if name}
assert set(bundle)==expected
count=0
for name,pose in bundle.items():
    source=json.loads((assets/name).read_bytes())
    grids=source.pop('profiles')
    packed={key:dict(pack_grid(grid, compact_positions=True),colors=grid['colors']) for key,grid in grids.items()}
    assert pose==dict(source,profiles=packed),name
    count+=len(grids)
print(f'{len(bundle)} boss gallery poses and {count} profiles match their source files')
