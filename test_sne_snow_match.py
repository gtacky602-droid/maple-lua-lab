import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
quest,station,arena="sne-snow-match-quest","white-pass-station","sne-snow-match"
routes={q["id"]:q for q in json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))["quests"]}
advance=lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def frame(s):
    return core.frame(s,"sprite","legacy")


def run(s,n,**keys):
    advance(core,s,n,lua.table_from(keys))


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.dir,a.ground=x,y,0,1,True


def inspect(s,x):
    move(s,x)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def gate(s,x,to,available=True):
    previous=s.story.node
    move(s,x)
    edge=frame(s).storyNearbyPortal
    assert edge and edge.to==to and edge.available==available,native(edge)
    core.action(s,"story_nearby_portal")
    assert s.story.node==(to if available else previous)


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(save):
    return core.restore(lua.table_from(save,recursive=True),12)


def prepare(s):
    core.action(s,"story_accept:"+quest)
    inspect(s,327)
    gate(s,724,arena)
    inspect(s,178)
    assert progress(s).count==2


def progress(s):
    return s.story.quests[quest]


def report(s):
    gate(s,57,station)
    before=(s.progression.questXp,s.mora)
    core.action(s,"story_report:"+quest)
    core.action(s,"story_report:"+quest)
    return s.progression.questXp-before[0],s.mora-before[1]


s=core.new(12)
core.action(s,"story_start")
core.grantExp(s,LEVELS[147]["maple_reference_total_exp_to_reach"],"quest")
core.enterStoryNode(s,station)
core.action(s,"story_accept:"+quest)
assert not progress(s)
gate(s,724,arena,False)
for id in ("white-pass-ticket","white-pass-trail"):
    q=routes[id]
    s.story.quests[id]=lua.table_from(dict(status="complete",count=q["goal"],cycles=1))
    s.story.visited[q["hub"]]=True
    for step in q["itinerary"]:
        s.story.visited[step["node"]]=True
fixture=checkpoint(s)
prepare(s)
round_save=checkpoint(s)
xp0,mora0=s.progression.questXp,s.mora
hp=[a.hp for a in s.actors.values()]
inspect(s,178)
assert frame(s).storySnowball.running
initial_active=s.active
core.action(s,"skill1")
core.action(s,"auto")
core.action(s,"swap")
assert not len(s.pending) and not s.auto and s.active==initial_active and not core.canAttack(s)
core.action(s,"normal")
run(s,42)
assert frame(s).storySnowball.blocked==1 and s.snowballRound.score[1]==0
core.action(s,"pause")
elapsed=frame(s).storySnowball.remaining
run(s,120,attack=True)
assert frame(s).storySnowball.remaining==elapsed and not len(s.snowballRound.balls)
core.action(s,"pause")
move(s,385)
core.action(s,"jump")
run(s,60,jump=True)
assert s.actors[1].y==398 and s.actors[1].ground
run(s,34,attack=True)
assert frame(s).storySnowball.flagHits==1
move(s,667)
run(s,45,attack=True)
assert frame(s).storySnowball.flagHits==2
move(s,738)
run(s,52,attack=True)
assert s.snowballRound.ownHits>0 and s.snowballRound.collapsed
run(s,140,attack=True)
assert not s.snowballRound and progress(s).count==3 and progress(s).snowMatchRecord.wins==1
assert progress(s).snowMatchRecord.best==5 and "次も" in s.storyNotice
assert not len(s.pending) and s.actors[1].lock==0
assert [a.hp for a in s.actors.values()]==hp and (s.progression.questXp,s.mora)==(xp0,mora0)
reward=(QUEST_REPORT_EXP["Q-SNE-S05"],12600)
assert report(s)==reward
s=restore(checkpoint(s))
gate(s,724,arena)
assert frame(s).storySnowball.record.wins==1
inspect(s,178)
run(s,5,attack=True)
interrupted=restore(checkpoint(s))
assert not interrupted.snowballRound and progress(interrupted).snowMatchRecord.wins==1
gate(s,57,station)
assert not s.snowballRound and progress(s).snowMatchRecord.wins==1

loser=restore(round_save)
gate(loser,724,arena)
inspect(loser,178)
move(loser,685)
seen=set()
for _ in range(2400):
    if not loser.snowballRound:
        break
    run(loser,1)
    warning=loser.snowballRound and loser.snowballRound.wind
    if warning:
        seen.add("feint" if warning.fake else "throw")
assert not loser.snowballRound and progress(loser).snowMatchRecord.losses==1
assert seen=={"feint","throw"} and "次は高い旗" in loser.storyNotice
assert report(loser)==reward
gate(loser,724,arena)
inspect(loser,178)
move(loser,738)
run(loser,320,attack=True)
assert progress(loser).snowMatchRecord.wins==1 and progress(loser).snowMatchRecord.losses==1
assert report(loser)==(0,0)
invalid=checkpoint(loser)
invalid["story"]["quests"][quest]["snowMatchRecord"]["player"]=99
try:
    validate_save(invalid)
except ValueError as error:
    assert "得点記録" in str(error)
else:
    raise AssertionError("Invalid score accepted")

proof=dict(prerequisite=True,blockedBySnow=True,twoFlags=True,personHit=True,coverFalls=True,feintAndThrow=True,
           regularAttacksBlocked=True,pausesRound=True,noHpDamage=True,winAndLossEqualReward=True,
           replayNoReward=True,winsAndLossesPersist=True,unfinishedRoundNotRecorded=True,reward=reward)
(ROOT/"evidence/sne-snow-match-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/sne-snow-match-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
