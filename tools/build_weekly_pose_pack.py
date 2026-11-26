"""Pack weekly boss poses separately so entering an arena only loads visible poses."""
import json
from pathlib import Path
from palette_rects import pack_grid

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
out = assets / 'weekly-packed'
out.mkdir(exist_ok=True)
catalog = json.loads((root / 'content/weekly-pose-files.json').read_bytes())
files = sorted({name for poses in catalog.values() for name in poses.values()})
before = after = 0
for name in files:
    raw = (assets / name).read_bytes()
    art = json.loads(raw)
    art['profiles'] = {
        key: dict(pack_grid(grid), colors=grid['colors']) for key, grid in art['profiles'].items()
    }
    packed = (json.dumps(art, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
    (out / name).write_bytes(packed)
    before += len(raw)
    after += len(packed)
print(f'{len(files)} poses in {len(catalog)} groups: {before} -> {after} bytes')
