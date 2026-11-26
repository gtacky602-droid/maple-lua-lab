def pose_check(lua):
    return lua.execute("""
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
