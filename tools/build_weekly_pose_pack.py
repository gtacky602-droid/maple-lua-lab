"""Pack weekly boss poses separately so entering an arena only loads visible poses."""
import argparse
import json
from pathlib import Path
from pack_pose_files import pack_pose_files

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
parser = argparse.ArgumentParser(description='Build the pose files used by the battle renderer.')
mode = parser.add_mutually_exclusive_group()
mode.add_argument('--field-boss', dest='kind', action='store_const', const='field-boss')
mode.add_argument('--quest', dest='kind', action='store_const', const='quest')
mode.add_argument('--motion', dest='kind', action='store_const', const='motion')
kind = parser.parse_args().kind or 'weekly'
out = assets / f'{kind}-packed'
catalog = json.loads((root / f'content/{kind}-pose-files.json').read_bytes())
if kind == 'field-boss':
    catalog = {key: spec['poses'] for key, spec in catalog.items()}
files = sorted({name for poses in catalog.values()
                for name in ([poses] if isinstance(poses,str) else poses.values())})
before, after = pack_pose_files(assets, out, files, archive=assets/f'{kind}-poses.zip')
if kind == 'quest':
    graph = json.loads((root/'content/story-graph.json').read_bytes())
    clue_keys = {step['teaClue']['art'] for quest in graph['quests'] if quest.get('teaCase')
                 for step in quest['itinerary'] if step.get('teaClue')}
    pictures = {}
    for key in sorted(clue_keys):
        sprite = json.loads((assets/catalog['teaCaseArt'][key]).read_bytes())
        pictures[key] = {field:sprite[field] for field in ('source','box')}
    (root/'content/tea-clue-pictures.json').write_bytes((json.dumps(pictures,indent=2)+'\n').encode())
print(f'{len(files)} poses in {len(catalog)} groups: {before} -> {after} bytes')
