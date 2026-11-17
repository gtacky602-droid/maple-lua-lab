"""Rebuild the Dvalin profiles from the retained, normalized transparent atlases."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
audit = json.loads((ROOT / 'evidence/dvalin-weekly-art-audit.json').read_text(encoding='utf8'))
for name in ('dvalin-weekly-body-source-v1.png', 'dvalin-weekly-parts-source-v1.png'):
    actual = hashlib.sha256((ROOT / 'assets' / name).read_bytes()).hexdigest()
    if actual != audit['outputs'][name]:
        raise ValueError(f'Atlas differs from the recorded source: {name}')

for pose, row in audit['poses'].items():
    source = 'parts' if pose in ('claw', 'head', 'crystal', 'orb') else 'body'
    subprocess.run([
        sys.executable, str(ROOT / 'compile_boss_assets.py'),
        '--source', f'dvalin-weekly-{source}-source-v1.png',
        '--output', f'dvalin-weekly-{pose}-sprites-v1.json',
        '--height', str(row['height']), '--anchor-x', str(row['anchor']),
        '--crop', *map(str, row['crop']),
        '--accent-color', '#51ddda', '--accent-color', '#c775f1',
    ], cwd=ROOT, check=True)
