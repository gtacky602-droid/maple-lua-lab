import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
town,entry,trail,grove="nod-town","nod-bloom-gate","nod-bloom-trail","nod-bloom-grove"
quest,main="nod-moon-bloom","nod-first-treasure"
routes={q["id"]:q for q in json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))["quests"]}
advance=lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def frame(s,mode="sprite",profile="legacy"):
    return core.frame(s,mode,profile)


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True
    s.camera=max(0,min(x-400,s.worldwidth-960))


def gate(s,x,to,allowed=True,y=480):
    previous=s.story.node
    move(s,x,y)
    edge=frame(s).storyNearbyPortal
    assert edge and edge.to==to and edge.available==allowed, native(edge)
    core.action(s,"story_nearby_portal")
    assert s.story.node==(to if allowed else previous)


def inspect(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def jump(s,x,from_y,to_y):
    move(s,x,from_y)
    core.action(s,"jump")
    advance(core,s,60,lua.table_from({"jump":True}))
    assert s.actors[1].ground and s.actors[1].y==to_y


def strike(s,enemy):
    cast=dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=500,dir=1,radial=True,mult=1,
              range=24,limit=1,element="physical",gain=0,color="#ffe2bc",critRate=0)
    core.resolveCast(s,lua.table_from(cast))
    assert not enemy.hp


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def progress(s):
    return s.story.quests[quest]


s=core.new(12)
core.action(s,"story_start")
core.grantExp(s,LEVELS[119]["maple_reference_total_exp_to_reach"],"quest")
core.enterStoryNode(s,town)
gate(s,371,entry,False)
s.story.quests[main]=lua.table_from(dict(status="complete",count=5,cycles=1,storyChoice="fisher"))
for step in routes[main]["itinerary"]:
    s.story.visited[step["node"]]=True
fixture=checkpoint(s)
gate(s,371,entry)
gate(s,1090,trail,False)
gate(s,794,grove,False)
core.action(s,"story_accept:"+quest)
inspect(s,270)
gate(s,1090,trail)
gate(s,1485,grove,False)
assert len(s.enemies)==3
defeated=s.enemies[1].spawnId
strike(s,s.enemies[1])
s=restore(s)
assert s.story.node==entry and progress(s).count==1
gate(s,1090,trail)
assert len(s.enemies)==2 and all(e.spawnId!=defeated for e in s.enemies.values())
for enemy in list(s.enemies.values()):
    strike(s,enemy)
assert progress(s).count==2 and all(not e.hp for e in s.enemies.values())
gate(s,1485,grove)
assert not len(s.enemies) and not frame(s).storyBloom.opened
move(s,775)
assert len([d for d in frame(s).draws.values()
            if d.source=="nod-moon-bloom-wildlife-source-v1.png" and d.h in (30,38)])==2
assert any(d.source=="nod-moon-bloom-bud-source-v1.png" for d in frame(s).draws.values())
hits=s.hits
move(s,567)
advance(core,s,90,lua.table_from(dict(attack=True)))
assert s.hits==hits and not len(s.enemies)
inspect(s,315)
jump(s,526,480,386)
inspect(s,668,386)
s=restore(s)
assert s.story.node==entry and progress(s).count==4
gate(s,1090,trail)
assert not len(s.enemies)
gate(s,1485,grove)
assert all(d.source!="nod-moon-bloom-wildlife-source-v1.png" or d.h!=20 for d in frame(s).draws.values())
inspect(s,464)
assert progress(s).count==5 and frame(s).storyBloom.nearSeats
move(s,1018)
core.action(s,"story_collect")
assert progress(s).count==5 and not frame(s).storyBloom.opened
jump(s,526,480,386)
jump(s,874,386,290)
inspect(s,1018,290)
companion=s.actors[2]
companion.x,companion.y,companion.vy,companion.ground=447,480,0,True
advance(core,s,230,lua.table_from({}))
assert companion.ground and companion.y==290 and abs(companion.x-s.actors[1].x)<=75
f=frame(s)
assert f.storyBloom.opened and not f.storyBloom.decorated
assert {d.h for d in f.draws.values() if d.source=="nod-moon-bloom-plants-source-v1.png"}=={82,120}
assert all(d.source!="nod-moon-bloom-bud-source-v1.png" for d in f.draws.values())
inspect(s,1240,290)
assert frame(s).storyBloom.decorated
gate(s,1352,entry,y=290)
before=(s.progression.questXp,s.mora)
for _ in range(2):
    core.action(s,"story_report:"+quest)
after=(s.progression.questXp,s.mora)
reward=(QUEST_REPORT_EXP["Q-NOD-S04"],6800)
assert tuple(b-a for a,b in zip(before,after))==reward
s=restore(s)
gate(s,794,grove)
assert s.actors[1].y==290 and frame(s).storyBloom.decorated
s.actors[1].hp=s.actors[2].hp=51
for _ in range(2):
    inspect(s,1240,290)
assert all(a.hp==a.maxhp for a in s.actors.values())
assert (s.progression.questXp,s.mora)==after
gate(s,62,trail)
assert len(s.enemies)==3

proof=dict(m01Prerequisite=True,combatBeforeGrove=True,partialFightSaved=True,peacefulGrove=True,
           animalSpritesUnaffected=True,normalJumps=[386,290],companionClimbed=True,flowersAndFruitSaved=True,
           twoPerspectives=True,viewNeedsElevation=True,permanentDecoration=True,restHealsWithoutReward=True,
           replayableTrail=True,reportReward=reward)
(ROOT/"evidence/nod-moon-bloom-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/nod-moon-bloom-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
