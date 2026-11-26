import json

from experience import QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
quest, town, orchard = "mond-return-box-quest", "mond-town", "mond-library-orchard"
advance = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def tick(s, n=1, **input):
    advance(core, s, n, lua.table_from(input))


def frame(s):
    return core.frame(s, "sprite", "legacy")


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def gate(s, x, to):
    move(s, x)
    portal = frame(s).storyNearbyPortal
    assert portal and portal.available and portal.to == to
    core.action(s, "story_nearby_portal")
    assert s.story.node == to


def collect(s, x, y=480):
    move(s, x, y)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def status(s):
    return s.story.quests[quest]


def snapshot(s):
    return validate_save(native(core.checkpoint(s)))


def load(save):
    return core.restore(lua.table_from(save, recursive=True), 12)


s = core.new(12)
core.action(s, "story_start")
core.action(s, "story_accept:"+quest)
assert not status(s)
s.story.quests["amber-join"] = lua.table_from({"status":"complete", "count":4, "cycles":1})
s.story.visited["mond-road"] = True
fixture = snapshot(s)
core.action(s, "story_accept:"+quest)
move(s, 758)
assert not frame(s).storyNearbyPortal.available
collect(s, 340)
gate(s, 758, orchard)
assert not len(s.enemies)
move(s, 1000)
core.action(s, "story_collect")
assert status(s).count == 1
collect(s, 302)
move(s, 649)
core.action(s, "story_collect")
assert status(s).count == 2
(ROOT/'evidence/mond-orchard-mud-save.json').write_text(json.dumps(snapshot(s),ensure_ascii=False)+'\n',encoding='utf8')
collect(s, 649, 399)
collect(s, 1000)
assert status(s).count == 4

tick(s, 20)
box = frame(s).storyReturnBox
assert box.chasing and box.x > 1115 and box.y < 480
move(s, 120)
tick(s, 2600)
assert status(s).count == 4 and frame(s).storyReturnBox.x == box.x
assert not len(s.enemies)
gate(s, 62, town)
gate(s, 758, orchard)
assert status(s).count == 4 and frame(s).storyReturnBox.x == 1115
move(s, 1060)
core.action(s, "pause")
tick(s, 120, right=True)
assert frame(s).storyReturnBox.x == 1115
core.action(s, "pause")
tick(s, 205, right=True)
assert status(s).count == 5 and len(s.enemies) == 3
move(s, 1640)
core.action(s, "story_collect")
assert status(s).count == 5

enemy = s.enemies[1]
enemy.hp = 0
core.onKill(s, enemy)
assert status(s).sweep[enemy.spawnId]
checkpoint = snapshot(s)
s = load(checkpoint)
assert s.story.node == town and status(s).count == 5
gate(s, 758, orchard)
assert {e.spawnId for e in s.enemies.values()} == {"mond-return-slime-b","mond-return-slime-c"}
for e in list(s.enemies.values()):
    e.hp = 0
    core.onKill(s, e)
assert status(s).count == 6 and not status(s).sweep
collect(s, 1640)
assert status(s).count == 7
gate(s, 62, town)
before = (s.progression.questXp, s.mora, s.inventory.upgradeOre)
core.action(s, "story_report:"+quest)
core.action(s, "story_report:"+quest)
after = (s.progression.questXp, s.mora, s.inventory.upgradeOre)
reward = [b-a for a,b in zip(before,after)]
assert reward == [QUEST_REPORT_EXP["Q-MON-S02"],130,2]
s = load(snapshot(s))
collect(s, 340)
assert "スライム" in frame(s).storyNotice and "魔物観察記録" in frame(s).storyNotice
gate(s, 758, orchard)
assert not len(s.enemies) and not frame(s).storyReturnBox

result = {
    "prerequisite":True, "orderedCluesAndHeight":True, "chaseMovesAndWaits":True,
    "pauseAndReenter":True, "fightAfterChase":True, "partialDefeatResumes":True,
    "recoverAfterCombat":True, "reportOnce":True, "archiveAfterReload":True,
    "noRespawnAfterReport":True, "reward":reward,
}
(ROOT/"evidence/mond-return-box-lua.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
(ROOT/"work").mkdir(exist_ok=True)
(ROOT/"work/mond-return-box-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(result)
