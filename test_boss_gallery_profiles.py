"""Catch stale sprite profiles in the boss gallery after field art changes."""
import json
from pathlib import Path

from tools.palette_rects import pack_grid
from tools.legend_pose_profiles import refine_pose

root=Path(__file__).resolve().parent
assets=root/'assets'
catalog=json.loads((root/'content/boss-art-gallery.json').read_bytes())
bundle=json.loads((assets/'boss-gallery-packed.json').read_bytes())
expected={name for item in catalog['items'] for name in
          (item['file'],item.get('leftFile'),item.get('rear',{}).get('file')) if name}
assert set(bundle)==expected
index=json.loads((assets/'placement-pose-index.json').read_bytes())
layouts=json.loads((root/'content/enemy-art-layout.json').read_bytes())
count=0
for name,pose in bundle.items():
    source=refine_pose(name,json.loads((assets/name).read_bytes()),assets)
    grids=source.pop('profiles')
    packed={key:dict(pack_grid(grid, compact_positions=True),colors=grid['colors']) for key,grid in grids.items()}
    assert pose==dict(source,profiles=packed),name
    entry=index[name]
    assert (entry['sourceImage'],entry['box'])==(pose['source'],pose['box']),name
    individual=json.loads((assets/entry['poseFile']).read_bytes())
    if 'geometrySpecies' in individual:
        species=individual.pop('geometrySpecies')
        base=json.loads((assets/'field-packed'/layouts[species]['file']).read_bytes())
        individual['profiles']={key:dict(base['profiles'][key],palette=palette)
                                for key,palette in individual.pop('palettes').items()}
    assert individual==pose,name
    count+=len(grids)
print(f'{len(bundle)} boss gallery poses and {count} profiles match their source files')
