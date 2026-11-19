"""Compile anchored field-legend poses from the original generated sprite sheets."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SHEETS = {
    'branch-legend-poses-source-v1.png': (
        [(0, 500), (500, 982), (982, 1536)],
        [('cineas', 0, 345, (100,83,89)), ('chizhang-ember', 345, 660, (100,83,89)),
         ('chizhang-frost', 660, 1024, (100,83,89))],
    ),
    'fontaine-lake-legend-poses-source-v1.png': (
        [(0, 500), (500, 984), (984, 1536)],
        [('lake-vivianne', 0, 518, (102,78,106)), ('lake-ninianne', 518, 1024, (92,73,112))],
    ),
}
POSES = ('idle', 'brace', 'strike')

for source, (columns, rows) in SHEETS.items():
    for name, top, bottom, heights in rows:
        for (left, right), pose, height in zip(columns, POSES, heights, strict=True):
            subprocess.run([
                sys.executable, 'compile_boss_assets.py', '--source', source,
                '--output', f'{name}-field-{pose}-sprites-v1.json',
                '--height', str(height), '--foot-anchor', '--crop',
                *(str(v) for v in (left, top, right-left, bottom-top)),
            ], cwd=ROOT, check=True)
