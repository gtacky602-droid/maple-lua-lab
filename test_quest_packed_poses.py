"""Check each quest asset against the authored pose and confirm shared files load once."""
import json
from unittest.mock import patch
from packed_pose_test_support import pose_check
from runtime import ROOT, runtime, read_packed_pose

catalog=json.loads((ROOT/'content/quest-pose-files.json').read_bytes())
with patch('runtime.read_packed_pose',wraps=read_packed_pose) as reader:
    lua,core=runtime()
    assert all(call.args[0].parent.name!='quest-poses.zip' for call in reader.call_args_list)
    reader.reset_mock()
    seen={}
    check=pose_check(lua)
    same=lua.eval('rawequal')
    profiles=0
    bindings=0
    for group,files in catalog.items():
        items=([(core[group],files)] if isinstance(files,str) else
               ((core[group][key],name) for key,name in files.items()))
        for art,name in items:
            bindings+=1
            if name in seen:
                assert same(art.profiles,seen[name].profiles)
            else:
                source=json.loads((ROOT/'assets'/name).read_bytes())
                check(art,lua.table_from(source,recursive=True))
                assert (reader.call_args.args[0].parent.name,reader.call_args.args[0].name)==('quest-poses.zip',name)
                profiles+=len(source['profiles'])
                seen[name]=art
            assert reader.call_count==len(seen)
print(f'{len(catalog)} groups, {bindings} bindings, {len(seen)} unique reads, {profiles} matching grids')
