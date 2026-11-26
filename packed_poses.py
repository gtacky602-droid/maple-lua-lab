"""Load palette-indexed pose grids into the local Lua simulator."""
import base64
import json


def load_pose_pack(lua, root, filename):
    poses = json.loads((root / 'assets' / filename).read_bytes())
    prepare = lua.execute((root / 'packed-poses.lua').read_text(encoding='utf8'))
    result = {}
    for name, pose in poses.items():
        profiles = pose.pop('profiles')
        art = lua.table_from(pose, recursive=True)
        art.profiles = lua.table()
        for key, grid in profiles.items():
            records = base64.b64decode(grid.pop('data'), validate=True)
            art.profiles[key] = prepare(lua.table_from(grid, recursive=True), records)
        result[name] = art
    return result
