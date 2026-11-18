from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
quest, town, look, beach = "ina-window-fireworks", "inazuma-town", "ina-firework-lookouts", "ina-firework-beach"
advance = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def tick(s, n, **input):
    advance(core, s, n, lua.table_from(input))


def frame(s):
    return core.frame(s, "sprite", "legacy")


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True
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


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def load(save):
    return core.restore(lua.table_from(save, recursive=True), 12)


def select(s, field, id):
    core.action(s, f"story_firework_select:{field}:{id}")


def phase(s):
    return frame(s).storyFireworkStatus.phase


s = core.new(12)
core.action(s, "story_start")
core.grantExp(s, LEVELS[39]["maple_reference_total_exp_to_reach"], "quest")
core.enterStoryNode(s, town)
core.action(s, "story_accept:"+quest)
assert not state(s)
s.story.quests["inazuma-moving-lantern"] = lua.table_from({
    "status":"complete", "count":6, "cycles":1,
    "lantern":{"inspected":{"box-leaf":True,"stone-shadow":True,"eaten-nuts":True}},
}, recursive=True)
s.story.visited["inazuma-port"] = True
fixture = checkpoint(s)
core.action(s, "story_accept:"+quest)
gate(s, 755, look, False)
collect(s, 372)
gate(s, 755, look)
gate(s, 2064, beach, False)
assert not len(s.enemies)
move(s, 616)
core.action(s, "story_collect")
assert state(s).count == 1
core.action(s, "jump")
tick(s, 55, jump=True)
assert s.actors[1].y == 395 and s.actors[1].ground
surveys = []
for x,y,expected in ((616,395,"partial"),(1040,307,"blocked"),(1608,414,"clear")):
    collect(s,x,y)
    read = frame(s).storySurveyMap
    surveys.append(read.status)
    assert read.status == expected
    assert bool(read.routes[2]) == (expected != "clear")
gate(s, 2064, beach)
gate(s, 896, town, False)
assert not len(s.enemies)
move(s, 300)
select(s,"color","wisteria")
assert not state(s).fireworkDesign
move(s, 475)
definition = next(row for row in core.frame(s).storyGraph.quests.values() if row.id == quest)
patterns = set()
for shape in definition.fireworks.shapes.values():
    select(s,"shape",shape.id)
    previews = []
    for color in definition.fireworks.colors.values():
        select(s,"color",color.id)
        preview = frame(s)
        assert preview.storyFireworkDesign.color == color.id and preview.storyFireworkDesign.shape == shape.id
        previews.append(tuple((draw.x,draw.y) for draw in preview.draws.values()
                              if draw.kind == "rect" and draw.color == color.bright))
    assert all(previews) and len(set(previews)) == 1
    patterns.add(previews[0])
assert len(patterns) == 3
select(s,"color","wisteria")
select(s,"shape","fan")
select(s,"shape","invalid")
assert native(state(s).fireworkDesign) == {"color":"wisteria","shape":"fan"}
collect(s,475)
assert phase(s) == "window"
core.action(s,"pause")
tick(s,140,right=True,attack=True)
assert phase(s) == "window" and s.actors[1].x == 475 and state(s).count == 4
core.action(s,"pause")
tick(s,108,right=True,attack=True)
assert phase(s) == "rise" and not s.hits
tick(s,60)
assert phase(s) == "burst"
assert native(frame(s).storyFireworkStatus.design) == {"color":"wisteria","shape":"fan"}
draft = checkpoint(s)
bad = deepcopy(draft)
bad["story"]["quests"][quest]["fireworkDesign"]["shape"]="illegal"
try:
    validate_save(bad)
except ValueError as error:
    assert "花火" in str(error)
else:
    raise AssertionError("Invalid shape survived save validation")
s = load(draft)
assert state(s).count == 4 and not s.fireworkShow
gate(s, 755, look)
gate(s, 2064, beach)
move(s,475)
assert frame(s).storyFireworkDesign.color == "wisteria"
assert frame(s).storyFireworkDesign.shape == "fan"

collect(s,475)
for _ in range(305):
    tick(s,1,right=True,attack=True)
    if not s.fireworkShow:
        break
assert state(s).count == 5 and not s.fireworkShow and s.actors[1].x == 475
gate(s,896,town)
before = (s.progression.questXp,s.mora)
core.action(s,"story_report:"+quest)
core.action(s,"story_report:"+quest)
reward = [s.progression.questXp-before[0],s.mora-before[1]]
assert reward == [QUEST_REPORT_EXP["Q-INA-S02"],850]
s = load(checkpoint(s))
gate(s,266,beach)
move(s,475)
select(s,"color","sea")
assert not frame(s).storyFireworkDesign
collect(s,475)
assert phase(s) == "window"
tick(s,175)
assert phase(s) == "burst" and frame(s).storyFireworkStatus.design.color == "wisteria"
assert frame(s).storyFireworkStatus.design.shape == "fan"
tick(s,160)
assert state(s).status == "complete" and s.mora == before[1]+reward[1]

result = {
    "prerequisite":True, "surveyStatuses":surveys, "peacefulMaps":True,
    "allNinePreviews":True, "windowRiseBurst":True, "pauseAndDraftResume":True, "invalidSelectionRejected":True,
    "onceOnlyReward":True, "savedDesignReplay":True, "reward":reward,
}
(ROOT/"evidence/ina-fireworks-lua.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
(ROOT/"work").mkdir(exist_ok=True)
(ROOT/"work/ina-fireworks-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(result)
