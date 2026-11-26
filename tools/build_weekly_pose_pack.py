"""Pack weekly boss poses separately so entering an arena only loads visible poses."""
import argparse
import json
from pathlib import Path
from pack_pose_files import pack_pose_files

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
parser = argparse.ArgumentParser(description='Build the pose files used by the battle renderer.')
parser.add_argument('--field-boss', action='store_true')
kind = 'field-boss' if parser.parse_args().field_boss else 'weekly'
out = assets / f'{kind}-packed'
catalog = json.loads((root / f'content/{kind}-pose-files.json').read_bytes())
if kind == 'field-boss':
    catalog = {key: spec['poses'] for key, spec in catalog.items()}
files = sorted({name for poses in catalog.values() for name in poses.values()})
before, after = pack_pose_files(assets, out, files)
print(f'{len(files)} poses in {len(catalog)} groups: {before} -> {after} bytes')
