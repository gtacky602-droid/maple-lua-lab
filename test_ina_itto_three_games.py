from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
quest,town,field="ina-itto-three-games","inazuma-town","ina-festival-games"
advance=lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")
graph=json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))
spec=next(node["ittoGames"] for node in graph["nodes"] if node["id"]==field)


def tick(s,n=1,**input):
    advance(core,s,n,lua.table_from(input))


def frame(s):
    return core.frame(s,"sprite","legacy")


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground,a.dir=x,y,0,True,1


def gate(s,x,to,allowed=True):
    move(s,x)
    near=frame(s).storyNearbyPortal
    assert near and near.to==to and near.available is allowed,native(near)
    before=s.story.node
    core.action(s,"story_nearby_portal")
    assert s.story.node==(to if allowed else before)


def collect(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def record(s):
    return s.story.quests[quest]


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def begin(s):
    core.action(s,"story_accept:"+quest)
    gate(s,828,field,False)
    collect(s,681)
    gate(s,828,field)


def start(s,index):
    collect(s,174)
    assert frame(s).storyIttoGames.round==index


def exam(s):
    return (s.kills,s.mora,s.progression.questXp,s.progression.killXp)


def report(s):
    gate(s,56,town)
    before=(s.progression.questXp,s.mora)
    core.action(s,"story_report:"+quest)
    core.action(s,"story_report:"+quest)
    return [s.progression.questXp-before[0],s.mora-before[1]]


def wait_out(s,index):
    tick(s,60*(spec["seconds"][index-1]+1))
    assert not s.ittoRound


s=core.new(12)
core.action(s,"story_start")
core.grantExp(s,LEVELS[39]["maple_reference_total_exp_to_reach"],"quest")
core.enterStoryNode(s,town)
core.action(s,"story_accept:"+quest)
assert not record(s)
s.story.visited["inazuma-port"]=True
for id,count,state in (
    ("inazuma-moving-lantern",6,{"lantern":{"inspected":{"box-leaf":True,"stone-shadow":True,"eaten-nuts":True}}}),
    ("inazuma-torii-maze",5,{"forest":{"looped":True,"defeated":{f"inazuma-thicket-{i}":True for i in range(1,4)}}}),
):
    s.story.quests[id]=lua.table_from(dict(status="complete",count=count,cycles=1,**state),recursive=True)
fixture=checkpoint(s)
begin(s)
assert not core.canAttack(s)
start(s,1)
move(s,431)
tick(s)
assert s.ittoRound.player==0
core.action(s,"pause")
remaining=frame(s).storyIttoGames.remaining
tick(s,180)
assert frame(s).storyIttoGames.remaining==remaining
core.action(s,"pause")
for flag in spec["flags"]:
    move(s,flag["x"],flag["y"])
    tick(s)
assert record(s).count==2 and record(s).ittoContest.last[1].player==5
s=load(checkpoint(s))
gate(s,828,field)
assert frame(s).storyIttoGames.next==2

s.actors[2].hp=0
start(s,2)
assert len(s.enemies)==6 and core.canAttack(s)
assert all(e.noRewards and e.custom for e in s.enemies.values())
before=exam(s)
move(s,310)
core.action(s,"normal")
assert sum(e.hp<=0 for e in s.enemies.values())>=2
tick(s,84,attack=True)
move(s,626,399)
tick(s,135,attack=True)
assert record(s).count==3 and record(s).ittoContest.last[2].player==6
assert exam(s)==before and not len(s.enemies) and not core.canAttack(s)

start(s,3)
move(s,347)
core.action(s,"story_collect")
assert s.ittoRound.own.points==0
for mark in spec["relay"]["marks"]:
    move(s,mark["x"])
    for _ in range(180):
        if s.ittoRound.own.at:
            break
        tick(s)
    assert frame(s).storyIttoGames.helpReady
    core.action(s,"story_collect")
    tick(s)
assert record(s).count==4 and record(s).ittoContest.best==3
assert frame(s).storyIttoGames.title=="荒瀧三番勝負・全勝"
assert "お前の勝ち" in frame(s).storyNotice
bad=deepcopy(checkpoint(s))
bad["story"]["quests"][quest]["ittoContest"]["last"][1]["player"]=7
try:
    validate_save(bad)
except ValueError as error:
    assert "三番勝負" in str(error)
else:
    raise AssertionError("Invalid round score was accepted")
reward=report(s)
assert reward==[QUEST_REPORT_EXP["Q-INA-S04"],1550]
first=checkpoint(s)
s=load(first)
gate(s,828,field)
assert frame(s).storyIttoGames.title and frame(s).storyIttoGames.next==1
start(s,1)
wait_out(s,1)
assert frame(s).storyIttoGames.next==2 and record(s).ittoContest.series==1
s=load(checkpoint(s))
gate(s,828,field)
assert frame(s).storyIttoGames.next==1
s.actors[2].hp=0
before=exam(s)
for index in (1,2,3):
    start(s,index)
    wait_out(s,index)
assert record(s).ittoContest.series==2 and record(s).ittoContest.best==3
assert all(row.player<row.rival for row in record(s).ittoContest.last.values())
assert exam(s)==before and "俺たちの勝ち" in frame(s).storyNotice
assert report(s)==[0,0]
checkpoint(s)

s=load(fixture)
begin(s)
s.actors[2].hp=0
for index in (1,2,3):
    start(s,index)
    wait_out(s,index)
assert record(s).ittoContest.best==0 and record(s).count==4
assert report(s)==reward

proof={
    "prerequisite":True,"flagHeightAndPause":True,"partialRoundResultsRestore":True,
    "multiTargetNormal":True,"trainingIsRewardless":True,"manualRelaySupport":True,
    "winningAndLosingSameReward":True,"partialReplayDoesNotReplaceRecord":True,
    "replayTitleRemains":True,"forgedScoreRejected":True,"reward":reward,
}
(ROOT/"evidence/ina-itto-games-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work").mkdir(exist_ok=True)
(ROOT/"work/ina-itto-games-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
