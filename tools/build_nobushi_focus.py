"""Fit the Nobushi idle silhouette at field size within the existing compressed rectangle budgets."""
import json
from pathlib import Path

from PIL import Image
from fit_field_raster import fit_profile

assets = Path(__file__).resolve().parents[1] / "assets"
path = assets / "nobushi-idle-sprites.json"
art = json.loads(path.read_bytes())
x, y, w, h = art["box"]
height = 104
with Image.open(assets / art["source"]) as image:
    sprite = image.crop((x, y, x+w, y+h)).resize((round(w*height/h), height), Image.Resampling.NEAREST)
art["profiles"]["h48c32"] = fit_profile(sprite, 958, face_rows=40, palette_size=32)
art["profiles"]["h32c16"] = fit_profile(sprite, 435, face_rows=40)
path.write_bytes(json.dumps(art, ensure_ascii=False, separators=(",", ":")).encode())
