import json
from runtime import ROOT, runtime

lua, core = runtime()
variants = json.loads((ROOT / 'assets/variants.json').read_bytes())['variants']
assert lua.eval('rawequal')(core.assets, core.variants.legacy)
count = 0
for name, reference in variants.items():
    for index, sprite in enumerate(reference['sprites'], 1):
        grid = core.variants[name][index]
        assert lua.eval('rawget')(grid, 'runs') is None
        for key in ('id', 'width', 'height'):
            assert grid[key] == sprite[key]
        assert list(grid.box.values()) == sprite['box']
        assert [list(row.values()) for row in grid.runs.values()] == sprite['runs']
        count += 1
print(f'{count} sprite grids matched every original rectangle')
