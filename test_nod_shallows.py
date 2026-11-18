from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
town, coast, shallows, rocks = "nod-town", "nod-workshop-coast", "nod-moon-shallows", "nod-tide-rocks"
quest = "nod-first-treasure"
step = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")
empty = lua.table()
route = next(q for q in json.loads((ROOT / "content/story-graph.json").read_text(encoding="utf8"))["quests"] if q["id"] == quest)


def frame(s):
    return core.frame(s, "sprite", "legacy")


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def inspect(s, x):
    move(s, x)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def gate(s, x, dest, allowed=True):
    move(s, x)
    origin = s.story.node
    portal = frame(s).storyNearbyPortal
    assert portal and portal.to == dest and portal.available == allowed, (origin, dest, native(portal))
    core.action(s, "story_nearby_portal")
    assert s.story.node == (dest if allowed else origin)


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s), recursive=True), 12)


def rejects(s, field, value, expected):
    data = deepcopy(checkpoint(s))
    data["story"]["quests"][quest][field] = value
    try:
        validate_save(data)
    except ValueError as error:
        assert expected in str(error)
    else:
        raise AssertionError(field)


def start():
    s = core.new(12)
    core.action(s, "story_start")
    core.grantExp(s, LEVELS[119]["maple_reference_total_exp_to_reach"], "quest")
    core.enterStoryNode(s, town)
    core.action(s, "companion:amber")
    return s


def progress(s):
    return s.story.quests[quest]


def has_bridge(s):
    return any(platform.moonDeck for platform in s.platforms.values())


def go_to_shallows(s):
    gate(s, 1160, coast)
    gate(s, 1350, shallows)


def strike(s, enemy):
    cast = dict(id=1, targetId=enemy.id, x=enemy.x, y=enemy.y, atk=500,
                dir=1, radial=True, mult=1, range=24, limit=1, element="physical", gain=0,
                color="#f9e6b7", critRate=0)
    core.resolveCast(s, lua.table_from(cast))
    assert enemy.hp == 0


fixture = checkpoint(start())
for option in route["itinerary"][0]["choices"]:
    s = start()
    assert frame(s).companion.id == "amber"
    gate(s, 1160, coast, False)
    core.action(s, "story_accept:" + quest)
    mora = s.mora
    inspect(s, option["x"])
    assert (progress(s).count, progress(s).storyChoice, s.mora) == (1, option["id"], mora)
    assert s.storyNotice == option["notice"]
    rejects(s, "storyChoice", "another-witness", "聞き込み")
    s = restore(s)
    assert progress(s).storyChoice == option["id"]
    gate(s, 1160, coast)
    gate(s, 1350, shallows, False)
    inspect(s, 540)
    gate(s, 1350, shallows)
    assert not has_bridge(s)
    gate(s, 1554, rocks, False)
    inspect(s, 500)
    assert frame(s).storyReflection.orientation == "波打ち際" and not has_bridge(s)
    inspect(s, 500)
    assert frame(s).storyReflection.orientation == "岩壁" and not has_bridge(s)
    rejects(s, "reflectAngle", 3, "反射板")
    s = restore(s)
    go_to_shallows(s)
    move(s, 500)
    assert frame(s).storyReflection.orientation == "岩壁"
    move(s, 679, 652)
    step(core, s, 1, empty)
    assert (s.actors[1].x, s.actors[1].y) == (546, 480)
    inspect(s, 500)
    assert progress(s).count == 3 and progress(s).reflectAngle is None and has_bridge(s)
    s = restore(s)
    go_to_shallows(s)
    assert has_bridge(s)

move(s, 572)
core.action(s, "jump")
step(core, s, 23, lua.table_from({"right": True, "jump": True}))
step(core, s, 43, empty)
assert s.actors[1].ground and s.actors[1].y == 447, native(frame(s).actors[1])
step(core, s, 200, lua.table_from({"right": True}))
assert s.actors[1].x > 1200 and s.actors[1].ground and s.actors[1].y == 480
gate(s, 1554, rocks)
gate(s, 1506, town, False)
s.actors[2].hp = 0
move(s, 560)
step(core, s, 100, empty)
enemy = s.enemies[1]
assert enemy.x < enemy.home - 70 and enemy.y == 480
strike(s, enemy)
step(core, s, 420, empty)
assert enemy.hp == 0 and progress(s).count == 3 and progress(s).sweep[enemy.spawnId]
s = restore(s)
go_to_shallows(s)
gate(s, 1554, rocks)
assert len(s.enemies) == 2
for enemy in list(s.enemies.values()):
    strike(s, enemy)
assert progress(s).count == 4
ore = s.inventory.upgradeOre
inspect(s, 1337)
assert progress(s).count == 5 and s.inventory.upgradeOre == ore + 5
core.action(s, "story_collect")
assert s.inventory.upgradeOre == ore + 5
core.action(s, "story_report:" + quest)
assert progress(s).status == "active"
gate(s, 1506, town)
before = (s.progression.questXp, s.mora, s.inventory.upgradeOre)
for _ in range(2):
    core.action(s, "story_report:" + quest)
assert progress(s).status == "complete"
after = (s.progression.questXp, s.mora, s.inventory.upgradeOre)
reward = (QUEST_REPORT_EXP["Q-NOD-M01"], 8700, 0)
assert tuple(a - b for a, b in zip(after, before)) == reward
s = restore(s)
go_to_shallows(s)
gate(s, 1554, rocks)
assert len(s.enemies) == 3 and progress(s).storyChoice == "traveler"
inspect(s, 1337)
assert s.storyNotice.startswith("貯蔵所の札") and s.inventory.upgradeOre == ore + 5

proof = dict(witnesses=[option["id"] for option in route["itinerary"][0]["choices"]],
             noCost=True, nonMoonParty=True, timingIndependent=True, closedGate=True, fallRescue=True,
             reflectAngleAfterReload=True, solidBridgeAfterReload=True, crossedWithJump=True,
             playerLure=True, partialSweepAfterReload=True, chestOre=5, remoteReportBlocked=True,
             reportOnce=True, returnToFarm=True, readbackWithoutReward=True, reward=reward)
(ROOT / "evidence/nod-shallows-lua.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf8")
(ROOT / "work/nod-shallows-fixture.json").write_text(json.dumps(fixture), encoding="utf8")
print(proof)
