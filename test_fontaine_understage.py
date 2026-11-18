import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core=runtime()
hub,loft,wings,catwalk,workfloor,store,rehearsal=(
    'fontaine-hub','fontaine-moon-fly-loft','fontaine-stage-wings','fontaine-lift-catwalk',
    'fontaine-understage-workfloor','fontaine-parcel-storeroom','fontaine-rehearsal-room')
first,quest='fontaine-moon-parcel','fontaine-understage-crew'
step=lua.eval('function(C,s,n,right,left,jump) for _=1,n do C.step(s,1/60,{right=right,left=left,jump=jump}) end end')


def frame(s,mode='sprite'):
    return core.frame(s,mode,'legacy')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def move(s,x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def gate(s,x,node,y=480,ride=False):
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==node and portal.available,(s.story.node,node,native(portal))
    old=s.story.node
    core.action(s,'story_nearby_portal')
    if ride:
        assert s.story.node==old and frame(s).storyLift.seconds==1.74
        step(core,s,52,False,False,False)
        assert 300<s.actors[1].y<480 and s.actors[1].x==525
        step(core,s,60,False,False,False)
    assert s.story.node==node


def collect(s,x,count,y=480,action='story_collect'):
    move(s,x,y)
    core.action(s,action)
    assert s.story.quests[quest].count==count,(s.story.node,count,s.storyNotice)


def walk(s,x):
    a=s.actors[1]
    for _ in range(300):
        if abs(a.x-x)<=4:return
        step(core,s,1,a.x<x,a.x>x,False)
    raise AssertionError((x,a.x,a.y))


def jump(s,x,y):
    a=s.actors[1]
    core.action(s,'jump')
    for _ in range(80):
        dx=x-a.x
        step(core,s,1,dx>4,dx<-4,True)
        if a.ground and a.y==y and abs(a.x-x)<8:return
    raise AssertionError((x,y,a.x,a.y))


def defeat(s,enemy):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=1200,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0)))


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
core.action(s,'story_accept:'+quest)
assert s.story.quests[quest] is None
s.story.quests[first]=lua.table_from(dict(status='complete',count=7,cycles=1))
for node in ('fontaine-parcel-counter','fontaine-delivery-quay','fontaine-old-scenery-door',loft,hub):
    core.enterStoryNode(s,node)
fixture=checkpoint(s)
core.action(s,'story_accept:'+quest)
gate(s,995,loft)
gate(s,1110,wings)
assert len(s.platforms)==2 and s.theaterShutter is not None
move(s,909)
step(core,s,60,True,False,False)
assert s.actors[1].x<=938
collect(s,366,1)
assert s.theaterFlatsAt==s.t
collect(s,866,2)
assert len(s.platforms)==4 and s.theaterShutter is None
s=restore(s)
gate(s,995,loft)
gate(s,1110,wings)
assert len(s.platforms)==4 and s.theaterShutter is None
walk(s,861)
jump(s,870,400)
walk(s,1058)
jump(s,1060,321)
walk(s,1423)
gate(s,1428,catwalk,321)
gate(s,525,workfloor,300,ride=True)
gate(s,525,catwalk,ride=True)
gate(s,525,workfloor,300,ride=True)

move(s,552)
assert not frame(s).storyTheaterWave.raised and s.theaterWaveWall is None
hp=s.actors[1].hp
step(core,s,299,False,False,False)
assert s.actors[1].hp<hp
collect(s,552,2)
assert frame(s).storyAirflow.selection=='板を寝かせる'
collect(s,552,2,action='story_airflow_commit')
collect(s,552,2)
collect(s,552,3,action='story_airflow_commit')
assert s.theaterWaveWall.x==638 and frame(s).storyTheaterWave.raised
assert any(d.source=='stage-wave-source-v1.png' and d.h==94 for d in frame(s).draws.values())
hp=s.actors[1].hp
furthest_left=2000
for _ in range(360):
    step(core,s,1,False,False,False)
    for projectile in s.projectiles.values():
        furthest_left=min(furthest_left,projectile.x)
assert 703<furthest_left<720 and s.actors[1].hp==hp
walk(s,621)
jump(s,760,390)
for enemy in list(s.enemies.values()):
    if enemy.hp>0:defeat(s,enemy)
assert s.story.quests[quest].count==4
gate(s,1590,store)
collect(s,292,5)
collect(s,534,6)
s=restore(s)
assert s.story.node==store and s.story.quests[quest].count==6
collect(s,833,7,390)
collect(s,1008,7)
assert frame(s).storyAirflow.selection=='受領の前に盗まれた'
collect(s,1008,7,action='story_airflow_commit')
collect(s,1008,7)
collect(s,1008,8,action='story_airflow_commit')
collect(s,1162,9)
gate(s,1247,rehearsal)
collect(s,764,10)
gate(s,1264,hub)
before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):core.action(s,'story_report:'+quest)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward=(QUEST_REPORT_EXP['Q-FON-M02'],3900,4)
assert tuple(a-b for a,b in zip(after,before))==reward
s=restore(s)
gate(s,1240,rehearsal)
collect(s,764,10)
assert s.storyNotice.startswith('稽古場の記録')
gate(s,55,store)
gate(s,56,workfloor)
assert len(s.enemies)==0 and s.theaterWaveWall is not None
move(s,560)
step(core,s,360,False,False,False)
assert not list(s.projectiles.values())

data=dict(requiresFirstQuest=True,physicalCurtain=True,slidingFlats=True,stairsPersist=True,normalJumps=True,
          animatedLiftRoundTrip=True,flatWaveAllowsHit=True,raisedWaveBlocksRealProjectile=True,
          wrongPosturesAndTheftRejected=True,storeCheckpoint=True,evidenceAndDispatch=True,
          rehearsalAfterReload=True,clearedFloorSafeOnReturn=True,oneTimeReport=True,reward=reward)
(ROOT/'evidence/fontaine-understage-lua.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/fontaine-understage-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(data)
