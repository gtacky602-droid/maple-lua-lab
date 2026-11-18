import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, counter, quay, hall, loft = (
    'fontaine-hub','fontaine-parcel-counter','fontaine-delivery-quay',
    'fontaine-old-scenery-door','fontaine-moon-fly-loft')
quest = 'fontaine-moon-parcel'
step = lua.eval('function(C,s,n,right) for _=1,n do C.step(s,1/60,{right=right}) end end')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def frame(s):
    return core.frame(s,'sprite','legacy')


def near_gate(s, x, destination, y=480):
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==destination and portal.available,(s.story.node,destination,native(portal))
    core.action(s,'story_nearby_portal')
    assert s.story.node==destination


def inspect(s,x,count,y=480,action='story_collect'):
    move(s,x,y)
    core.action(s,action)
    assert s.story.quests[quest].count==count,(s.story.node,count,s.storyNotice)


def defeat(s,enemy):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=1200,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0)))


def from_save(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
fixture=checkpoint(s)
core.action(s,'story_accept:'+quest)
near_gate(s,855,counter)
inspect(s,320,1)
near_gate(s,1180,quay)
assert frame(s).storyTheaterCart.phase=='waiting'
move(s,1640)
step(core,s,90,True)
assert s.actors[1].x<=1688 and s.theaterShutter is not None
move(s,1820)
assert frame(s).storyNearbyPortal is None
inspect(s,508,2)
inspect(s,900,3)
inspect(s,1038,3)
assert frame(s).storyAirflow.selection=='水路に沈んだ'
inspect(s,1038,3,action='story_airflow_commit')
inspect(s,1038,3)
assert frame(s).storyAirflow.selection=='今の倉庫へ運んだ'
inspect(s,1038,3,action='story_airflow_commit')
inspect(s,1038,3)
inspect(s,1038,4,action='story_airflow_commit')

inspect(s,1178,4)
assert frame(s).storyTheaterCart.phase=='starting'
assert any(d.source=='parcel-meka-source-v1.png' and d.h==94 for d in frame(s).draws.values())
core.action(s,'pause')
step(core,s,120,True)
assert frame(s).storyTheaterCart.phase=='starting' and s.theaterCart.x==1178
core.action(s,'pause')
step(core,s,200,False)
assert 1178<s.theaterCart.x<1400
move(s,700)
step(core,s,2,False)
assert frame(s).storyTheaterCart.phase=='waitingForPlayer'
x=s.theaterCart.x
step(core,s,200,False)
assert s.theaterCart.x==x and s.story.quests[quest].count==4
s=from_save(s)
assert s.story.node==hub and s.story.quests[quest].count==4
near_gate(s,855,counter)
near_gate(s,1180,quay)
assert frame(s).storyTheaterCart.phase=='waiting' and frame(s).storyTheaterCart.x==1178
inspect(s,1178,4)
step(core,s,87,False)
for x in (1270,1400,1540,1650):
    move(s,x)
    step(core,s,100,False)
assert s.story.quests[quest].count==5 and frame(s).storyTheaterCart.phase=='parked'
assert s.theaterShutter is None and not list(s.solids.values())
move(s,1680)
step(core,s,60,True)
assert s.actors[1].x>1810
s=from_save(s)
near_gate(s,855,counter)
near_gate(s,1180,quay)
assert s.theaterShutter is None and frame(s).storyTheaterCart.phase=='parked'
near_gate(s,1820,hall)
guards=list(s.enemies.values())
assert len(guards)==2
defeat(s,guards[0])
assert s.story.quests[quest].count==5 and s.story.quests[quest].sweep[guards[0].spawnId]
s=from_save(s)
for x,destination in ((855,counter),(1180,quay),(1820,hall)):
    near_gate(s,x,destination)
guards=list(s.enemies.values())
assert len(guards)==1
defeat(s,guards[0])
assert s.story.quests[quest].count==6
near_gate(s,1510,loft)
inspect(s,863,7,391)
near_gate(s,1300,hub)

before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):
    core.action(s,'story_report:'+quest)
reward=(QUEST_REPORT_EXP['Q-FON-M01'],3100,3)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
assert tuple(a-b for a,b in zip(after,before))==reward
s=from_save(s)
near_gate(s,995,loft)
inspect(s,863,7,391)
assert s.storyNotice.startswith('搬送記録')
near_gate(s,1300,hub)
near_gate(s,1380,'fontaine-field')

proof=dict(physicalShutter=True,wrongLeadsRejected=True,cartPauses=True,cartWaitsForPlayer=True,
    retryAfterReload=True,openedShutterPersists=True,partialClearPersists=True,
    oneTimeReport=True,recordAfterReload=True,oldFieldGate=True,reward=reward)
(ROOT/'evidence/fontaine-delivery-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/fontaine-delivery-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
