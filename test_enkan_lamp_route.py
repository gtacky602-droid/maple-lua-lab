import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
camp,shelf,room,gallery,hollow=('enkanomiya-camp','enkan-guide-shelf','enkan-lamp-chamber',
    'enkan-route-gallery','enkan-tablet-hollow')
first,second,third='enkan-safety-leaflet','enkan-shadow-crossing','enkan-coverless-log'
boss='original-plate-tail'
batch=lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def session(level):
    s=core.new(12);core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,camp)
    return s


def move(s,x,y=480):
    a=s.actors[s.active];a.x,a.y,a.vy,a.ground=x,y,0,True


def frame(s): return core.frame(s,'sprite','legacy')


def gate(s,x,to,*,y=480,opened=True):
    move(s,x,y)
    p=frame(s).storyNearbyPortal
    assert p.to==to and p.available is opened,(s.story.node,to,p.reason)
    core.action(s,'story_nearby_portal')
    if opened: assert s.story.node==to


def collect(s,x,y,q,count):
    move(s,x,y);core.action(s,'story_collect')
    assert s.story.quests[q].count==count,(q,s.story.quests[q].count,count)


def checkpoint(s): return validate_save(native(core.checkpoint(s)))


def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,q,expected):
    before=s.progression.questXp,s.mora,s.inventory.upgradeOre
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    after=s.progression.questXp,s.mora,s.inventory.upgradeOre
    assert tuple(a-b for a,b in zip(after,before))==expected


def hit(s,e,strength=100):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=e.id,x=e.x,y=e.y,atk=strength,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


low=session(40)
gate(low,942,shelf,opened=False)
gate(low,1380,'enkanomiya-depth')

s=session(110)
fixture=checkpoint(s)
gate(s,1125,room,opened=False)
core.action(s,'story_accept:'+first)
gate(s,942,shelf)
for x,y,count in [(315,480,1),(880,390,2),(1460,480,3)]: collect(s,x,y,first,count)
gate(s,55,camp)
report(s,first,(284000,3200,3))

core.action(s,'story_accept:'+second)
gate(s,1125,room)
assert frame(s).storyLocalLight.mode=='bright' and len(s.platforms)==2
assert gallery not in {p.to for p in frame(s).storyPortals.values()}
gate(s,896,gallery,y=390,opened=False)
collect(s,224,480,second,0)
assert frame(s).storyLocalLight.mode=='dark' and len(s.platforms)==3
assert gallery in {p.to for p in frame(s).storyPortals.values()}
collect(s,390,480,second,0)
gate(s,896,gallery,y=390,opened=False)
collect(s,763,390,second,0)
assert (s.actors[1].x,s.actors[1].y,s.actors[1].ground)==(478,480,True)
assert len(s.platforms)==2 and frame(s).storyLocalLight.mode=='bright'
collect(s,390,480,second,1)
collect(s,224,480,second,1)
collect(s,647,480,second,1)
collect(s,647,390,second,2)
s=restore(s)
assert s.story.node==camp and s.story.quests[second].count==2
gate(s,1125,room)
assert frame(s).storyLocalLight.mode=='bright' and len(s.platforms)==2
gate(s,896,gallery,y=390,opened=False)
collect(s,224,480,second,2)
gate(s,896,gallery,y=390)
assert frame(s).storyLocalLight is None
collect(s,442,480,second,3)
gate(s,55,camp)
report(s,second,(391000,4400,4))

gate(s,1292,gallery)
core.action(s,'story_accept:'+third)
gate(s,1210,hollow)
slot=s.fieldSlots[boss]
s.actors[2].hp=0
move(s,606)
for _ in range(200):
    if slot.cast: break
    batch(core,s,1)
cast=slot.cast
assert cast.move.id=='PT01' and cast.left==650 and cast.finish==708 and cast.stopped
hp=s.actors[1].hp
s.actors[1].inv=0
batch(core,s,cast.move.windup+10)
assert cast.finish<slot.enemy.x<cast.origin and cast.seen[1] is None and s.actors[1].hp==hp
move(s,789)
batch(core,s,3)
assert cast.seen[1] and s.actors[1].hp==hp-cast.move.damage
move(s,606)
batch(core,s,30)
assert slot.enemy.x==708 and slot.enemy.stopped and slot.enemy.exposed and slot.enemy.barrier==0
initial=slot.enemy.hp;hit(s,slot.enemy)
assert initial-slot.enemy.hp>110
move(s,slot.enemy.x+72)
for _ in range(380):
    if slot.cast and slot.cast.move.id=='PT02': break
    batch(core,s,1)
cast=slot.cast
assert cast.move.id=='PT02'
move(s,cast.right+31)
batch(core,s,cast.move.windup+cast.move.active+1)
assert slot.enemy.exposed and not slot.enemy.stopped
before=s.progression.questXp;hit(s,slot.enemy,1400)
assert s.story.quests[third].count==1 and s.progression.questXp==before and slot.phase=='respawn'
collect(s,1545,480,third,2)
gate(s,58,gallery)
collect(s,825,480,third,3)
report(s,third,(103552,371745,5))
s=restore(s)
assert s.story.node==gallery and s.story.quests[third].status=='complete'
move(s,825);assert frame(s).storyNearbyMilestone.label=='完成した探検記を読む'
core.action(s,'story_collect')
assert s.storyNotice.startswith('探検記『') and '同じ道で小間へ戻る' in s.storyNotice

proof=dict(legacyLv40Access=True,threeSafetyMarks=True,phaseSpecificInspection=True,
    darkSupportAndExit=True,safeFloorOnRelight=True,saveRetainsCluesAndResetsLamp=True,permanentShortcut=True,
    movingRushStopsAtRealRock=True,behindRockSafe=True,damageInsideRush=True,recordReadableAfterRestore=True,
    firstReport=[103552,371745,5],noSecondPayout=True)
(ROOT/'evidence/enkan-lamp-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
work=ROOT/'work'
work.mkdir(exist_ok=True)
(work/'enkan-lamp-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
