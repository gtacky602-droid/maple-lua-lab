import base64
import json
from unittest.mock import patch
from runtime import ROOT, runtime

packed = [grid['data'] for path in (ROOT / 'assets/base-packed').glob('*.json')
          for grid in json.loads(path.read_bytes())['sprites']]
payloads = set(packed)
byte_count = sum(len(base64.b64decode(data)) for data in packed)
decoder = patch('packed_poses.base64.b64decode', wraps=base64.b64decode)
with decoder as decode:
    lua, core = runtime()
assert all(call.args[0] not in payloads for call in decode.call_args_list)
decode.reset_mock()
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
        assert grid.runs is not None
        count += 1
assert decode.call_count == count == len(packed)
print(f'{count} sprite grids matched every original rectangle; {byte_count} decoded bytes deferred.')
