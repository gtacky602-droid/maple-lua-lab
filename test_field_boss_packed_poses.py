"""Compare every packed field boss pose with its authored source and runtime idle anchor."""
import json
from unittest.mock import patch
from packed_pose_test_support import pose_check
from runtime import ROOT, runtime, read_packed_pose

catalog = json.loads((ROOT/'content/field-boss-pose-files.json').read_bytes())
with patch('runtime.read_packed_pose', wraps=read_packed_pose) as reader:
    lua,core = runtime()
    assert all(call.args[0].parent.name!='field-boss-packed' for call in reader.call_args_list)
    reader.reset_mock()
    same = lua.eval('rawequal')
    check = pose_check(lua)
    poses = grids = 0
    for group,spec in catalog.items():
        owner = core[group]
        for key,filename in spec['poses'].items():
            original = json.loads((ROOT/'assets'/filename).read_bytes())
            if key=='idle' and 'idleAnchor' in spec:
                original['anchorX'] = spec['idleAnchor']
            art = owner[key]
            check(art,lua.table_from(original,recursive=True))
            assert same(owner[key],art)
            assert reader.call_args.args[0]==ROOT/'assets'/'field-boss-packed'/filename
            poses+=1
            grids+=len(original['profiles'])
            assert reader.call_count==poses
print(f'{len(catalog)} field pose groups, {poses} poses and {grids} profile grids matched.')
