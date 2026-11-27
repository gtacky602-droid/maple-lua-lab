import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,staging,slope,ledges,cleft,summit=(
    'natlan-hub','natlan-flag-staging','natlan-flag-slope','natlan-flag-ledges','natlan-flag-cleft','natlan-flag-summit')
quest='natlan-ridge-flag'
step=lua.eval('function(C,s,n,right,left,jump) for _=1,n do C.step(s,1/60,{right=right,left=left,jump=jump}) end end')


def frame(s):
    return core.frame(s,'sprite','legacy')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(saved):
    return core.restore(lua.table_from(saved,recursive=True),12)


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(s,x,destination,y=480,open=True):
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==destination and portal.available is open,(s.story.node,destination,native(portal))
    present=s.story.node
    core.action(s,'story_nearby_portal')
    assert s.story.node==(destination if open else present)


def collect(s,x,n,y=480):
    move(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[quest].count==n,(s.story.node,n,s.storyNotice)


def advance(s,n):
    step(core,s,n,False,False,False)


def walk(s,x):
    a=s.actors[1]
    for _ in range(400):
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


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
fixture=checkpoint(s)
core.action(s,'story_accept:'+quest)
gate(s,885,staging)
gate(s,880,slope,open=False)
collect(s,382,1)
assert s.flagTrial is None
prepared=checkpoint(s)

s=restore(prepared)
gate(s,880,slope)
assert len(s.enemies)==5
for x,y in [(445,480),(1445,391),*((a.x,a.y) for a in s.actors.values())]:
    assert all(abs(e.y-y)>=45 or x<=e.patrolMin-60 or x>=e.patrolMax+60 for e in s.enemies.values())
collect(s,445,2)
gate(s,1756,cleft,391,open=False)
move(s,842)
jump(s,844,391)
walk(s,1445)
collect(s,1445,3,391)
gate(s,1756,cleft,391)

s=restore(prepared)
gate(s,1316,ledges)
assert len(s.enemies)==1
move(s,402)
for _ in range(90):
    step(core,s,1,True,False,False)
    if '谷へ落ちた' in (s.storyNotice or ''):break
assert s.actors[1].x==360 and s.actors[1].y==480 and s.returns==0
walk(s,350)
jump(s,353,390)
walk(s,560)
collect(s,560,2,390)
saved=checkpoint(s)
assert slope not in saved['story']['visited']
staged=saved['story']['quests'][quest]
staged['flagBestTicks']=175
try:
    validate_save(saved)
except ValueError as e:
    assert '旗取り' in str(e)
else:
    raise AssertionError('active quest best time accepted')
del staged['flagBestTicks']
s=restore(saved)
assert s.story.node==staging
gate(s,1316,ledges)
walk(s,350);jump(s,352,390);walk(s,1007);jump(s,1009,302)
walk(s,1170);collect(s,1170,3,302)
walk(s,1450)
assert s.actors[1].y==302
gate(s,1452,cleft,302)
assert s.companion=='amber' and s.actors[1].y==391
move(s,754,391)
assert any(d.source=='kachina-idle-source-v2.png' for d in frame(s).draws.values())
collect(s,750,3,391)
advance(s,33)
progress=frame(s).storyFlagLowering.progress
assert 0<progress<1 and not any(p.raceBridge for p in s.platforms.values())
core.action(s,'pause')
advance(s,100)
assert frame(s).storyFlagLowering.progress==progress
core.action(s,'pause')
advance(s,44)
assert s.story.quests[quest].count==4 and any(p.raceBridge for p in s.platforms.values())
s=restore(checkpoint(s))
gate(s,1316,ledges)
gate(s,1452,cleft,302)
assert any(p.raceBridge for p in s.platforms.values())
walk(s,1560)
assert s.actors[1].y==391
gate(s,1580,summit,391)
move(s,1105,390)
advance(s,1)
assert any(d.source=='natlan-race-flag-source-v1.png' and d.h==121 for d in frame(s).draws.values())
assert frame(s).storySurveyMap.id=='natlan-two-flags'
collect(s,1105,5,390)
gate(s,1526,hub,390)

before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):core.action(s,'story_report:'+quest)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward=(QUEST_REPORT_EXP['Q-NAT-M01'],6200,4)
assert tuple(a-b for a,b in zip(after,before))==reward
done=checkpoint(s)
gate(s,885,staging)
collect(s,382,5)
gate(s,880,slope)
gate(s,1756,cleft,391)
gate(s,1580,summit,391)
collect(s,1105,5,390)
assert s.story.quests[quest].flagBestTicks is None and '二つ必要' in s.storyNotice
gate(s,1526,hub,390)
assert s.flagTrial is None

s=restore(done)
gate(s,885,staging)
collect(s,382,5)
gate(s,880,slope)
collect(s,445,5)
gate(s,55,staging)
gate(s,1316,ledges)
advance(s,120)
collect(s,1170,5,302)
assert s.flagTrial.count==2
gate(s,1452,cleft,302)
gate(s,1580,summit,391)
collect(s,1105,5,390)
assert s.story.quests[quest].flagBestTicks>=120 and s.flagTrial is None
assert '最短' in frame(s).storyFlagStatus
best=s.story.quests[quest].flagBestTicks
gate(s,1526,hub,390)
gate(s,885,staging)
collect(s,382,5)
core.action(s,'story_fast:'+summit)
assert s.story.node==summit and s.flagTrial is None and '拠点移動' in s.storyNotice
assert s.story.quests[quest].flagBestTicks==best
s=restore(checkpoint(s))
assert s.story.node==staging and s.story.quests[quest].flagBestTicks>=120
gate(s,56,hub)
gate(s,1227,summit)
collect(s,1105,5,390)
assert s.storyNotice.startswith('頂上の記録')
gate(s,810,'natlan-field')

proof=dict(level100=True,bothRoutesAndDifferentEnemyCounts=True,ordinaryJumps=True,safeLedgeFall=True,canSwitchRoutes=True,
           alternateCheckpointPassesSaveValidation=True,cleftLockedUntilBothStamps=True,noMandatoryTimer=True,
           kachinaLowersPhysicalBridgeWithoutJoining=True,bridgeAfterReload=True,viewAndRewardOnce=True,
           trialRejectsMissingStamps=True,fastTravelCancelsTrial=True,optionalBestTimeSurvivesReload=True,shortcutAndExistingHunt=True,
           reward=reward)
(ROOT/'evidence/natlan-flag-course-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/natlan-flag-course-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
