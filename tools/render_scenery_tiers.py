"""Render the comparison images from a packed scenery Lua table using MapleCodec.lua."""
import argparse
from pathlib import Path

from lupa.lua53 import LuaRuntime
from PIL import Image, ImageDraw


def export(codec, bundle, destination):
    lua = LuaRuntime(encoding=None)
    ctx = lua.table()
    lua.execute(codec.read_bytes())(ctx)
    scenes = lua.execute(bundle.read_bytes())
    destination.mkdir(parents=True, exist_ok=True)
    for profile_id, (filename, scene) in enumerate(scenes.items(), start=1):
        stem = filename.decode().removesuffix("-background-v1.png")
        ctx[b"profiles"][profile_id] = scene[b"base"]
        ctx[b"scenerySplits"][filename] = scene[b"details"]
        runs = ctx[b"refinedScenery"](filename, ctx[b"profile"](profile_id))[b"runs"]
        if len(runs) != 6144 or scene[b"count"] != 2048:
            raise ValueError(f"{stem} needs 4,096 base rectangles and 2,048 detail rectangles")
        canvas = Image.new("RGB", (512, 288))
        draw = ImageDraw.Draw(canvas)
        sheet = Image.new("RGB", (1024, 576))
        for index in range(1, len(runs) + 1):
            rect = runs[index]
            x, y, w, h, color = (rect[i] for i in range(1, 6))
            draw.rectangle((x, y, x + w - 1, y + h - 1), fill=color.decode())
            if index in (4096, 4608, 5120, 5632):
                tile = (index - 4096) // 512
                sheet.paste(canvas, ((tile % 2) * 512, (tile // 2) * 288))
        sheet.save(destination / f"{stem}-native-tiers-v1.webp", lossless=True, method=6)
        canvas.save(destination / f"{stem}-native-preview-v1.png", optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("codec", type=Path)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    export(args.codec, args.bundle, args.destination)
