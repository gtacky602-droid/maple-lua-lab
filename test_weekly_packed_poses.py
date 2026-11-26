"""Exercise Lua pose lookup, lazy profiles and rectangle restoration for every weekly encounter."""
import json
from unittest.mock import patch
from runtime import ROOT, runtime, read_packed_pose

catalog = json.loads((ROOT/'content/weekly-pose-files.json').read_bytes())
with patch('runtime.read_packed_pose', wraps=read_packed_pose) as reader:
    lua, core = runtime()
    assert not reader.called
    check = lua.execute("""
        return function(packed, original)
            assert(packed.source==original.source and packed.anchorX==original.anchorX)
            for i,v in ipairs(original.box) do assert(v==packed.box[i]) end
            for name,grid in pairs(original.profiles) do
                local candidate=packed.profiles[name]
                assert(rawget(candidate,'runs')==nil)
                assert(candidate.width==grid.width and candidate.height==grid.height and candidate.colors==grid.colors)
                local runs=candidate.runs
                assert(#runs==#grid.runs and candidate.runs==runs)
                for i,row in ipairs(grid.runs) do
                    assert(#runs[i]==#row)
                    for j,v in ipairs(row) do assert(runs[i][j]==v) end
                end
            end
        end
    """)
    poses=profiles=0
    for group,files in catalog.items():
        for key,filename in files.items():
            source=json.loads((ROOT/'assets'/filename).read_bytes())
            check(core[group][key],lua.table_from(source,recursive=True))
            assert reader.call_args.args[0]==ROOT/'assets'/'weekly-packed'/filename
            assert core[group][key].source==source['source']
            poses+=1
            profiles+=len(source['profiles'])
            assert reader.call_count==poses
print(f'{len(catalog)} weekly groups, {poses} on-demand pose reads, {profiles} restored grids matched.')
