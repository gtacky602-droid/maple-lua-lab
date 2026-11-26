"""Fit a field-scale transparent PNG to a 16-color rectangle profile.

Input is a tightly framed, pixel-aligned reference at the intended gameplay size.
The output uses the source grid format consumed by pack_pose_files.py.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def fit_profile(image, budget, face_rows=0):
    rgba = np.asarray(image.convert("RGBA"))
    pixels = rgba[:, :, :3].astype(float)
    visible = rgba[:, :, 3] >= 128
    if not visible.any() or budget < 1:
        raise ValueError("A visible sprite and positive rectangle budget are required")
    samples = rgba[:, :, :3][visible][:, None, :]
    quantized = Image.fromarray(samples).quantize(16)
    palette = np.array(quantized.getpalette()[:48]).reshape(-1, 3)
    colors = ["#%02x%02x%02x" % tuple(channels) for channels in palette]
    indices = np.abs(pixels[:, :, None, :] - palette).sum(axis=3).argmin(axis=2)
    indices[~visible] = -1
    runs = []
    previous = {}
    for y, row in enumerate(indices):
        current = {}
        x = 0
        while x < image.width:
            color = row[x]
            end = x + 1
            while end < image.width and row[end] == color:
                end += 1
            if color >= 0:
                key = (x, end, color)
                if key in previous:
                    rect = previous[key]
                    rect[3] += 1
                else:
                    rect = [x, y, end - x, 1, color]
                    runs.append(rect)
                current[key] = rect
            x = end
        previous = current

    while len(runs) > budget:
        left = {(x, y, h): i for i, (x, y, w, h, _) in enumerate(runs)}
        top = {(x, y, w): i for i, (x, y, w, h, _) in enumerate(runs)}
        best = None
        for i, (x, y, w, h, _) in enumerate(runs):
            for j in (left.get((x + w, y, h)), top.get((x, y + h, w))):
                if j is None:
                    continue
                for source, dest in ((i, j), (j, i)):
                    sx, sy, sw, sh, old = runs[source]
                    new = runs[dest][4]
                    patch = pixels[sy:sy + sh, sx:sx + sw]
                    loss = (np.abs(patch - palette[new]) - np.abs(patch - palette[old])).sum()
                    if sy < face_rows and loss > 0:
                        loss *= 3
                    candidate = (loss, i, j, colors[new], new)
                    if best is None or candidate < best:
                        best = candidate
        if best is None:
            raise ValueError(f"Cannot merge the remaining {len(runs)} rectangles within this silhouette")
        _, i, j, _, new = best
        x, y, w, h, _ = runs[i]
        xx, yy, ww, hh, _ = runs[j]
        runs[i] = [x, y, max(x + w, xx + ww) - x, max(y + h, yy + hh) - y, new]
        del runs[j]
    return dict(width=image.width, height=image.height, colors=len({colors[r[4]] for r in runs}),
                runs=[[x, y, w, h, colors[c]] for x, y, w, h, c in runs])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png", type=Path)
    parser.add_argument("budget", type=int)
    parser.add_argument("output", type=Path)
    parser.add_argument("--face-rows", type=int, default=0,
                        help="Give positive color errors in the top N rows triple weight")
    args = parser.parse_args()
    with Image.open(args.png) as image:
        grid = fit_profile(image, args.budget, args.face_rows)
    args.output.write_text(json.dumps(grid, separators=(",", ":")), encoding="utf8")
