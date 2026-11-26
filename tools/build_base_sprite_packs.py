"""Build the eight original simulator sprite profiles from the comparison sources."""
import json
from pathlib import Path

from palette_rects import pack_grid

assets = Path(__file__).resolve().parents[1] / 'assets'
profiles = json.loads((assets / 'variants.json').read_bytes())['variants']
assert profiles['legacy']['sprites'] == json.loads((assets / 'sprites.json').read_bytes())['sprites']
output = assets / 'base-packed'
output.mkdir(exist_ok=True)
for profile, variant in profiles.items():
    packed = []
    for sprite in variant['sprites']:
        metadata = {key: value for key, value in sprite.items() if key != 'runs'}
        packed.append({**metadata, **pack_grid(sprite)})
    (output / f'{profile}.json').write_bytes(json.dumps(
        {'sprites': packed}, ensure_ascii=False, separators=(',', ':')).encode())
