"""Verify all referenced field grids and reuse of the same pose across encounters."""
import json
from unittest.mock import patch
from zipfile import ZipFile, Path as ZipPath
from field_pose_files import enemy_pose_files, legend_pose_files
from packed_pose_test_support import pose_check
from runtime import ROOT, runtime, read_packed_pose
from tools import legend_light_blend, legend_outline
from tools.legend_light_blend import RGB_DISTANCE, palette_for, rasterize
from tools.legend_pose_profiles import refine_pose

def read(path):
    return json.loads((ROOT/path).read_bytes())

ordinary = enemy_pose_files(read('content/enemy-art-layout.json'))
legends = legend_pose_files(read('content/field-boss-spawns.json')['fieldBosses'])
with patch('runtime.read_packed_pose', wraps=read_packed_pose) as reader:
    lua, core = runtime()
    assert [call.args[0].name for call in reader.call_args_list] == [ordinary['hilichurl']]
    info=core.enemyArtLayout['tainted-water-spouting-phantasm']
    assert core.enemyHeadY(lua.table(art='tainted-water-spouting-phantasm',y=480))==480-info.height-info.hover
    assert reader.call_count==1
    check = pose_check(lua)
    same = lua.eval('rawequal')
    seen = {}
    grids = 0
    groups = [(core.enemyIdleArt, ordinary)]
    groups.extend((core.branchLegendArt[key], poses) for key,poses in legends.items())
    for view, files in groups:
        for key,filename in files.items():
            pose = view[key]
            if filename in seen:
                assert same(pose,seen[filename]), filename
            else:
                raw = read('assets/'+filename)
                source = refine_pose(filename,raw,ROOT/'assets')
                if filename in legend_light_blend.FILES:
                    old, new = (a['profiles']['h32c16'] for a in (raw, source))
                    assert len(new['runs']) <= len(old['runs']), filename
                    assert all(raw['profiles'][p] == source['profiles'][p] for p in ('legacy', 'h48c32')), filename
                    for row, improved in zip(rasterize(old), rasterize(new), strict=True):
                        for a, b in zip(row, improved, strict=True):
                            assert (a is None) == (b is None), filename
                            if a != b:
                                assert a not in raw.get('reserved_colors',()), filename
                                assert sum((x-y)**2 for x,y in zip(bytes.fromhex(a[1:]), bytes.fromhex(b[1:]))) <= RGB_DISTANCE**2, filename
                elif filename in legend_outline.FILES:
                    old, new = (a['profiles']['h32c16'] for a in (raw, source))
                    assert len(new['runs']) <= len(old['runs']), filename
                    assert palette_for(new).keys() <= palette_for(old).keys(), filename
                    assert all(raw['profiles'][p] == source['profiles'][p] for p in ('legacy', 'h48c32')), filename
                    crop = legend_outline.source_crop(ROOT/'assets', raw)
                    palette = palette_for(old)
                    previous_overlap, previous_error = legend_outline.compare_raster(rasterize(old), crop, palette)
                    overlap, error = legend_outline.compare_raster(rasterize(new), crop, palette)
                    assert overlap >= previous_overlap + 0.04, filename
                    assert error <= previous_error + legend_outline.COLOR_ERROR_MARGIN, filename
                check(pose,lua.table_from(source,recursive=True))
                grids += len(source['profiles'])
                seen[filename] = pose
    assert reader.call_count == len(seen)
    assert all(isinstance(call.args[0], ZipPath) for call in reader.call_args_list)
    with ZipFile(ROOT/'assets/field-poses.zip') as archive:
        assert sorted(archive.namelist()) == sorted(seen)
        for name in seen:
            assert json.loads(archive.read(name)) == read('assets/field-packed/'+name)
    assert same(core.enemyIdleArt['tainted-water-spouting-phantasm'],core.branchLegendArt['lake-vivianne'].idle)
    assert same(core.enemyIdleArt['tainted-water-splitting-phantasm'],core.branchLegendArt['lake-ninianne'].idle)
    assert not same(core.branchLegendArt['lake-vivianne'].idle,core.branchLegendArt['lake-ninianne'].idle)
print(f'{len(seen)} distinct reads, {grids} exact profile reconstructions, {len(ordinary)} ordinary entries and {len(legends)} legend bodies.')
