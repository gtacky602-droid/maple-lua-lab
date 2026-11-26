"""Fit the two shared Fatui idle candidates using their native silhouette and existing budgets."""
import json
from pathlib import Path

from PIL import Image
from fit_field_raster import fit_profile
from palette_rects import pack_grid

assets = Path(__file__).resolve().parents[1] / "assets"
gallery_path = assets / "boss-gallery-packed.json"
gallery = json.loads(gallery_path.read_bytes())
for family in ("frost", "wind"):
    name = f"fatui-{family}-operative-shared-idle-sprites-v2.json"
    path = assets / name
    art = json.loads(path.read_bytes())
    x, y, w, h = art["box"]
    with Image.open(assets / art["source"]) as image:
        sprite = image.crop((x, y, x+w, y+h))
    for key, size in (("h32c16", 16), ("h48c32", 32)):
        budget = len(art["profiles"][key]["runs"])
        art["profiles"][key] = fit_profile(sprite, budget, face_rows=h//3, palette_size=size)
    gallery[name] = {**art, "profiles": {
        key: {**pack_grid(grid), "colors": grid["colors"]}
        for key, grid in art["profiles"].items()
    }}
    path.write_bytes(json.dumps(art, separators=(",", ":"), ensure_ascii=False).encode())
gallery_path.write_bytes(json.dumps(gallery, separators=(",", ":"), ensure_ascii=False).encode()+b"\n")
