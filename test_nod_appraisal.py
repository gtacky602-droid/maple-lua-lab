from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
town, workshop, yard = "nod-town", "nod-appraisal-workshop", "nod-appraisal-yard"
prerequisite, quest = "nod-first-treasure", "nod-treasure-appraisal"
routes = {q["id"]: q for q in json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))["quests"]}
run = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def frame(s, mode="sprite", profile="legacy"):
    return core.frame(s, mode, profile)


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True
    s.camera = max(0, min(x-400, s.worldwidth-960))


def gate(s, x, to, allowed=True):
    previous = s.story.node
    move(s, x)
    edge = frame(s).storyNearbyPortal
    assert edge and edge.to==to and edge.available==allowed, native(edge)
    core.action(s, "story_nearby_portal")
    assert s.story.node == (to if allowed else previous)


def interact(s, x, y=480):
    move(s, x, y)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def progress(s):
    return s.story.quests[quest]


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s), recursive=True), 12)


def reject(s, key, value):
    saved = deepcopy(checkpoint(s))
    saved["story"]["quests"][quest]["appraisal"][key] = value
    try:
        validate_save(saved)
    except ValueError as error:
        assert "不正" in str(error)
    else:
        raise AssertionError(key)


s = core.new(12)
core.action(s, "story_start")
core.grantExp(s, LEVELS[119]["maple_reference_total_exp_to_reach"], "quest")
core.enterStoryNode(s, town)
gate(s,286,workshop,False)
previous = routes[prerequisite]
s.story.quests[prerequisite] = lua.table_from(dict(status="complete",count=5,cycles=1,storyChoice="fisher"))
for step in previous["itinerary"]:
    s.story.visited[step["node"]] = True
fixture = checkpoint(s)
gate(s,286,workshop)
assert any(d.source=="nod-appraisal-equipment-source-v1.png" for d in frame(s).draws.values())
core.action(s,"story_accept:"+quest)
gate(s,1575,yard,False)
interact(s,430)
gate(s,1575,yard)
assert len(s.enemies)==3
assert frame(s).storyAppraisal.collected==0

# The upper item can be reached with a regular jump and collected first.
move(s,1215)
core.action(s,"jump")
run(core,s,60,lua.table_from({"jump":True}))
assert s.actors[1].ground and s.actors[1].y==382
interact(s,1215,382)
core.action(s,"story_collect")
assert progress(s).count==1 and progress(s).appraisal.gathered.stone
assert frame(s).storyAppraisal.collected==1
reject(s,"gathered",{"reef":True})
reject(s,"measured",1)
s=restore(s)
gate(s,1575,yard)
assert frame(s).storyAppraisal.collected==1
interact(s,825)
interact(s,420)
assert progress(s).count==2 and frame(s).storyAppraisal.collected==3
gate(s,62,workshop)

interact(s,430)
assert progress(s).count==2 and frame(s).storyAppraisal.measured==1
s=restore(s)
assert s.story.node==workshop and frame(s).storyAppraisal.measured==1
interact(s,430)
assert "荷重には弱い" in frame(s).storyAppraisal.message
interact(s,430)
assert progress(s).count==3 and frame(s).storyAppraisal.item=="gear"
stock=(s.mora,s.inventory.upgradeOre,s.progression.questXp)
interact(s,991)
assert frame(s).storyAppraisal.sorted==0 and "規格" in s.storyNotice
assert stock==(s.mora,s.inventory.upgradeOre,s.progression.questXp)
interact(s,761)
assert frame(s).storyAppraisal.item=="plate"
interact(s,761)
assert frame(s).storyAppraisal.sorted==1 and "薄すぎます" in s.storyNotice
reject(s,"sorted",3)
reject(s,"measured",2)
s=restore(s)
assert frame(s).storyAppraisal.item=="plate"
interact(s,1224)
interact(s,991)
assert progress(s).count==4 and frame(s).storyAppraisal.sorted==3 and not frame(s).storyAppraisal.lamp
core.action(s,"story_report:"+quest)
assert progress(s).status=="active"
interact(s,1432)
assert progress(s).count==5 and frame(s).storyAppraisal.lamp
assert "持ち主が気に入っています" in frame(s).storyAppraisal.message
before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2): core.action(s,"story_report:"+quest)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward=(QUEST_REPORT_EXP["Q-NOD-S02"],4100,6)
assert tuple(a-b for a,b in zip(after,before))==reward
s=restore(s)
interact(s,1432)
finished=frame(s)
assert finished.storyAppraisal.lamp and "持ち主が気に入っています" in s.storyNotice
assert sum(d.source=="nod-appraisal-equipment-source-v1.png" and d.h==68 for d in finished.draws.values())==1
gate(s,1575,yard)
assert len(s.enemies)==3 and not any(d.source=="nod-appraisal-parts-source-v1.png" for d in frame(s).draws.values())

proof=dict(prerequisite=True,partsAnyOrder=True,upperPartNormalJump=True,partialCollectionSaved=True,
           measurementsSaved=True,thinPlateReading=True,retryWithoutLoss=True,sortingSaved=True,
           inconsistentSavesRejected=True,lamplitAfterRevisit=True,reportOnce=True,yardRemainsPlayable=True,reward=reward)
(ROOT/"evidence/nod-appraisal-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/nod-appraisal-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
