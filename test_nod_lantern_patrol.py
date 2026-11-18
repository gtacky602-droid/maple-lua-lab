import json
import math

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
town,cabin,shore,bend,post="nod-town","nod-patrol-cabin","nod-patrol-shore","nod-patrol-bend","nod-patrol-post"
quest,shooter="nod-lantern-patrol","nod-patrol-bend-slinger"
routes={q["id"]:q for q in json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))["quests"]}
advance=lua.eval("function(C,s,n,keys) for _=1,n do C.step(s,1/60,keys) end end")


def frame(s):
    return core.frame(s,"sprite","legacy")


def step(s,n,**keys):
    advance(core,s,n,lua.table_from(keys))


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True
    s.camera=max(0,min(x-400,s.worldwidth-960))


def gate(s,x,node,available=True):
    origin=s.story.node
    move(s,x)
    edge=frame(s).storyNearbyPortal
    assert edge and edge.to==node and edge.available==available,native(edge)
    core.action(s,"story_nearby_portal")
    assert s.story.node==(node if available else origin)


def inspect(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def jump(s,x,from_y,to_y):
    move(s,x,from_y)
    core.action(s,"jump")
    step(s,60,jump=True)
    assert s.actors[s.active].ground and s.actors[s.active].y==to_y


def defeat(s,enemy):
    cast=dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=500,dir=1,radial=True,mult=1,
              range=24,limit=1,element="physical",gain=0,color="#ffe6bd",critRate=0)
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
gate(s,550,cabin,False)
for id in ("nod-first-treasure","nod-moon-crossroads"):
    route=routes[id]
    record=dict(status="complete",count=route["goal"],cycles=1)
    if id=="nod-first-treasure":
        record["storyChoice"]="fisher"
    else:
        record["pathProgress"]={"wood":{"count":2},"coast":{"count":0}}
        for task in route["paths"][0]["steps"]:
            s.story.visited[task["node"]]=True
    for task in route["itinerary"]:
        s.story.visited[task["node"]]=True
    s.story.quests[id]=lua.table_from(record,recursive=True)
fixture=checkpoint(s)
gate(s,550,cabin)
core.action(s,"story_accept:"+quest)
gate(s,987,post,False)
inspect(s,318)
assert not frame(s).storyPatrol
gate(s,1170,shore)
assert not len(s.enemies)
gate(s,1470,bend,False)
inspect(s,340)
move(s,1118)
core.action(s,"story_collect")
assert progress(s).count==2
jump(s,640,480,386)
inspect(s,1118,386)
gate(s,1470,bend)
assert len(s.enemies)==4 and frame(s).storyPatrol.shooterAlive
gate(s,1720,post,False)
move(s,800,386)
s.actors[2].x=380
step(s,1)
shot=s.storyPatrolShot
warning=frame(s).storyPatrol.warning
assert warning and warning.x==shot.tx and warning.y==shot.ty and warning.seconds>0
assert any(d.text=="投石の予兆" and d.y for d in frame(s).draws.values())
core.action(s,"pause")
step(s,60)
assert frame(s).storyPatrol.warning.seconds==warning.seconds
core.action(s,"pause")
move(s,765,480)
hp=s.actors[1].hp
step(s,52)
p=s.projectiles[1]
assert p and p.color=="#ffcf88" and p.homingTime==0
assert math.isclose(p.angle,math.atan2(shot.ty-shot.y,shot.tx-shot.x),abs_tol=1e-6)
step(s,40)
assert s.actors[1].hp==hp
move(s,800,386)
for _ in range(240):
    step(s,1)
    if s.actors[1].hp<hp:
        break
assert hp-s.actors[1].hp==12

jump(s,616,480,386)
jump(s,905,386,290)
move(s,1015,290)
high=next(e for e in s.enemies.values() if e.spawnId==shooter)
assert high.y==290
defeat(s,high)
step(s,1)
overlook=frame(s).storyPatrol
assert not overlook.shooterAlive and overlook.lookout and overlook.ground==3 and not overlook.warning
s=restore(s)
assert s.story.node==cabin and progress(s).count==3 and not s.storyPatrolShot and not len(s.projectiles or ())
gate(s,1170,shore)
gate(s,1470,bend)
assert len(s.enemies)==3 and all(e.spawnId!=shooter for e in s.enemies.values())
for foe in list(s.enemies.values()):
    defeat(s,foe)
assert progress(s).count==4
gate(s,1720,post)
assert not len(s.projectiles or ()) and not len(s.enemies)
gate(s,1019,cabin,False)
ore=s.inventory.upgradeOre
inspect(s,410)
assert s.inventory.upgradeOre-ore==5
core.action(s,"story_collect")
assert s.inventory.upgradeOre-ore==5
gate(s,1019,cabin)
assert frame(s).storyPatrol.tea
inspect(s,756)
before=(s.progression.questXp,s.mora)
for _ in range(2):
    core.action(s,"story_report:"+quest)
after=(s.progression.questXp,s.mora)
reward=(QUEST_REPORT_EXP["Q-NOD-S05"],8400)
assert tuple(b-a for a,b in zip(before,after))==reward
s=restore(s)
assert s.story.node==cabin and frame(s).storyPatrol.tea
s.actors[1].hp,s.actors[2].hp=58,76
inspect(s,756)
assert all(a.hp==a.maxhp for a in s.actors.values())
assert (s.progression.questXp,s.mora)==after
gate(s,987,post)
gate(s,62,bend)
assert frame(s).storyPatrol.shooterAlive and len(s.enemies)==4

proof=dict(m02Prerequisite=True,bothSignposts=True,normalJumps=[386,290],visibleFixedWarning=True,
           pauseFreezesWarning=True,projectileEvaded=True,standingHitDamage=12,highGroundSurvey=True,partialClearSaved=True,
           connectedShortcuts=True,oneOreGrant=5,reportReward=reward,revisitAndRest=True,practiceAfterReport=True)
(ROOT/"evidence/nod-lantern-patrol-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/nod-lantern-patrol-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
