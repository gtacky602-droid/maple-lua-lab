import json
import math

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,summit,steps,high,river,turn,meet=(
    'natlan-hub','natlan-flag-summit','natlan-high-trial-steps','natlan-high-trial-field',
    'natlan-river-float-run','natlan-river-turn-basin','natlan-duel-entry')
first,quest='natlan-ridge-flag','natlan-two-trials'
step=lua.eval('function(C,s,n,right,left,jump) for _=1,n do C.step(s,1/60,{right=right,left=left,jump=jump}) end end')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(saved):
    return core.restore(lua.table_from(saved,recursive=True),12)


def frame(s):
    return core.frame(s,'sprite','legacy')


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(s,x,dest,y=480,opened=True):
    move(s,x,y)
    p=frame(s).storyNearbyPortal
    assert p and p.to==dest and p.available is opened,(s.story.node,dest,native(p))
    previous=s.story.node
    core.action(s,'story_nearby_portal')
    assert s.story.node==(dest if opened else previous)


def collect(s,x,y,count,path=None):
    move(s,x,y)
    core.action(s,'story_collect')
    state=s.story.quests[quest]
    progress=state.pathProgress[path] if path else state
    assert progress.count==count,(s.story.node,path,count,s.storyNotice)


def from_summit_save(saved):
    state=restore(saved)
    gate(state,56,hub)
    gate(state,1227,summit)
    return state


def advance(s,n):
    step(core,s,n,False,False,False)


def walk(s,x):
    for _ in range(400):
        a=s.actors[1]
        if abs(a.x-x)<=4:return
        step(core,s,1,a.x<x,a.x>x,False)
    raise AssertionError((x,s.actors[1].x,s.actors[1].y))


def jump(s,x,y):
    a=s.actors[1]
    core.action(s,'jump')
    for _ in range(100):
        dx=x-a.x
        step(core,s,1,dx>3,dx<-3,True)
        if a.ground and a.y==y and abs(a.x-x)<8:return
    raise AssertionError((x,y,a.x,a.y))


def until(s,condition,ticks=1400):
    for _ in range(ticks):
        if condition():return
        advance(s,1)
    raise AssertionError((s.story.node,s.actors[1].x,s.actors[1].y,s.riverDecks[1].platform.x))


def defeat(s,enemy):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=1600,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0)))


def defeat_all(s):
    for enemy in list(s.enemies.values()):
        if enemy.hp>0:defeat(s,enemy)


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
core.action(s,'story_accept:'+quest)
assert s.story.quests[quest] is None
s.story.quests[first]=lua.table_from(dict(status='complete',count=5,cycles=1))
for node in ('natlan-flag-staging','natlan-flag-slope','natlan-flag-cleft',summit):
    s.story.visited[node]=True
fixture=checkpoint(s)
core.action(s,'story_accept:'+quest)
gate(s,1227,summit)
gate(s,1292,meet,390,opened=False)
collect(s,795,390,1)
begin=checkpoint(s)

s=from_summit_save(begin)
gate(s,969,steps,390)
walk(s,522);jump(s,522,391);collect(s,522,391,1,'high')
(ROOT/'evidence/natlan-high-second-target-save.json').write_text(json.dumps(checkpoint(s),ensure_ascii=False)+'\n',encoding='utf8')
walk(s,900);jump(s,900,302);walk(s,1044);collect(s,1044,302,2,'high')
gate(s,1420,high,302)
assert len(s.enemies)==3
defeat_all(s)
collect(s,1534,390,4,'high')
gate(s,1728,summit,390)
gate(s,1292,meet,390,opened=False)
assert s.story.quests[quest].pathProgress.water.count==0
high_first=checkpoint(s)


