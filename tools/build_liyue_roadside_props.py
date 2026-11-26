"""Bake existing 16-color quest props into a small transparent host-scenery atlas."""
import json
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parents[1] / "assets"
names = ["ina-tea-case-cart", "mond-return-box-crate", "sum-wanderer-sign-sign"]
tiles = []
for name in names:
    profile = json.loads((assets / f"{name}-sprites-v1.json").read_bytes())["profiles"]["h32c16"]
    tile = Image.new("RGBA", (profile["width"], profile["height"]))
    for x, y, w, h, color in profile["runs"]:
        tile.paste(color, (x, y, x + w, y + h))
    tiles.append(tile)

atlas = Image.new("RGBA", (sum(t.width for t in tiles), max(t.height for t in tiles)))
left = 0
for tile in tiles:
    atlas.paste(tile, (left, 0))
    left += tile.width
colors = sorted(set(atlas.get_flattened_data()))
indices = {color: index for index, color in enumerate(colors)}
indexed = Image.new("P", atlas.size)
indexed.putpalette(bytes(channel for color in colors for channel in color[:3]))
indexed.putdata([indices[pixel] for pixel in atlas.get_flattened_data()])
out = assets / "liyue-roadside-props.png"
indexed.save(out, transparency=indices[(0, 0, 0, 0)], optimize=True)
with Image.open(out) as check:
    assert check.convert("RGBA").tobytes() == atlas.tobytes()
