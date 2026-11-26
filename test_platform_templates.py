"""Compare every field with the independently loaded Lua platform module."""
import json

from lupa import LuaRuntime
from tools.build_platform_templates import ROOT, build

nodes = json.loads((ROOT / "content/story-graph.json").read_bytes())["nodes"]
module, layouts, rows = build(nodes)
assert module.decode() == (ROOT / "content/platform-templates.lua").read_text(encoding="utf8")
read = LuaRuntime().execute(module.decode())
baseline = {}
for node in nodes:
    key = node["id"]
    baseline[key] = node["platforms"]
    platforms = read(key)
    assert [dict(platforms[i]) for i in range(1, len(platforms)+1)] == baseline[key], key
    if len(platforms):
        platforms[1].x = -999999
        assert read(key)[1].x == baseline[key][0]["x"]
assert read("unknown-field") is None
report = dict(fields=len(nodes), platformInstances=sum(map(len, baseline.values())),
              distinctLayouts=layouts, distinctPlatforms=rows,
              compactJsonBytes=len(json.dumps(baseline, separators=(",", ":")).encode()),
              standaloneLuaBytes=len(module))
(ROOT / "evidence/platform-templates.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
print(report)
