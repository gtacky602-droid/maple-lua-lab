from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
town, rest, wood, coast, inlet, cave = (
    "nod-town", "nod-lull-wood", "nod-spruce-clearing", "nod-lantern-shore", "nod-box-inlet", "nod-moon-cave-mouth"
)
first, quest = "nod-first-treasure", "nod-moon-crossroads"
routes = {q["id"]: q for q in json.loads((ROOT / "content/story-graph.json").read_text(encoding="utf8"))["quests"]}
step = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")
empty = lua.table()


def frame(s):
    return core.frame(s, "sprite", "legacy")


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s), recursive=True), 12)


def move(s, x, y=480):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground = x, y, 0, True


def gate(s, x, dest, y=480, allowed=True):
    move(s, x, y)
    previous = s.story.node
    portal = frame(s).storyNearbyPortal
    assert portal and portal.to == dest and portal.available == allowed, (previous, dest, native(portal))
    core.action(s, "story_nearby_portal")
    assert s.story.node == (dest if allowed else previous)


def inspect(s, x, y=480):
    move(s, x, y)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def progress(s):
    return s.story.quests[quest]


def branch(s, id):
    return progress(s).pathProgress[id]


def strike(s, enemy):
    cast = dict(id=1, targetId=enemy.id, x=enemy.x, y=enemy.y, atk=500, dir=1,
                radial=True, mult=1, range=24, limit=1, element="physical", gain=0,
                color="#f9e6b7", critRate=0)
    core.resolveCast(s, lua.table_from(cast))
    assert enemy.hp == 0


def jump_to(s, x, low, high):
    move(s, x, low)
    core.action(s, "jump")
    step(core, s, 60, lua.table_from({"jump": True}))
    assert s.actors[1].ground and s.actors[1].y == high, native(frame(s).actors[1])


def prepare():
    s = core.new(12)
    core.action(s, "story_start")
    core.grantExp(s, LEVELS[119]["maple_reference_total_exp_to_reach"], "quest")
    core.enterStoryNode(s, town)
    core.action(s, "story_accept:" + quest)
    assert progress(s) is None
    s.story.quests[first] = lua.table_from(dict(status="complete", count=5, cycles=1, storyChoice="fisher"))
    for item in routes[first]["itinerary"]:
        s.story.visited[item["node"]] = True
    return s


def accept(s):
    core.action(s, "story_accept:" + quest)
    assert progress(s).count == 0
    gate(s, 458, rest, allowed=False)
    gate(s, 959, coast, allowed=False)
    inspect(s, 686)
    assert progress(s).count == 1


def cross_coast(s):
    gate(s, 959, coast)
    assert len(s.enemies) == 3 and {e.y for e in s.enemies.values()} == {480, 388, 292}
    gate(s, 1534, inlet, 292, allowed=False)
    inspect(s, 405)
    jump_to(s, 842, 480, 388)
    ore = s.inventory.upgradeOre
    inspect(s, 847, 388)
    assert branch(s, "coast").count == 2 and s.inventory.upgradeOre == ore + 2
    core.action(s, "story_collect")
    assert branch(s, "coast").count == 2 and s.inventory.upgradeOre == ore + 2
    jump_to(s, 1060, 388, 292)
    inspect(s, 1400, 292)
    assert branch(s, "coast").count == 3
    gate(s, 1534, inlet, 292)
    assert s.actors[1].y == 386


def start_wood(s):
    gate(s, 458, rest)
    assert not s.enemies[1]
    gate(s, 1328, wood, allowed=False)
    inspect(s, 478)
    gate(s, 1328, wood)
    assert len(s.enemies) == 4


def clear_wood(s):
    gate(s, 1526, inlet, allowed=False)
    for enemy in list(s.enemies.values()):
        strike(s, enemy)
    assert branch(s, "wood").count == 2
    gate(s, 1526, inlet)
    assert s.actors[1].y == 480


