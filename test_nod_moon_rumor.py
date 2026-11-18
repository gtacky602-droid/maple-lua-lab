import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
town, quay, ledge = "nod-town", "nod-rumor-quay", "nod-rumor-ledge"
quest = "nod-moon-rumor"
routes = {q["id"]: q for q in json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))["quests"]}


def frame(s):
    return core.frame(s, "sprite", "legacy")


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data, recursive=True), 12)


def move(s, x):
    a = s.actors[s.active]
    a.x, a.y, a.ground, a.vy = x, 480, True, 0
    s.camera = max(0, min(x-400, s.worldwidth-960))


def gate(s, x, node, allowed=True):
    previous = s.story.node
    move(s, x)
    edge = frame(s).storyNearbyPortal
    assert edge and edge.to==node and edge.available==allowed, native(edge)
    core.action(s, "story_nearby_portal")
    assert s.story.node==(node if allowed else previous)


def speak(s, x):
    move(s, x)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def progress(s):
    return s.story.quests[quest]


s = core.new(12)
core.action(s, "story_start")
core.grantExp(s, LEVELS[119]["maple_reference_total_exp_to_reach"], "quest")
core.enterStoryNode(s, town)
gate(s, 1039, quay, False)
for id in ("nod-first-treasure", "nod-moon-crossroads"):
    q = routes[id]
    state = dict(status="complete", count=q["goal"], cycles=1)
    if id=="nod-first-treasure":
        state["storyChoice"]="fisher"
    else:
        state["pathProgress"]={"wood":{"count":2}, "coast":{"count":0}}
        for step in q["paths"][0]["steps"]:
            s.story.visited[step["node"]]=True
    for step in q["itinerary"]:
        s.story.visited[step["node"]]=True
    s.story.quests[id]=lua.table_from(state, recursive=True)
fixture = checkpoint(s)
gate(s, 1039, quay)
core.action(s, "story_accept:"+quest)
speak(s, 242)
gate(s, 1470, ledge, False)
move(s,963)
core.action(s,"story_collect")
assert progress(s).count==1
speak(s,510)
assert "小石" in s.storyNotice
speak(s,738)
assert "月みたいな石" in s.storyNotice
s=restore(checkpoint(s))
assert s.story.node==quay and frame(s).storyRumor.heard==2
speak(s,963)
assert "月から取った石" in s.storyNotice
move(s,755)
assert sum(d.source=="nod-rumor-boards-source-v1.png" for d in frame(s).draws.values())==3
assert sum(d.source=="nod-rumor-witnesses-source-v1.png" for d in frame(s).draws.values())==3
speak(s,510)
assert "舟守" in s.storyNotice and progress(s).count==4
gate(s,1470,ledge)
assert len(s.enemies)==0

move(s,470)
assert frame(s).storyReflection.orientation=="未調整"
core.action(s,"story_reflection_confirm")
assert progress(s).count==4
speak(s,470)
assert frame(s).storyReflection.orientation=="波打ち際"
core.action(s,"story_reflection_light")
core.action(s,"story_reflection_light")
core.action(s,"story_reflection_confirm")
assert progress(s).count==4
speak(s,470)
assert frame(s).storyReflection.orientation=="現物の石"
core.action(s,"story_reflection_confirm")
assert progress(s).count==4
core.action(s,"story_reflection_light")
dark=frame(s)
assert not dark.storyReflection.lit and "灰色" in dark.storyReflection.image
core.action(s,"story_reflection_confirm")
assert progress(s).count==4
core.action(s,"story_reflection_light")
lit=frame(s)
assert lit.storyReflection.lit and "縁だけ" in lit.storyReflection.image
assert lit.commands>dark.commands and lit.t==dark.t
core.action(s,"story_reflection_confirm")
assert progress(s).count==5 and frame(s).storyReflection.replay
gate(s,62,quay)
post_reflection=checkpoint(s)

titles=[]
reward=(QUEST_REPORT_EXP["Q-NOD-S03"],5400)
for option in routes[quest]["itinerary"][-1]["choices"]:
    s=restore(post_reflection)
    assert s.story.node==quay and progress(s).count==5
    speak(s,option["x"])
    assert progress(s).count==6 and progress(s).storyChoice==option["id"]
    assert not frame(s).storyRumor.published
    before=(s.progression.questXp,s.mora)
    for _ in range(2):
        core.action(s,"story_report:"+quest)
    after=(s.progression.questXp,s.mora)
    assert tuple(b-a for a,b in zip(before,after))==reward
    s=restore(checkpoint(s))
    speak(s,242)
    assert frame(s).storyRumor.published==option["name"] and option["name"] in s.storyNotice
    titles.append(option["name"])
    gate(s,1470,ledge)
    move(s,470)
    assert frame(s).storyReflection.replay and frame(s).storyReflection.orientation=="現物の石"
    core.action(s,"story_reflection_light")
    assert not frame(s).storyReflection.lit and progress(s).count==6

proof=dict(m02Prerequisite=True,threeEscalatingRumors=True,threeBoards=True,threeWitnessSprites=True,readback=True,
           witnessesSaved=True,wrongAimRejected=True,darkAndLightRequired=True,replayAfterReport=True,
           titles=titles,firstReportReward=reward)
(ROOT/"evidence/nod-moon-rumor-lua.json").write_text(json.dumps(proof,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
(ROOT/"work/nod-moon-rumor-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
