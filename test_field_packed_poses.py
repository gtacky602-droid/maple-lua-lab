"""Verify all referenced field grids and reuse of the same pose across encounters."""
import json
from unittest.mock import patch
from field_pose_files import enemy_pose_files, legend_pose_files
from packed_pose_test_support import pose_check
from runtime import ROOT, runtime, read_packed_pose

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
                source = read('assets/'+filename)
                check(pose,lua.table_from(source,recursive=True))
                grids += len(source['profiles'])
                seen[filename] = pose
    assert reader.call_count == len(seen)
    assert same(core.enemyIdleArt['tainted-water-spouting-phantasm'],core.branchLegendArt['lake-vivianne'].idle)
    assert same(core.enemyIdleArt['tainted-water-splitting-phantasm'],core.branchLegendArt['lake-ninianne'].idle)
    assert not same(core.branchLegendArt['lake-vivianne'].idle,core.branchLegendArt['lake-ninianne'].idle)
print(f'{len(seen)} distinct reads, {grids} exact profile reconstructions, {len(ordinary)} ordinary entries and {len(legends)} legend bodies.')
