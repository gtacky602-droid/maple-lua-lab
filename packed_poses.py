"""Load palette-indexed pose grids into the local Lua simulator."""
import base64
import json
from functools import lru_cache, partial


def decode_records(pose):
    for grid in pose['profiles'].values():
        grid['data'] = base64.b64decode(grid['data'], validate=True)
    return pose


def read_packed_pose(path):
    return decode_records(json.loads(path.read_bytes()))


@lru_cache(maxsize=2)
def _shared_pack(path, modified_ns, size):
    # Each session owns its Lua tables. The unchanged source strings can be shared.
    return json.loads(path.read_bytes())


def load_pose_pack(lua, root, filename):
    path = root / 'assets' / filename
    stat = path.stat()
    poses = _shared_pack(path, stat.st_mtime_ns, stat.st_size)
    prepare = lua.execute((root / 'packed-poses.lua').read_text(encoding='utf8'))
    result = {}
    for name, pose in poses.items():
        metadata = {key: value for key, value in pose.items() if key != 'profiles'}
        art = lua.table_from(metadata, recursive=True)
        art.profiles = lua.table()
        for key, grid in pose['profiles'].items():
            dimensions = {field: value for field, value in grid.items() if field != 'data'}
            read_records = partial(base64.b64decode, grid['data'], validate=True)
            art.profiles[key] = prepare(lua.table_from(dimensions, recursive=True), read_records)
        result[name] = art
    return result
