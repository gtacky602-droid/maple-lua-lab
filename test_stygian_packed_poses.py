import json
from unittest.mock import patch
from runtime import ROOT, runtime, read_packed_pose, load_pose_pack
from common_boss_art import FILES
from packed_pose_test_support import pose_check
from stygian_art import stygian_parts, stygian_overrides

shared={}
def capture_pack(lua,root,filename):
    poses=load_pose_pack(lua,root,filename)
    if filename=='common-boss-packed.json':
        shared.update(poses)
    return poses

with patch('runtime.read_packed_pose', wraps=read_packed_pose) as reader, patch('runtime.load_pose_pack',capture_pack):
    lua,core=runtime()
    assert not any(call.args[0].parent.name=='stygian-poses.zip' for call in reader.call_args_list)
    reader.reset_mock()
    check=pose_check(lua)
    same=lua.eval('rawequal')
    assert set(shared)==set(FILES)
    common_grids=0
    for filename,art in shared.items():
        original=json.loads((ROOT/'assets'/filename).read_bytes())
        check(art,lua.table_from(original,recursive=True))
        common_grids+=len(original['profiles'])
    print(f'{len(shared)} base boss poses, {common_grids} exact grids.')
    overrides=stygian_overrides(ROOT)
    def compare(view,parts):
        profiles=0
        for key,part in parts.items():
            if isinstance(part,dict):
                profiles+=compare(view[key],part)
                continue
            original=json.loads((ROOT/'assets'/part).read_bytes())
            original.update(overrides.get(part,{}))
            count=reader.call_count
            art=view[key]
            assert (reader.call_args.args[0].parent.name,reader.call_args.args[0].name)==('stygian-poses.zip',part)
            check(art,lua.table_from(original,recursive=True))
            for attr in ('heightScale','anchorY'):
                assert art[attr]==original.get(attr)
            assert same(art,view[key]) and reader.call_count==count+1
            profiles+=len(original['profiles'])
        return profiles
    profiles=sum(compare(core['stygian'+name+'Art'],parts) for name,parts in stygian_parts(ROOT).items())
    for id,stygian in [('beidou',core.stygianBeidouArt.idle),('wanderer',core.stygianWandererArt)]:
        assert same(core.companionArt[id],stygian.right)
        assert same(core.companionArt[id].left,stygian.left)
    print(f'{reader.call_count} dedicated parts, {profiles} grids matched; both shared actors reuse party poses.')
