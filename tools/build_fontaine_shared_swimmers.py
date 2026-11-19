"""Encode four waiting sprites from two shared outlines for the art galleries."""

from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageColor

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
STUDIES = (
    (
        "hunters-ray",
        74,
        (
            "#222431 #474629 #5b5e30 #6d6b29 #81832a #98982d #b9aa27 "
            "#d0dc4b #e3e681 #efd672 #f6e5af #fcecc7"
        ),
        (
            "#241b31 #382844 #4c3055 #65345d #854369 #a75479 #c86890 "
            "#eb8eb5 #f5afcc #d98eb1 #f7c4de #ffe7ec"
        ),
    ),
    (
        "blubberbeast",
        82,
        (
            "#1a2039 #283654 #435476 #627493 #778ca4 #91adba "
            "#b6cbcd #bdc2ba #eee7da #faf7ee #e4b671 #f7dca4"
        ),
        (
            "#252143 #3d355e #605286 #7a6ca6 #9486ba #ada1c9 "
            "#cbc0da #cdc5cd #f1e9e0 #faf7f1 #5c4b83 #927baa"
        ),
    ),
)


def build_study(name, height, ordinary_colors, legend_colors):
    source = Image.open(ASSETS / f"{name}-generated-v2.png").convert("RGBA")
    mask = source.getchannel("A").point(lambda alpha: 255 if alpha >= 128 else 0)
    body = source.crop(mask.getbbox())
    body = body.resize((round(body.width * height / body.height), height), Image.Resampling.NEAREST)

    ordinary = [ImageColor.getrgb(color) for color in ordinary_colors.split()]
    legend = [ImageColor.getrgb(color) for color in legend_colors.split()]
    assert len(ordinary) == len(legend)
    # Reserve index zero for transparency. Both palettes use this exact pixel index map.
    indices = Image.new("P", body.size)
    def palette_index(pixel):
        if pixel[3] < 128:
            return 0
        _, index = min(
            (sum((a - b) ** 2 for a, b in zip(pixel[:3], rgb)), index)
            for index, rgb in enumerate(ordinary, start=1)
        )
        return index

    indices.putdata([palette_index(pixel) for pixel in body.getdata()])
    for builder_name, palette in [(name, ordinary), (f"legend-{name}", legend)]:
        png_name = f"{builder_name}-shared-idle-source-v1.png"
        indices.putpalette([0, 0, 0] + [channel for rgb in palette for channel in rgb])
        indices.info["transparency"] = 0
        indices.convert("RGBA").save(ASSETS / png_name, optimize=True)
        subprocess.run([
            sys.executable, str(ROOT / "compile_boss_assets.py"),
            "--source", png_name,
            "--output", f"{builder_name}-shared-idle-sprites-v1.json",
            "--height", str(height),
        ], cwd=ROOT, check=True)


if __name__ == "__main__":
    for study in STUDIES:
        build_study(*study)
