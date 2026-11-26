"""Build the unique sprite files referenced by ordinary enemies and local legend bodies."""
import json
import sys
from pathlib import Path
from pack_pose_files import pack_pose_files

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from field_pose_files import enemy_pose_files, legend_pose_files

def read(name):
    return json.loads((root/'content'/name).read_bytes())

ordinary = enemy_pose_files(read('enemy-art-layout.json'))
legends = legend_pose_files(read('field-boss-spawns.json')['fieldBosses'])
files = set(ordinary.values()).union(*(poses.values() for poses in legends.values()))
before, after = pack_pose_files(root/'assets', root/'assets/field-packed', sorted(files), archive=root/'assets/field-poses.zip')
print(f'{len(ordinary)} ordinary entries, {len(legends)} legend bodies, {len(files)} files: {before} -> {after} bytes')
