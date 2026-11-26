"""Fit the Hilichurl mask and body to the existing budgets at field height."""
import json
from pathlib import Path

from PIL import Image
from fit_field_raster import fit_profile

assets = Path(__file__).resolve().parents[1] / "assets"
path = assets / "hilichurl-idle-sprites.json"
art = json.loads(path.read_bytes())
x, y, width, height = art["box"]
with Image.open(assets / art["source"]) as source:
    scale = 76 / height
    left = -width * scale * art["anchorX"]
    offset = round(left) - left
    # Sample the PNG at the screen pixel centers used by the integer foot anchor.
    pixels = source.transform((42, 76), Image.Transform.AFFINE,
                              (1/scale, 0, x+offset/scale, 0, 1/scale, y),
                              Image.Resampling.NEAREST)
for key, budget, colors in (("h48c32", 692, 32), ("h32c16", 280, 16)):
    art["profiles"][key] = fit_profile(
        pixels, budget, palette_size=colors, detail_boxes=[(27, 19, 12, 14)],
        reserved_colors=[(206, 108, 42)],
    )
    # A finer horizontal grid places rectangle boundaries back on those screen pixels.
    grid = art["profiles"][key]
    grid["width"] = 125
    def boundary(column):
        return min(125, max(0, round((column+offset)*125/(width*scale))))
    for rect in grid["runs"]:
        start, end = boundary(rect[0]), boundary(rect[0]+rect[2])
        rect[0], rect[2] = start, end-start
path.write_bytes(json.dumps(art, ensure_ascii=False, separators=(",", ":")).encode())
