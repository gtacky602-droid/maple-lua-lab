import json

from experience import QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
quest, town, hill = "mond-night-banner-quest", "mond-town", "mond-night-hill"
advance = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def tick(s, n=1, **input):
    advance(core, s, n, lua.table_from(input))


def frame(s):
    return core.frame(s, "sprite", "legacy")


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground, a.dir = x, y, 0, True, 1
    s.camera = max(0, min(x-400, s.worldwidth-960))


def gate(s, x, to, allowed=True):
    move(s, x)
    portal = frame(s).storyNearbyPortal
    assert portal and portal.to == to and portal.available is allowed, native(portal)
    origin = s.story.node
    core.action(s, "story_nearby_portal")
    assert s.story.node == (to if allowed else origin)


def collect(s, x, y=480):
    move(s, x, y)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def state(s):
    return s.story.quests[quest]


def snapshot(s):
    return validate_save(native(core.checkpoint(s)))


def load(save):
    return core.restore(lua.table_from(save, recursive=True), 12)


def art_pose(s, pose):
    asset = core.nightBannerArt[pose]
    return next((d for d in frame(s).draws.values()
                 if d.source == asset.source and d.box[1] == asset.box[1]), None)


s = core.new(12)
core.action(s, "story_start")
core.action(s, "story_accept:"+quest)
assert not state(s)
for id, count, extras in (
    ("amber-join", 4, {}),
    ("mond-old-trail", 2, {"inspected":{"wheel-ruts":True}}),
):
    s.story.quests[id] = lua.table_from(dict(status="complete", count=count, cycles=1, **extras), recursive=True)
for visited in ("mond-road", "mond-old-ground", "mond-hill"):
    s.story.visited[visited] = True
fixture = snapshot(s)
core.action(s, "story_accept:"+quest)
gate(s, 851, hill, False)
collect(s, 1068)
gate(s, 851, hill)
assert not len(s.enemies)
start = art_pose(s, "shadow")
assert start
tick(s, 40)
assert art_pose(s, "shadow").x != start.x
move(s, 1065)
core.action(s, "story_collect")
assert state(s).count == 1
collect(s, 225)
assert not art_pose(s, "shadow")
move(s, 718)
core.action(s, "story_collect")
assert state(s).count == 2
core.action(s, "jump")
tick(s, 58, jump=True)
assert s.actors[1].ground and s.actors[1].y == 396
collect(s, 718, 396)
collect(s, 1065)
assert state(s).count == 4 and len(s.enemies) == 3
assert all(e.flying for e in s.enemies.values())
before_lift = [e.y for e in s.enemies.values()]
tick(s, 25)
assert all(e.y != y for e,y in zip(s.enemies.values(),before_lift))

low, high = s.enemies[1], s.enemies[3]
core.defeatEnemy(s,low,1)
assert state(s).sweep["mond-night-slime-a"]
collect_blocked = state(s).count
move(s, 1470)
core.action(s, "story_collect")
assert state(s).count == collect_blocked
s = load(snapshot(s))
assert s.story.node == town and state(s).count == 4
gate(s, 851, hill)
assert {e.spawnId for e in s.enemies.values()} == {"mond-night-slime-b","mond-night-slime-c"}
low, high = s.enemies[1], s.enemies[2]
core.defeatEnemy(s,low,1)
s.actors[2].hp = 0
move(s, 1540)
health = high.hp
tick(s, 60, attack=True)
assert high.hp == health and len(s.enemies) == 2
move(s, 1540, 405)
tick(s, 300, attack=True)
assert high.hp == 0 and state(s).count == 5
collect(s,1470)
assert state(s).count == 6 and not art_pose(s, "repaired")
collect(s,1705,405)
assert state(s).count == 7 and art_pose(s, "repaired")
gate(s,61,town)
before = (s.progression.questXp,s.mora,s.inventory.upgradeOre)
core.action(s,"story_report:"+quest)
core.action(s,"story_report:"+quest)
after = (s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward = [b-a for a,b in zip(before,after)]
assert reward == [QUEST_REPORT_EXP["Q-MON-S04"],170,3]
s = load(snapshot(s))
gate(s,851,hill)
collect(s,1705,405)
assert art_pose(s,"repaired") and "オズ" in frame(s).storyNotice and not len(s.enemies)

result = {
    "prerequisite":True, "movingProjection":True, "orderedCluesAndHeight":True,
    "windSlimesHover":True, "partialKillReload":True, "normalAttackFromLedge":True,
    "collectAndRepair":True, "postAndDialoguePersist":True, "reward":reward,
}
(ROOT/"evidence/mond-night-banner-lua.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
(ROOT/"work").mkdir(exist_ok=True)
(ROOT/"work/mond-night-banner-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(result)
