"""Build baseline daily guide routes from the Lua atlas and check each gate at its exit."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from experience import LEVELS
from runtime import ROOT, native, runtime
from tools.waypoint_test import TrailWalk

lua, core = runtime()
quests = json.loads((ROOT / "content/daily-field-guide.json").read_bytes())["quests"]
nodes = {n["id"]: n for n in json.loads((ROOT / "content/story-graph.json").read_bytes())["nodes"]}
exits = {key: node["exits"] for key, node in nodes.items()}
edges = {(key, e["to"]): e for key, items in exits.items() for e in items}
progressed_save = json.loads((ROOT / "evidence/liyue-alternate-lift-save.json").read_bytes())


def map_guide(state, target):
    core.action(state, "world_map_focus:" + target)
    view = native(core.frame(state, "sprite", "legacy").worldMap.guide)
    core.action(state, "world_map_close")
    return view


def field_step(leg):
    return {"node": leg["id"], "name": leg["name"], "from": leg["from"],
            "x": leg["previewX"], "y": leg.get("previewY", 480)}


def walk_guide(state, target):
    guide = map_guide(state, target)
    assert guide["status"] == "ready", (target, guide)
    trail = TrailWalk(lua, core, state, edges, exits)
    for leg in guide["stops"]:
        assert state.story.node == leg["from"]
        trail.cross(leg["id"], leg["previewX"])
    assert state.story.node == target
    return [field_step(leg) for leg in guide["stops"]]


routes = {}
level_checks = 0
for q in quests:
    key = f"{q['hub']}/{q['level']}/{q['node']}"
    if key in routes:
        continue
    state = core.new(12)
    core.action(state, "story_start")
    core.grantExp(state, LEVELS[q["level"] - 1]["maple_reference_total_exp_to_reach"], "quest")
    core.enterStoryNode(state, q["hub"])
    guide = map_guide(state, q["node"])
    assert guide["stops"][-1]["id"] == q["node"]
    first = guide["stops"][0]
    gate_level = nodes[first["id"]]["level"]
    if gate_level > 1:
        under = core.new(12)
        core.action(under, "story_start")
        core.grantExp(under, LEVELS[gate_level - 2]["maple_reference_total_exp_to_reach"], "quest")
        core.enterStoryNode(under, q["hub"])
        core.action(under, "world_map_focus:" + first["id"])
        low = native(core.frame(under, "sprite", "legacy").worldMap.guide)
        assert low["status"] == "blocked" and low["reason"] == f"必要Lv{gate_level}", key
        core.action(under, "world_map_close")
        actor = under.actors[under.active]
        actor.x, actor.y = first["previewX"], first.get("previewY", 480)
        core.action(under, "story_portal:" + first["id"])
        assert under.story.node == q["hub"] and not under.lift, key
        level_checks += 1
    legs = []
    checking = True
    for leg in guide["stops"]:
        step = field_step(leg)
        if leg.get("reason"):
            step["requires"] = leg["reason"]
        if checking:
            assert state.story.node == leg["from"]
            actor = state.actors[state.active]
            actor.x, actor.y = leg["previewX"], leg.get("previewY", 480)
            core.action(state, "story_portal:" + leg["id"])
            if leg.get("reason"):
                assert state.story.node == leg["from"] and not state.lift, key
                checking = False
            else:
                assert state.story.node == leg["id"], (key, state.storyNotice)
        legs.append(step)
    assert checking == (guide["status"] == "ready")
    if checking:
        core.enterStoryNode(state, q["hub"])
    else:
        state = core.restore(lua.table_from(progressed_save, recursive=True), 12)
        core.enterStoryNode(state, q["hub"])
    walk_guide(state, q["node"])
    home = walk_guide(state, q["hub"])
    routes[key] = {"outbound": legs, "home": home}

out = ROOT / "content/daily-guide-routes.json"
out.write_bytes((json.dumps(routes, ensure_ascii=False, indent=2) + "\n").encode())
print(f"{len(quests)} commissions, {len(routes)} itineraries, {level_checks} first-gate level checks")
