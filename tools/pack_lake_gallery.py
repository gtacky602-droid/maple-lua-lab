"""Pack the two gallery profiles as palette-indexed five-byte rectangles."""
from palette_rects import pack_grid
import json
from pathlib import Path

assets = Path(__file__).resolve().parents[1] / 'assets'
gallery = {}
for name in ('ninianne', 'vivianne'):
    art = json.loads((assets / f'lake-{name}-field-idle-a-sprites-v5.json').read_bytes())
    profiles = {}
    for key in ('h48c32', 'h32c16'):
        grid = art['profiles'][key]
        profiles[key] = pack_grid(grid)
        print(name, key, len(grid['runs']))
    gallery[name] = dict(source=art['source'], box=art['box'], profiles=profiles)
(assets / 'lake-legend-gallery.json').write_bytes(json.dumps(gallery,separators=(',', ':')).encode()+b'\n')
