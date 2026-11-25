"""Fit the 4096-rectangle base and spend the refinement budget on visible color error."""

import heapq
import zlib

import numpy as np
from PIL import Image
import zopfli.zlib

from scenery_encoding import HEIGHTS, WIDTHS, pack_tree, var


def fit_base(path):
    count = 4096
    with Image.open(path) as source:
        target = np.asarray(
            source.convert("RGB").resize((512, 288), Image.Resampling.BOX), dtype=float
        )
    integral = np.pad(target.cumsum(0).cumsum(1), ((1, 0), (1, 0), (0, 0)))

    def total(x, y, w, h):
        return (
            integral[y + h, x + w]
            - integral[y, x + w]
            - integral[y + h, x]
            + integral[y, x]
        )

    root = (0, 0, 512, 288)

    def candidate(box):
        x, y, w, h = box
        area = w * h
        best = -1
        children = ()
        sums = total(*box)
        for axis, n in enumerate((w, h)):
            if n <= 1:
                continue
            cuts = np.arange(1, n)
            sizes = cuts * (h if axis == 0 else w)
            left = total(x, y, cuts, h) if axis == 0 else total(x, y, w, cuts)
            diff = left - (sizes / area)[:, None] * sums
            gain = (diff * diff).sum(axis=1) * area / (sizes * (area - sizes))
            k = int(gain.argmax())
            if gain[k] > best:
                best = gain[k]
                offset = k + 1
                children = (
                    ((x, y, offset, h), (x + offset, y, w - offset, h))
                    if axis == 0
                    else ((x, y, w, offset), (x, y + offset, w, h - offset))
                )
        return -best, box, children

    def render(leaves):
        image = np.zeros_like(target, dtype="uint8")
        for x, y, w, h in leaves:
            image[y : y + h, x : x + w] = np.rint(total(x, y, w, h) / (w * h)).astype(
                "uint8"
            )
        return image

    parents = {}
    branches = {}
    benefits = {}
    active = {root}
    growth = [candidate(root)]
    while len(active) < count * 3:
        cost, box, children = heapq.heappop(growth)
        assert children
        benefits[box] = -cost
        branches[box] = children
        active.remove(box)
        for child in children:
            parents[child] = box
            active.add(child)
            heapq.heappush(growth, candidate(child))

    def removable(box):
        return all(child in active for child in branches[box])

    pruning = [(benefits[box], box) for box in branches if removable(box)]
    heapq.heapify(pruning)
    while len(active) > count:
        _, box = heapq.heappop(pruning)
        active.difference_update(branches[box])
        active.add(box)
        parent = parents.get(box)
        if parent and removable(parent):
            heapq.heappush(pruning, (benefits[parent], parent))
    after = render(active)
    # The stage decoder consumes splits in preorder and colors in leaf order.
    tree = bytearray()
    colors = []

    def emit(box):
        x, y, w, h = box
        if box in active:
            tree.append(0)
            colors.append(after[y, x])
        else:
            left, right = branches[box]
            axis = int(left[2] == w)
            tree.extend(var(2 * left[2 + axis] + axis))
            emit(left)
            emit(right)

    emit(root)
    planes = np.asarray(colors).T.copy()
    planes[0] -= planes[1]
    planes[2] -= planes[1]
    planes[:, 1:] -= planes[:, :-1]
    raw = pack_tree(tree + planes.tobytes())
    quick = zlib.compress(raw, 9, wbits=-15)
    compact = zopfli.zlib.compress(raw, numiterations=8)[2:-4]
    # The native encoder compares padded base85 lengths and keeps the first tie.
    stream = min((quick, compact), key=lambda data: (len(data) + 3) // 4)
    return target.astype("uint8"), after, stream


sizes = [
    (w, h)
    for w in WIDTHS
    for h in HEIGHTS
    if 2 <= w * h <= 384 and max(w, h) <= 12 * min(w, h)
]


def integral(a):
    return np.pad(
        a.cumsum(0, dtype=np.int64).cumsum(1, dtype=np.int64),
        [(1, 0), (1, 0)] + ([(0, 0)] if a.ndim == 3 else []),
    )


def windows(s, w, h):
    return s[h:, w:] - s[h:, :-w] - s[:-h, w:] + s[:-h, :-w]


def paint(target, base, budget=2048):
    t = target.astype(np.int32)
    dst = base.astype(np.int32)
    sums = integral(t)
    squares = integral((t * t).sum(2))
    candidates = {}
    for w, h in sizes:
        rgb = windows(sums, w, h)
        c = np.rint(rgb / (w * h)).astype(np.int32)
        err = (windows(squares, w, h) + (w * h * c * c - 2 * c * rgb).sum(2)).astype(
            np.int32
        )
        candidates[w, h] = (err, c.astype(np.uint8))
    patches = []
    while len(patches) < budget:
        before = len(patches)
        previous = integral(np.square(t - dst).sum(2))
        queue = []
        for (w, h), (cost, _) in candidates.items():
            gain = (windows(previous, w, h) - cost).ravel()
            k = min(1024, len(gain))
            ids = np.argpartition(gain, -k)[-k:]
            queue.extend((int(gain[i]), w, h, int(i)) for i in ids if gain[i] > 0)
        occupied = np.zeros(base.shape[:2], bool)
        for gain, w, h, i in sorted(queue, reverse=True):
            y, x = divmod(i, base.shape[1] - w + 1)
            mask = occupied[y : y + h, x : x + w]
            if mask.any():
                continue
            mask[:] = True
            rgb = candidates[w, h][1][y, x]
            dst[y : y + h, x : x + w] = rgb
            patches.append((x, y, w, h, *rgb.tolist()))
            if len(patches) == budget or len(patches) - before == 256:
                break
        if len(patches) == before:
            break
    return dst.astype(np.uint8), patches
