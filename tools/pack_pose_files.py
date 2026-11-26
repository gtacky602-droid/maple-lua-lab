import json
from palette_rects import pack_grid


def pack_pose_files(assets, out, files, overrides=None):
    out.mkdir(exist_ok=True)
    before = after = 0
    for name in files:
        raw = (assets / name).read_bytes()
        art = json.loads(raw)
        if overrides:
            art.update(overrides.get(name, {}))
        art['profiles'] = {
            key: dict(pack_grid(grid), colors=grid['colors']) for key, grid in art['profiles'].items()
        }
        packed = (json.dumps(art, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
        (out / name).write_bytes(packed)
        before += len(raw)
        after += len(packed)
    return before, after