def water_path(s,physical):
    gate(s,1055,river)
    collect(s,252,480,1,'water')
    if physical:
        defeat(s,s.enemies[1])
        partial=checkpoint(s)
        assert partial['story']['quests'][quest]['pathProgress']['water']['sweep']
        (ROOT/'evidence/natlan-river-partial-sweep-save.json').write_text(json.dumps(partial,ensure_ascii=False)+'\n',encoding='utf8')
        s=restore(partial)
        gate(s,1055,river)
        assert len(s.enemies)==2
        move(s,407)
        for _ in range(85):
            step(core,s,1,True,False,False)
            if '水に落ちた' in (s.storyNotice or ''):break
        assert s.actors[1].x==382 and s.actors[1].hp==s.actors[1].maxhp and s.returns==0
        move(s,995,548);advance(s,1)
        assert s.actors[1].x==1016 and s.actors[1].y==480
        p=s.riverDecks[1].platform
        until(s,lambda:p.x==340)
        move(s,388)
        jump(s,388,430)
        offset=s.actors[1].x-p.x
        until(s,lambda:p.x>420)
        assert math.isclose(s.actors[1].x-p.x,offset)
        x=s.actors[1].x
        core.action(s,'pause');advance(s,75);core.action(s,'pause')
        assert s.actors[1].x==x
        until(s,lambda:p.x==914)
        jump(s,1117,480)
    defeat_all(s)
    gate(s,1610,turn)
    if physical:
        move(s,397)
        jump(s,478,411)
        jump(s,646,390)
        walk(s,852)
        until(s,lambda:s.actors[1].ground and s.actors[1].y==411)
        p=s.riverDecks[1].platform
        until(s,lambda:785<p.x<805 and (s.t-s.storyEnteredAt)%12.8<6.4)
        walk(s,910)
        until(s,lambda:s.actors[1].ground and s.actors[1].y==435,120)
        until(s,lambda:p.x==1070)
        jump(s,1270,480)
    defeat_all(s)
    collect(s,1480,480,4,'water')
    advance(s,55)
    assert any(d.text=='向きが変わる間' for d in frame(s).draws.values())
    gate(s,1637,summit)
    return s


s=water_path(from_summit_save(high_first),True)
assert s.story.quests[quest].count==2
gate(s,1292,meet,390)

s=water_path(from_summit_save(begin),False)
assert s.story.quests[quest].count==1
gate(s,1292,meet,390,opened=False)
bad=checkpoint(s)
bad['story']['quests'][quest]['count']=2
try:
    validate_save(bad)
except ValueError as error:
    assert '合流' in str(error)
else:
    raise AssertionError('matched route without both branch records')
s=from_summit_save(checkpoint(s))
gate(s,969,steps,390)
collect(s,522,391,1,'high')
collect(s,1044,302,2,'high')
gate(s,1420,high,302)
defeat_all(s);collect(s,1534,390,4,'high')
gate(s,1728,summit,390)
gate(s,1292,meet,390)
collect(s,431,480,3)
collect(s,847,390,4)
gate(s,1437,hub)
before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):core.action(s,'story_report:'+quest)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward=(QUEST_REPORT_EXP['Q-NAT-M02'],7300,5)
assert tuple(a-b for a,b in zip(after,before))==reward
s=restore(checkpoint(s))
gate(s,1314,meet)
collect(s,847,390,4)
assert s.storyNotice.startswith('対戦札')
gate(s,1437,hub)
gate(s,1040,high)
assert len(s.enemies)==3 and s.actors[1].y==390
gate(s,1728,summit,390)
gate(s,1526,hub,390)
gate(s,1132,turn)
assert len(s.enemies)==2 and s.actors[1].x==1180

proof=dict(highThenWater=True,waterThenHigh=True,partialBranchSweepAfterReload=True,lockedUntilBoth=True,
           inconsistentJoinRejected=True,waterRescueBothBanks=True,pausedRaftFreezes=True,movingDeckCarriesActor=True,
           rockToFinalRaft=True,turnCue=True,threeMarksAndMatchCard=True,reportOnce=True,rematchHuntingRoutes=True,
           reward=reward)
(ROOT/'evidence/natlan-two-trials-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/natlan-two-trials-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
