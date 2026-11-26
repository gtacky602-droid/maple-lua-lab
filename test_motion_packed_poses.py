import json
from unittest.mock import patch
from runtime import ROOT,runtime,read_packed_pose
from packed_pose_test_support import pose_check

files=json.loads((ROOT/'content/motion-pose-files.json').read_bytes())
with patch('runtime.read_packed_pose',wraps=read_packed_pose) as reader:
    lua,core=runtime()
    assert not any(c.args[0].parent.name=='motion-packed' for c in reader.call_args_list)
    reader.reset_mock()
    check=pose_check(lua)
    count=0
    for group,parts in files.items():
        for key,name in parts.items():
            if group in ('left','right'):
                art=core.travelerRunArt[group][int(key)]
            elif group=='amber':
                art=core.amberBowArt
            else:
                art=core.oceanidArt[key]
            original=json.loads((ROOT/'assets'/name).read_bytes())
            check(art,lua.table_from(original,recursive=True))
            count+=1
            assert reader.call_count==count
            assert reader.call_args.args[0]==ROOT/'assets'/'motion-packed'/name
print(f'{count} poses match original profile grids and anchors')
