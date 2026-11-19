"""Compile the nine poses from the original generated lab sprite sheet."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'branch-legend-poses-source-v1.png'
COLUMNS = [(0, 500), (500, 982), (982, 1536)]
ROWS = [('cineas', 0, 345), ('chizhang-ember', 345, 660), ('chizhang-frost', 660, 1024)]
POSES = [('idle', 100), ('brace', 83), ('strike', 89)]

for name, top, bottom in ROWS:
    for (left, right), (pose, height) in zip(COLUMNS, POSES, strict=True):
        subprocess.run([
            sys.executable, 'compile_boss_assets.py', '--source', SOURCE,
            '--output', f'{name}-field-{pose}-sprites-v1.json',
            '--height', str(height), '--foot-anchor', '--crop',
            *(str(v) for v in (left, top, right-left, bottom-top)),
        ], cwd=ROOT, check=True)
