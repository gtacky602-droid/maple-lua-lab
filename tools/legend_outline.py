"""Spend the existing 16-color rectangle budget on thin sprite edges."""
from PIL import Image

from tools.legend_light_blend import blend_shades, merge_runs, palette_for, rasterize


BODIES = ('calamitous-tree', 'potapo', 'ichcahuipilli', 'churldric', 'furiosa')
FILES = {f'legend-{body}-field-{pose}-sprites-v1.json'
         for body in BODIES for pose in ('idle', 'brace', 'strike')}
COLOR_ERROR_MARGIN = 0.8
NEAREST = Image.Resampling.NEAREST


def source_crop(assets, art):
    x, y, width, height = art['box']
    with Image.open(assets / art['source']) as image:
        return image.crop((x, y, x + width, y + height)).convert('RGBA')


def rgba_pixels(image):
    values = iter(image.tobytes())
    return zip(values, values, values, values)


def compare_raster(rows, source, palette):
    image = Image.new('RGBA', (len(rows[0]), len(rows)))
    mapping = {shade: (*rgb, 255) for shade, rgb in palette.items()}
    mapping[None] = (0, 0, 0, 0)
    image.putdata([mapping[shade] for row in rows for shade in row])
    pixels = rgba_pixels(image.resize(source.size, NEAREST))
    union = overlap = error = 0
    for original, drawn in zip(rgba_pixels(source), pixels, strict=True):
        a, b = original[3] >= 128, drawn[3] >= 128
        union += a or b
        if a and b:
            overlap += 1
            error += sum(abs(original[i] - drawn[i]) for i in range(3))
    return overlap / union if union else 0, error / (3 * overlap) if overlap else float('inf')


def outline_edits(rows, reference, palette, protected):
    """Adjust only cells where the coarse grid and source disagree on opacity."""
    height, width = len(rows), len(rows[0])
    edits = []
    for y, row in enumerate(rows):
        for x, color in enumerate(row):
            if color in protected:
                continue
            patch = [(yy, xx, reference.getpixel((xx, yy)))
                     for yy in (2 * y, 2 * y + 1) for xx in (2 * x, 2 * x + 1)]
            changed = [(yy, xx, pixel) for yy, xx, pixel in patch
                       if (color is not None) != (pixel[3] >= 128)]
            if not changed:
                continue
            replacement = None
            if color is None:
                local_colors = {
                    rows[yy][xx]
                    for yy in range(max(0, y - 1), min(height, y + 2))
                    for xx in range(max(0, x - 1), min(width, x + 2))
                } - {None}
                average = tuple(sum(pixel[i] for _, _, pixel in changed) / len(changed)
                                for i in range(3))
                replacement = min(sorted(local_colors or palette), key=lambda shade:
                                  sum((a - b) ** 2 for a, b in zip(average, palette[shade])))
            edits.append([(yy, xx, replacement) for yy, xx, _ in changed])
    return sorted(edits, key=len, reverse=True)


def refine_outline(art, source):
    profiles = art['profiles']
    light = profiles['h32c16']
    original = rasterize(light)
    palette = palette_for(light)
    protected = frozenset(art.get('reserved_colors', ()))
    width, height = 2 * light['width'], 2 * light['height']
    reference = source.resize((width, height), NEAREST)
    budget = len(light['runs'])
    best_overlap, original_error = compare_raster(original, source, palette)
    best = None
    for distance in (40, 54, 64, 72):
        coarse = blend_shades(original, palette, protected, distance)
        rows = [[coarse[y // 2][x // 2] for x in range(width)] for y in range(height)]
        edits = outline_edits(coarse, reference, palette, protected)
        # Check the full outline and progressively cheaper partial outlines.
        checkpoints = {round(len(edits) * step / 12) for step in range(1, 13)}
        for count, patch in enumerate(edits, 1):
            for y, x, color in patch:
                rows[y][x] = color
            if count not in checkpoints:
                continue
            runs = merge_runs(rows)
            if len(runs) > budget:
                continue
            overlap, color_error = compare_raster(rows, source, palette)
            if overlap > best_overlap and color_error <= original_error + COLOR_ERROR_MARGIN:
                best_overlap = overlap
                best = {**light, 'width': width, 'height': height, 'runs': runs}
    if best is None:
        return art
    return {**art, 'profiles': {**profiles, 'h32c16': best}}
