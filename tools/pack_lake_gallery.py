"""Pack the two gallery profiles as palette-indexed five-byte rectangles."""
import base64
import json
from pathlib import Path

assets = Path(__file__).resolve().parents[1] / 'assets'
gallery = {}
for name in ('ninianne', 'vivianne'):
    art = json.loads((assets / f'lake-{name}-field-idle-a-sprites-v5.json').read_bytes())
    profiles = {}
    for key in ('h48c32', 'h32c16'):
        grid = art['profiles'][key]
        runs = grid['runs']
        palette = list(dict.fromkeys(row[4] for row in runs))
        indices = {color: i for i, color in enumerate(palette)}
        packed = bytes(v for x, y, w, h, color in runs for v in (x, y, w, h, indices[color]))
        encoded = base64.b64encode(packed).decode('ascii')
        decoded = base64.b64decode(encoded)
        assert [[*decoded[i:i+4], palette[decoded[i+4]]] for i in range(0, len(decoded), 5)] == runs
        profiles[key] = dict(width=grid['width'], height=grid['height'], palette=palette, data=encoded)
        print(name, key, len(runs))
    gallery[name] = dict(source=art['source'], box=art['box'], profiles=profiles)
(assets / 'lake-legend-gallery.json').write_bytes(json.dumps(gallery,separators=(',', ':')).encode()+b'\n')
