"""Pack weekly boss poses separately so entering an arena only loads visible poses."""
import json
from pathlib import Path
from pack_pose_files import pack_pose_files

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
out = assets / 'weekly-packed'
catalog = json.loads((root / 'content/weekly-pose-files.json').read_bytes())
files = sorted({name for poses in catalog.values() for name in poses.values()})
before, after = pack_pose_files(assets, out, files)
print(f'{len(files)} poses in {len(catalog)} groups: {before} -> {after} bytes')
