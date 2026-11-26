"""Check deferred decoding, exact rectangles and session isolation for both shared art packs."""
import base64
import json
from unittest.mock import patch

from packed_pose_test_support import pose_check
from runtime import ROOT, LuaRuntime, load_pose_pack


decode_source = base64.b64decode
for filename in ('common-boss-packed.json', 'character-gallery-packed.json'):
    lua = LuaRuntime(unpack_returned_tuples=True)
    other = LuaRuntime(unpack_returned_tuples=True)
    check = pose_check(lua)
    source = json.loads((ROOT / 'assets' / filename).read_bytes())
    with patch('packed_poses.base64.b64decode', wraps=base64.b64decode) as decode:
        poses = load_pose_pack(lua, ROOT, filename)
        second = load_pose_pack(other, ROOT, filename)
        assert decode.call_count == 0
        profiles = 0
        total_bytes = 0
        for name, art in poses.items():
            original = json.loads((ROOT / 'assets' / name).read_bytes())
            assert art.source == second[name].source
            check(art, lua.table_from(original, recursive=True))
            for key, grid in source[name]['profiles'].items():
                assert other.eval('rawget')(second[name].profiles[key], 'runs') is None
                total_bytes += len(decode_source(grid['data']))
                profiles += 1
        assert decode.call_count == profiles
        print(f'{filename}: {len(poses)} poses, {profiles} exact grids, {total_bytes} bytes deferred.')
