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

# The placement editor and enemy gallery compare only these original slime poses.
previews = {}
for species, index in [('hydro-slime', 4), ('pyro-slime', 6)]:
    grids = {profile: pack_grid(profiles[profile]['sprites'][index])
             for profile in ('legacy', 'h48c32', 'h32c16')}
    previews[species] = {'source': 'atlas-transparent.png',
                         'box': profiles['legacy']['sprites'][index]['box'], 'profiles': grids}
(assets / 'slime-preview-packed.json').write_bytes(json.dumps(
    previews, separators=(',', ':')).encode())
