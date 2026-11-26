"""Load palette-indexed pose grids into the local Lua simulator."""
import base64
import json
from functools import lru_cache, partial


def record_reader(encoded):
    return partial(base64.b64decode, encoded, validate=True)


def read_packed_pose(path, *, defer=False):
    pose = json.loads(path.read_bytes())
    for grid in pose['profiles'].values():
        read = record_reader(grid['data'])
        grid['data'] = read if defer else read()
    return pose


@lru_cache(maxsize=10)
def _shared_pack(path, modified_ns, size):
    # Each session owns its Lua tables. The unchanged source strings can be shared.
    return json.loads(path.read_bytes())


def shared_pack(path):
    stat = path.stat()
    return _shared_pack(path, stat.st_mtime_ns, stat.st_size)


def deferred_grid(lua, prepare, grid):
    metadata = {key: value for key, value in grid.items() if key != 'data'}
    read_records = record_reader(grid['data'])
    return prepare(lua.table_from(metadata, recursive=True), read_records)


def load_pose_pack(lua, root, filename):
    poses = shared_pack(root / 'assets' / filename)
    prepare = lua.execute((root / 'packed-poses.lua').read_text(encoding='utf8'))
    result = {}
    for name, pose in poses.items():
        metadata = {key: value for key, value in pose.items() if key != 'profiles'}
        art = lua.table_from(metadata, recursive=True)
        art.profiles = lua.table()
        for key, grid in pose['profiles'].items():
            art.profiles[key] = deferred_grid(lua, prepare, grid)
        result[name] = art
    return result
