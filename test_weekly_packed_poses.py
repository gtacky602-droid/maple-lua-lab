"""Exercise Lua pose lookup, lazy profiles and rectangle restoration for every weekly encounter."""
import base64
import json
from unittest.mock import patch
from packed_pose_test_support import pose_check
from runtime import ROOT, runtime, read_packed_pose

catalog = json.loads((ROOT/'content/weekly-pose-files.json').read_bytes())
with patch('runtime.read_packed_pose', wraps=read_packed_pose) as reader:
    lua, core = runtime()
    assert all(call.args[0].parent.name != 'weekly-poses.zip' for call in reader.call_args_list)
    reader.reset_mock()
    check=pose_check(lua)
    poses=profiles=0
    for group,files in catalog.items():
        for key,filename in files.items():
            source=json.loads((ROOT/'assets'/filename).read_bytes())
            with patch('packed_poses.base64.b64decode', wraps=base64.b64decode) as decode:
                art = core[group][key]
                assert art.source == source['source'] and decode.call_count == 0
                check(art,lua.table_from(source,recursive=True))
                assert decode.call_count == len(source['profiles'])
            assert (reader.call_args.args[0].parent.name,reader.call_args.args[0].name)==('weekly-poses.zip',filename)
            assert core[group][key].source==source['source']
            poses+=1
            profiles+=len(source['profiles'])
            assert reader.call_count==poses
print(f'{len(catalog)} weekly groups, {poses} on-demand pose reads, {profiles} restored grids matched.')
