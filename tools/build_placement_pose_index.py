"""Reuse individually packed poses, writing only gallery poses without an exact match."""
import json
from pathlib import Path

def palette_variant(pose, base, species):
    """Share runs only when every profile has the same packed geometry and indices."""
    profiles = pose['profiles']
    if profiles.keys() != base['profiles'].keys():
        return None
    for name, grid in profiles.items():
        ordinary = base['profiles'][name]
        if {k:v for k,v in grid.items() if k != 'palette'} != {
            k:v for k,v in ordinary.items() if k != 'palette'
        } or len(grid['palette']) != len(ordinary['palette']):
            return None
    return {**{k:v for k,v in pose.items() if k != 'profiles'},
            'geometrySpecies': species,
            'palettes': {name:grid['palette'] for name,grid in profiles.items()}}


def build_placement_pose_index(assets):
    output = assets / 'placement-packed'
    output.mkdir(exist_ok=True)
    directories = sorted(d for d in assets.glob('*-packed') if d.is_dir() and d != output)
    content = assets.parent / 'content'
    layouts = json.loads((content/'enemy-art-layout.json').read_bytes())
    catalog = json.loads((content/'boss-art-gallery.json').read_bytes())
    variants = {item['file']:item['ordinaryVariant'] for item in catalog['items'] if 'ordinaryVariant' in item}
    index = {}
    for kind in ('character', 'boss'):
        poses = json.loads((assets / f'{kind}-gallery-packed.json').read_bytes())
        for name, pose in poses.items():
            match = next((d / name for d in directories if (d / name).is_file()
                          and json.loads((d / name).read_bytes()) == pose), None)
            if match is None:
                match = output / name
                match.write_bytes(json.dumps(pose, ensure_ascii=False, separators=(',', ':')).encode())
            transfer = {}
            if kind == 'boss' and name in variants:
                species = variants[name]
                base_file = assets/'field-packed'/layouts[species]['file']
                compact = palette_variant(pose, json.loads(base_file.read_bytes()), species)
                if compact is not None:
                    full_size = match.stat().st_size
                    match = assets/'placement-palettes'/name
                    match.parent.mkdir(exist_ok=True)
                    match.write_bytes(json.dumps(compact, ensure_ascii=False, separators=(',', ':')).encode())
                    transfer = {'fullPoseBytes':full_size, 'palettePoseBytes':match.stat().st_size}
            entry = {**transfer, 'poseFile': match.relative_to(assets).as_posix(), 'box': pose['box']}
            assert name not in index or index[name] == entry
            index[name] = entry
    weekly = json.loads((content / 'weekly-boss-spawns.json').read_bytes())['weeklyBosses']
    mechanisms = json.loads((content / 'weekly-opening-parts.json').read_bytes())
    opening_files = {b['openingPose']['file'] for b in weekly if b.get('openingPose')}
    opening_files.update(p['file'] for scene in mechanisms.values() for p in scene['parts'] if p.get('file'))
    for name in sorted(opening_files):
        path = assets / 'weekly-packed' / name
        index['weekly/' + name] = {'poseFile': 'weekly-packed/' + name,
                                  'box': json.loads(path.read_bytes())['box']}
    for scene in json.loads((content / 'stygian-openings.json').read_bytes()).values():
        for part in scene['parts']:
            name = part.get('file')
            if name and name not in index:
                path = assets / 'stygian-packed' / name
                assert path.is_file(), name
                index[name] = {'poseFile': path.relative_to(assets).as_posix(), 'box': part['box']}
    (assets / 'placement-pose-index.json').write_bytes(json.dumps(
        index, ensure_ascii=False, separators=(',', ':')).encode())


if __name__ == '__main__':
    build_placement_pose_index(Path(__file__).resolve().parents[1] / 'assets')
