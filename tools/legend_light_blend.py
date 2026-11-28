"""Reduce 16-color draw rectangles in the densest local-legend formations."""
from collections import Counter
from itertools import groupby


BODIES = {
    'chizhang-ember': 3,
    'chizhang-frost': 3,
    'legend-tristars-cryo': 1,
    'legend-tristars-electro': 1,
    'legend-tristars-pyro': 1,
    'legend-rowdy-root': 1,
    'legend-rowdy-long-ear': 1,
    'legend-rowdy-guard': 1,
}
FILES = {
    f'{body}-field-{pose}-sprites-v{version}.json'
    for body, version in BODIES.items()
    for pose in ('idle', 'brace', 'strike')
}
RGB_DISTANCE = 36


def rasterize(grid):
    rows = [[None] * grid['width'] for _ in range(grid['height'])]
    for x, y, width, height, color in grid['runs']:
        for row in rows[y:y + height]:
            row[x:x + width] = [color] * width
    return rows


def merge_runs(rows):
    runs = []
    previous = {}
    for y, row in enumerate(rows):
        current = {}
        x = 0
        for color, segment in groupby(row):
            width = sum(1 for _ in segment)
            if color is not None:
                key = (x, width, color)
                run = previous.get(key)
                if run is None:
                    run = [x, y, width, 0, color]
                    runs.append(run)
                run[3] += 1
                current[key] = run
            x += width
        previous = current
    return runs


def refine_legend_profiles(name, art):
    if name not in FILES:
        return art
    profiles = art['profiles']
    light = profiles['h32c16']
    original = rasterize(light)
    rows = [row[:] for row in original]
    protected = set(art.get('reserved_colors', ()))
    palette = {color: bytes.fromhex(color[1:]) for *_, color in light['runs']}
    similar = {
        color: {shade for shade, channels in palette.items()
                if sum((a - b) ** 2 for a, b in zip(rgb, channels)) <= RGB_DISTANCE ** 2}
        for color, rgb in palette.items()
    }
    width, height = light['width'], light['height']
    for _ in range(2):
        for y, row in enumerate(rows):
            for x, color in enumerate(row):
                source = original[y][x]
                if source is None or source in protected:
                    continue
                adjacent = ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                counts = Counter(rows[yy][xx] for xx, yy in adjacent if 0 <= xx < width and 0 <= yy < height)
                # Compare to the first-pass input on every pass so similar colors cannot drift.
                for shade, neighbors in counts.most_common():
                    if shade in similar[source] and neighbors >= max(2, counts[color] + 1):
                        row[x] = shade
                        break

    runs = merge_runs(rows)
    if len(runs) >= len(light['runs']):
        return art
    return {**art, 'profiles': {**profiles, 'h32c16': {**light, 'runs': runs}}}
