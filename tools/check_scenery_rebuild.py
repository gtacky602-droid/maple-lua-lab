"""Rebuild scenery with only the files needed from a fresh checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(group, workspace):
    assets = workspace / 'assets'
    manifest = f'{group}-background-generation.json'
    shutil.copyfile(ROOT / 'assets' / manifest, assets / manifest)
    scenes = json.loads((assets / manifest).read_text('utf8'))['scenes']
    outputs = [Path('assets') / f'{group}-native-backgrounds.lua',
               Path('evidence') / f'{group}-background-compression.json']
    for scene in scenes:
        shutil.copyfile(ROOT / 'assets' / scene['source'], assets / scene['source'])
        preview = scene['preview']
        outputs.extend([Path('assets') / preview, Path('assets') / preview.replace('preview-v1.png', 'tiers-v1.webp')])
    subprocess.run([sys.executable, '-X', 'utf8', 'tools/build_scenery_batch.py', group], cwd=workspace, check=True)
    for path in outputs:
        if digest(workspace / path) != digest(ROOT / path):
            raise ValueError(f'Rebuilt file differs from the checked-in output: {path}')
    return {'filesCompared': len(outputs), 'bundleSha256': digest(workspace / outputs[0])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('groups', nargs='+', help='Manifest prefix, for example sum-frontier')
    parser.add_argument('--output', type=Path, help='Optional report of verified bundle hashes')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='maple-scenery-rebuild-') as directory:
        workspace = Path(directory)
        for folder in ('tools', 'assets', 'evidence'):
            (workspace / folder).mkdir()
        for module in ('build_scenery_batch.py', 'scenery_encoding.py', 'scenery_fitting.py'):
            shutil.copyfile(ROOT / 'tools' / module, workspace / 'tools' / module)
        shutil.copyfile(ROOT / 'assets/MapleCodec.lua', workspace / 'assets/MapleCodec.lua')
        report = {group: check(group, workspace) for group in args.groups}
    result = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.write_text(result, 'utf8')
    print(result, end='')
