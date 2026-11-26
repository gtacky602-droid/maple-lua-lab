"""Fit a field-scale transparent PNG to a 16-color rectangle profile.

Input is a tightly framed, pixel-aligned reference at the intended gameplay size.
The output uses the source grid format consumed by pack_pose_files.py.
"""
import argparse
import heapq
import json
from pathlib import Path

import numpy as np
from PIL import Image


def fit_profile(image, budget, face_rows=0, detail_boxes=(), palette_size=16, reserved_colors=()):
    rgba = np.asarray(image.convert("RGBA"))
    pixels = rgba[:, :, :3].astype(float)
    visible = rgba[:, :, 3] >= 128
    if not visible.any() or budget < 1:
        raise ValueError("A visible sprite and positive rectangle budget are required")
    samples = rgba[:, :, :3][visible][:, None, :]
    adaptive_colors = palette_size - len(reserved_colors)
    if adaptive_colors < 1:
        raise ValueError("Reserve fewer colors than the palette size")
    quantized = Image.fromarray(samples).quantize(adaptive_colors)
    palette = np.array(quantized.getpalette()[:3 * adaptive_colors]).reshape(-1, 3)
    if reserved_colors:
        palette = np.vstack((palette, reserved_colors))
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

    weights = None
    if detail_boxes:
        weights = np.ones(visible.shape, dtype=float)
        for x, y, width, height in detail_boxes:
            if min(x, y) < 0 or min(width, height) < 1 or x+width > image.width or y+height > image.height:
                raise ValueError("Detail box must fit inside the input raster")
            weights[y:y+height, x:x+width] = 12
    runs = merge_neighbors(runs, pixels, palette, colors, budget, face_rows, weights)
    return dict(width=image.width, height=image.height, colors=len({colors[r[4]] for r in runs}),
                runs=[[x, y, w, h, colors[c]] for x, y, w, h, c in runs])


def merge_neighbors(runs, pixels, palette, colors, budget, face_rows, weights=None):
    if len(runs) <= budget:
        return runs
    active = dict(enumerate(runs))
    revision = [0] * len(runs)
    edges = [{} for _ in range(4)]
    heap = []

    def keys(rect):
        x, y, w, h, _ = rect
        return ((x, y, h), (x+w, y, h), (x, y, w), (x, y+h, w))

    def enqueue(i, j):
        for source, dest in ((i, j), (j, i)):
            x, y, w, h, old = active[source]
            new = active[dest][4]
            patch = pixels[y:y+h, x:x+w]
            difference = np.abs(patch - palette[new]) - np.abs(patch - palette[old])
            if weights is not None:
                difference *= weights[y:y+h, x:x+w, None]
            loss = difference.sum()
            if y < face_rows and loss > 0:
                loss *= 3
            heapq.heappush(heap, (loss, i, j, colors[new], new, revision[i], revision[j]))

    def insert(i):
        for side, key in enumerate(keys(active[i])):
            edges[side][key] = i
            neighbor = edges[side ^ 1].get(key)
            if neighbor is not None:
                if side in (0, 2):
                    enqueue(neighbor, i)
                else:
                    enqueue(i, neighbor)

    for i in active:
        insert(i)
    while len(active) > budget:
        while heap:
            _, i, j, _, new, ri, rj = heapq.heappop(heap)
            if revision[i] == ri and revision[j] == rj:
                break
        else:
            raise ValueError(f"Cannot merge the remaining {len(active)} rectangles within this silhouette")
        for index in (i, j):
            for side, key in enumerate(keys(active[index])):
                del edges[side][key]
            revision[index] += 1
        x, y, w, h, _ = active[i]
        xx, yy, ww, hh, _ = active.pop(j)
        active[i] = [x, y, max(x+w, xx+ww)-x, max(y+h, yy+hh)-y, new]
        insert(i)
    return list(active.values())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png", type=Path)
    parser.add_argument("budget", type=int)
    parser.add_argument("output", type=Path)
    parser.add_argument("--face-rows", type=int, default=0,
                        help="Give positive color errors in the top N rows triple weight")
    parser.add_argument("--detail-box", nargs=4, type=int, action="append", metavar=("X", "Y", "W", "H"),
                        help="Give color differences inside this detail twelve times the weight (repeatable)")
    args = parser.parse_args()
    with Image.open(args.png) as image:
        grid = fit_profile(image, args.budget, args.face_rows, args.detail_box)
    args.output.write_text(json.dumps(grid, separators=(",", ":")), encoding="utf8")
