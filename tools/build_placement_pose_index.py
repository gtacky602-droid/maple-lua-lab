"""Reuse individually packed poses, writing only gallery poses without an exact match."""
import json
from pathlib import Path

def build_placement_pose_index(assets):
    output = assets / 'placement-packed'
    output.mkdir(exist_ok=True)
    directories = sorted(d for d in assets.glob('*-packed') if d.is_dir() and d != output)
    index = {}
    for kind in ('character', 'boss'):
        poses = json.loads((assets / f'{kind}-gallery-packed.json').read_bytes())
        for name, pose in poses.items():
            match = next((d / name for d in directories if (d / name).is_file()
                          and json.loads((d / name).read_bytes()) == pose), None)
            if match is None:
                match = output / name
                match.write_bytes(json.dumps(pose, ensure_ascii=False, separators=(',', ':')).encode())
            entry = {'poseFile': match.relative_to(assets).as_posix(), 'box': pose['box']}
            assert name not in index or index[name] == entry
            index[name] = entry
    content = assets.parent / 'content'
    weekly = json.loads((content / 'weekly-boss-spawns.json').read_bytes())['weeklyBosses']
    mechanisms = json.loads((content / 'weekly-opening-parts.json').read_bytes())
    opening_files = {b['openingPose']['file'] for b in weekly if b.get('openingPose')}
    opening_files.update(p['file'] for scene in mechanisms.values() for p in scene['parts'] if p.get('file'))
    for name in sorted(opening_files):
        path = assets / 'weekly-packed' / name
        index['weekly/' + name] = {'poseFile': 'weekly-packed/' + name,
                                  'box': json.loads(path.read_bytes())['box']}
    (assets / 'placement-pose-index.json').write_bytes(json.dumps(
        index, ensure_ascii=False, separators=(',', ':')).encode())


if __name__ == '__main__':
    build_placement_pose_index(Path(__file__).resolve().parents[1] / 'assets')
