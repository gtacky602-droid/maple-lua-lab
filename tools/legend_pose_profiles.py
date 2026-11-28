"""Use the same derived profiles in Lua fights, placement previews and galleries."""
from tools import legend_light_blend, legend_outline


FILES = legend_light_blend.FILES | legend_outline.FILES


def refine_pose(name, art, assets):
    if name in legend_outline.FILES:
        return legend_outline.refine_outline(art, legend_outline.source_crop(assets, art))
    return legend_light_blend.refine_legend_profiles(name, art)
