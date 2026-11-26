from pathlib import Path
import sys
from pack_pose_files import pack_pose_files

root = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from stygian_art import stygian_parts, stygian_overrides

def filenames(node):
    for value in node.values():
        if isinstance(value,str):
            yield value
        else:
            yield from filenames(value)

files = sorted(set(filenames(stygian_parts(root))))
before,after = pack_pose_files(root/'assets',root/'assets/stygian-packed',files,stygian_overrides(root), archive=root/'assets/stygian-poses.zip')
print(f'{len(files)} dedicated parts: {before} -> {after} bytes')
