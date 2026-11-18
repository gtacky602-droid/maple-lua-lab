import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
entry,yard,hub,outbound,stop,terminal,lookout,inbound=('sumeru-entry','veluriyam-bottle-yard','veluriyam-hub',
    'veluriyam-trolley-out','veluriyam-petal-stop','veluriyam-rail-end','veluriyam-petal-lookout','veluriyam-trolley-back')
first,second='veluriyam-bottle-ticket','veluriyam-trolley-lookout'
advance=lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{right=true,jump=true,attack=true}) end end')


def move(s,x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def frame(s): return core.frame(s,'sprite','legacy')


def gate(s,x,dest,y=480,opened=True):
    old=s.story.node
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==dest and portal.available is opened,(old,dest,native(portal) if portal else None)
    core.action(s,'story_nearby_portal')
    assert s.story.node==(dest if opened else old)
    return portal


def collect(s,q,n,x,y=480,key='story_collect'):
    move(s,x,y)
    core.action(s,key)
    assert s.story.quests[q].count==n,(q,n,s.storyNotice)


def checkpoint(s): return validate_save(native(core.checkpoint(s)))
def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,q,expected):
    before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    assert tuple(a-b for a,b in zip(after,before))==expected


def exits(s,node):
    return {edge.to for row in frame(s).storyGraph.nodes.values() if row.id==node for edge in row.exits.values()}


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[59]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,'sumeru-hub')
fixture=checkpoint(s)
gate(s,60,entry)
assert yard not in exits(s,entry)
move(s,1050)
core.action(s,'story_collect')
assert s.story.discovered.veluriyam and yard in exits(s,entry) and hub not in exits(s,entry)
gate(s,1125,yard)
assert hub not in exits(s,yard)
core.action(s,'story_accept:'+first)
collect(s,first,1,355)
collect(s,first,1,873,391)
assert frame(s).storyAirflow.pattern=='□' and not frame(s).storyAirflow.sound
collect(s,first,1,873,391,'story_airflow_commit')
assert '模様が合いません' in s.storyNotice and hub not in exits(s,yard)
for pattern in ('○','✧'):
    collect(s,first,1,873,391)
    assert frame(s).storyAirflow.pattern==pattern
collect(s,first,2,873,391,'story_airflow_commit')
s=restore(s)
assert s.story.node==yard and hub in exits(s,yard)
gate(s,1260,hub)
collect(s,first,3,323)
collect(s,first,4,985,390)
gate(s,1181,outbound,opened=False)
gate(s,323,yard)
report(s,first,(13400,510,2))
core.action(s,'story_fast:'+hub)
assert s.story.node==hub
core.action(s,'story_accept:'+second)
gate(s,1181,outbound)
assert frame(s).storyNearbyPortal.trolleyStop
assert frame(s).storyNearbyPortal.reason=='停留所に近づいています。'
assert any(d.source=='mirage-trolley-source-v1.png' for d in frame(s).draws.values())
resumed=restore(s)
assert resumed.story.node==hub and resumed.voyage is None and resumed.story.quests[second].count==0
x=s.actors[1].x
core.action(s,'dodge')
advance(core,s,107)
assert s.actors[1].x==x and not frame(s).storyNearbyPortal.available
advance(core,s,1)
assert frame(s).storyNearbyPortal.available
scroll=frame(s).voyage.scroll
core.action(s,'pause')
t=s.t
advance(core,s,600)
assert s.t==t and frame(s).voyage.scroll==scroll
core.action(s,'pause')
advance(core,s,269)
assert frame(s).storyNearbyPortal.available and math.isclose(frame(s).voyage.scroll,scroll)
advance(core,s,1)
assert not frame(s).storyNearbyPortal.available and '終点から' in frame(s).storyNearbyPortal.reason
advance(core,s,126)
assert s.story.node==terminal and s.story.quests[second].count==0

gate(s,1060,inbound)
assert frame(s).voyage.scroll==1
advance(core,s,120)
assert frame(s).voyage.scroll<1
gate(s,160,stop)
gate(s,406,outbound)
assert not frame(s).storyNearbyPortal.available
advance(core,s,121)
assert s.story.node==terminal
gate(s,1060,inbound)
advance(core,s,120)
gate(s,160,stop)
gate(s,834,lookout,390,opened=False)
collect(s,second,1,521)
gate(s,834,lookout,390)
collect(s,second,1,1010)
collect(s,second,2,1010,386)
gate(s,62,stop)
core.action(s,'story_fast:'+hub)
assert s.story.quests[second].count==2
gate(s,1181,outbound)
advance(core,s,120)
gate(s,160,stop)
gate(s,172,inbound)
assert not frame(s).storyNearbyPortal.available
advance(core,s,121)
assert s.story.node==hub and s.story.quests[second].count==3
collect(s,second,4,787)
report(s,second,(18100,680,3))
s=restore(s)
assert s.story.node==hub
move(s,787)
assert frame(s).storyNearbyMilestone.label=='花棚の記念切符を読む'
collect(s,second,4,787)
assert '帰りは広場行きの戻り便' in s.storyNotice

gate(s,60,entry)
gate(s,1050,hub)
core.action(s,'story_accept:veluriyam-explore')
gate(s,1380,'veluriyam-play')
assert s.story.quests['veluriyam-explore'].count==1

proof=dict(hiddenUntilBottleClue=True,wrongPatternBlocksGate=True,dialUnlockPersists=True,revisit=True,
    stopWindow=[1.8,6.3],pauseStopsRide=True,locksMovementInTransit=True,terminalBailout=True,
    saveDuringRideReturnsToHub=True,onwardAndReturnFromStop=True,
    noFastTravelCredit=True,readbackAfterSave=True,oldGateAndQuestKept=True,
    firstReport=[13400,510,2],secondReport=[18100,680,3],oneTimePayouts=True)
(ROOT/'evidence/veluriyam-trolley-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
work=ROOT/'work';work.mkdir(exist_ok=True)
(work/'veluriyam-trolley-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
