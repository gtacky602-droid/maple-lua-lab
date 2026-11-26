"""Build the unique sprite files referenced by ordinary enemies and local legend bodies."""
import json
import sys
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
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
before, after = pack_pose_files(root/'assets', root/'assets/field-packed', sorted(files))
print(f'{len(ordinary)} ordinary entries, {len(legends)} legend bodies, {len(files)} files: {before} -> {after} bytes')

# Each pose can be inflated independently when first requested by the Lua renderer.
archive = root/'assets/field-poses.zip'
with NamedTemporaryFile(dir=archive.parent, delete=False) as temp:
    temp_path = Path(temp.name)
try:
    with ZipFile(temp_path, 'w') as output:
        for filename in sorted(files):
            entry = ZipInfo(filename, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            raw = (root/'assets/field-packed'/filename).read_bytes()
            output.writestr(entry, raw, compress_type=ZIP_DEFLATED, compresslevel=9)
    temp_path.replace(archive)
finally:
    temp_path.unlink(missing_ok=True)
print(f'Lua field archive: {after} -> {archive.stat().st_size} bytes')