def finish(s):
    assert progress(s).count == 2
    gate(s, 1674, cave, 386, allowed=False)
    inspect(s, 470)
    jump_to(s, 801, 480, 386)
    inspect(s, 801, 386)
    assert frame(s).storyBoxGlimpse.seconds > 2
    core.action(s, "pause")
    remaining = frame(s).storyBoxGlimpse.seconds
    step(core, s, 150, empty)
    assert frame(s).storyBoxGlimpse.seconds == remaining
    core.action(s, "pause")
    step(core, s, 150, empty)
    assert frame(s).storyBoxGlimpse is None
    inspect(s, 934, 386)
    assert progress(s).count == 5 and any(p.moonDeck for p in s.platforms.values())
    step(core, s, 177, lua.table_from({"right": True}))
    assert s.actors[1].x>1500 and s.actors[1].y==386
    gate(s, 1674, cave, 386)
    gate(s, 1360, town, allowed=False)
    ore = s.inventory.upgradeOre
    inspect(s, 549)
    assert progress(s).count == 6 and s.inventory.upgradeOre == ore + 3
    core.action(s, "story_collect")
    assert s.inventory.upgradeOre == ore + 3
    gate(s, 1360, town)
    before = (s.progression.questXp, s.mora, s.inventory.upgradeOre)
    for _ in range(2):
        core.action(s, "story_report:" + quest)
    after = (s.progression.questXp, s.mora, s.inventory.upgradeOre)
    assert tuple(a - b for a, b in zip(after, before)) == (QUEST_REPORT_EXP["Q-NOD-M02"], 10600, 0)
    assert progress(s).status == "complete"
    return restore(s)


fixture = checkpoint(prepare())
s = prepare()
accept(s)
start_wood(s)
clear_wood(s)
assert branch(s, "coast").count == 0
invalid = deepcopy(checkpoint(s))
invalid["story"]["quests"][quest]["pathProgress"]["wood"]["count"] = 1
try:
    validate_save(invalid)
except ValueError as error:
    assert "分岐と合流" in str(error)
else:
    raise AssertionError("Joined save must contain one completed path")
s = finish(s)
gate(s, 1258, cave)
inspect(s, 549)
assert "岩窟口の札" in s.storyNotice
gate(s, 55, inlet)
assert any(p.moonDeck for p in s.platforms.values())
gate(s, 250, coast, 386, allowed=False)
s = restore(s)
cross_coast(s)
assert progress(s).status == "complete" and progress(s).count == 6
news = checkpoint(s)
assert news["story"]["quests"][quest]["pathProgress"]["coast"]["count"] == 3

s = prepare()
accept(s)
cross_coast(s)
assert branch(s, "wood").count == 0
s = finish(s)
start_wood(s)
enemy = s.enemies[1]
strike(s, enemy)
part = enemy.spawnId
s = restore(s)
gate(s, 458, rest)
gate(s, 1328, wood)
assert len(s.enemies) == 3 and branch(s, "wood").sweep[part]
clear_rest = list(s.enemies.values())
for enemy in clear_rest:
    strike(s, enemy)
assert branch(s, "wood").count == 2 and progress(s).status == "complete"
gate(s, 1526, inlet)
gate(s, 60, wood)
assert len(s.enemies) == 4

proof = dict(woodOnly=True, coastOnly=True, optionalCoastAfterReport=True, optionalWoodAfterReport=True,
             partialOptionalSweepRestored=True, tamperedJoinRejected=True, bothHeightJumps=True,
             glimpseFreezesOnPause=True, bridgeCrossedOnFoot=True, bridgeRestored=True,
             safeRestAndHuntSeparate=True, shortcutBothDirections=True, coastOre=2, caveOre=3,
             reportReward=[QUEST_REPORT_EXP["Q-NOD-M02"], 10600, 0])
(ROOT / "evidence/nod-moon-paths-lua.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf8")
(ROOT / "work/nod-moon-paths-fixture.json").write_text(json.dumps(fixture), encoding="utf8")
print(proof)
