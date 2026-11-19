"""Compile anchored field-legend poses from the original generated sprite sheets."""
import json
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

PIVOT_LAYOUTS = {
    'legend-poses-v2-layout.json': 2,
    'fontaine-dry-legend-poses-v1-layout.json': 1,
    'fontaine-lake-legend-poses-v3-layout.json': 3,
    'fontaine-lake-legend-poses-v4-layout.json': 4,
    'fontaine-lake-legend-poses-v6-layout.json': 6,
    'fontaine-lake-legend-idle-studies-v5-layout.json': 5,
    'fontaine-ocean-judge-poses-v1-layout.json': 1,
    'fontaine-iron-viscount-poses-v1-layout.json': 1,
    'fontaine-ray-pair-poses-v1-layout.json': 1,
    'fontaine-echo-poses-v1-layout.json': 1,
    'fontaine-bubble-poses-v1-layout.json': 1,
    'fontaine-corrouge-poses-v1-layout.json': 1,
    'natlan-first-legend-poses-v1-layout.json': 1,
    'natlan-toyac-legend-poses-v1-layout.json': 1,
    'natlan-night-trial-poses-v1-layout.json': 1,
    'natlan-north-trial-poses-v1-layout.json': 1,
    'natlan-cliff-trial-poses-v1-layout.json': 1,
    'natlan-northwest-legend-poses-v1-layout.json': 1,
}
for layout_name, revision in PIVOT_LAYOUTS.items():
    layout = json.loads((ROOT/'assets'/layout_name).read_text(encoding='utf-8'))
    for frame in layout['frames']:
        crop, pivot = frame['crop'], frame['pivot']
        height = pivot[1] - frame['opaque_box'][1]
        subprocess.run([
            sys.executable, 'compile_boss_assets.py', '--source', layout['source'],
            '--output', f"{frame['id']}-field-{frame['pose']}-sprites-v{revision}.json",
            '--height', str(height), '--pivot', *(str(v) for v in pivot),
            '--crop', *(str(v) for v in crop),
        ], cwd=ROOT, check=True)
