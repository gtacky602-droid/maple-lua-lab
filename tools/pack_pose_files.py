import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from palette_rects import pack_grid


def pack_pose_files(assets, out, files, overrides=None, *, archive=None, compact_positions=False):
    out.mkdir(exist_ok=True)
    before = after = 0
    for name in files:
        raw = (assets / name).read_bytes()
        art = json.loads(raw)
        if overrides:
            art.update(overrides.get(name, {}))
        art['profiles'] = {
            key: dict(pack_grid(grid, compact_positions=compact_positions), colors=grid['colors']) for key, grid in art['profiles'].items()
        }
        packed = (json.dumps(art, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
        (out / name).write_bytes(packed)
        before += len(raw)
        after += len(packed)

    if archive is not None:
        write_pose_archive(archive, out, files)
    return before, after


def write_pose_archive(archive, out, files):
    """Store each pose separately so the Lua host can inflate it on first use."""
    with NamedTemporaryFile(dir=archive.parent, delete=False) as temp:
        temp_path = Path(temp.name)
    try:
        with ZipFile(temp_path, 'w') as output:
            for filename in sorted(files):
                entry = ZipInfo(filename, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                raw = (out/filename).read_bytes()
                output.writestr(entry, raw, compress_type=ZIP_DEFLATED, compresslevel=9)
        temp_path.replace(archive)
    finally:
        temp_path.unlink(missing_ok=True)
