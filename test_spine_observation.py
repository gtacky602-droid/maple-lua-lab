import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
camp, shelf, notch, lee, shelter, ridge = ('dragonspine-camp','spine-observation-shelf',
    'spine-wind-notch','spine-lee-walk','spine-shelter','spine-trace-ridge')
first, second, third = 'spine-noon-pattern','spine-wind-route','spine-ridge-record'
boss = 'original-rime-hare'
batch = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def move(s, x, y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def nearby(s):
    return core.frame(s,'sprite','legacy').storyNearbyPortal


def gate(s, x, destination, *, y=480, opened=True, lift=False):
    move(s,x,y)
    portal=nearby(s)
    assert portal.to==destination and portal.available is opened, (s.story.node,destination,portal.reason)
    core.action(s,'story_nearby_portal')
    if opened and lift:
        assert s.lift.destination==destination
    elif opened:
        assert s.story.node==destination


def collect(s, x, y, q, count):
    move(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[q].count==count, (q,s.story.quests[q].count,count)


def hit(s, e, strength=100):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=e.id,x=e.x,y=e.y,atk=strength,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


def saved(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(saved(s),recursive=True),12)


def report(s, q, expected):
    before = s.progression.questXp,s.mora,s.inventory.upgradeOre
    for _ in range(2): core.action(s,'story_report:'+q)
    after = s.progression.questXp,s.mora,s.inventory.upgradeOre
    assert s.story.quests[q].status=='complete' and tuple(a-b for a,b in zip(after,before))==expected


low=core.new(12);core.action(low,'story_start');core.enterStoryNode(low,'mond-border')
gate(low,720,camp)
gate(low,1020,shelf,opened=False)
gate(low,1380,'dragonspine-depth')
assert core.frame(low,'sprite','legacy').imprintGrowth.total==0

s=core.new(12);core.action(s,'story_start');core.enterStoryNode(s,'mond-border')
core.grantExp(s,LEVELS[59]['maple_reference_total_exp_to_reach'],'quest')
fixture=saved(s)
gate(s,720,camp)
move(s,680);core.action(s,'story_expedition_trial')
assert core.frame(s,'sprite','legacy').storyExpeditionDesk.practice==10
core.action(s,'story_accept:'+first)
gate(s,1020,shelf)
collect(s,346,480,first,0)
for e in tuple(s.enemies.values()): hit(s,e,600)
assert s.story.quests[first].count==1
for x,y,shade,index in [(346,480,'#8199af',2),(856,389,'#536e91',3),(1373,480,'#24456c',4)]:
    move(s,x,y);s.camera=max(0,min(x-400,670))
    draws=core.frame(s,'sprite','legacy').draws
    assert sum(d.color==shade for d in draws.values())==12
    collect(s,x,y,first,index)
s=restore(s)
assert s.story.node==camp
report(s,first,(12100,540,1))

core.action(s,'story_accept:'+second)
gate(s,1020,shelf)
assert len(s.enemies)==0
gate(s,1560,notch)
collect(s,280,480,second,1)
gate(s,614,shelter,y=387,opened=False)
assert s.lift is None and not nearby(s).wind.calm and nearby(s).wind.seconds==3.8
core.action(s,'pause');batch(core,s,61)
assert abs(nearby(s).wind.seconds-3.8)<1e-8
core.action(s,'pause')
batch(core,s,232)
assert nearby(s).wind.calm and 2<nearby(s).wind.seconds<2.2
gate(s,614,shelter,y=387,lift=True)
core.action(s,'pause');batch(core,s,60)
assert s.story.node==notch and s.lift
core.action(s,'pause');batch(core,s,51)
assert s.story.node==shelter and s.lift is None
collect(s,630,480,second,2)
gate(s,56,camp)
report(s,second,(20400,920,2))

# The lower route is available before the timed gate's calm window and without clearing its enemies.
gate(s,1020,shelf);gate(s,1560,notch)
gate(s,614,shelter,y=387,opened=False)
gate(s,1440,lee)
assert len(s.enemies)==4
gate(s,1560,shelter)
core.action(s,'story_accept:'+third)
gate(s,1130,ridge)
collect(s,1455,480,third,0)
s.actors[2].hp=0
slot=s.fieldSlots[boss]
move(s,slot.enemy.x-56)
for _ in range(200):
    if slot.cast: break
    batch(core,s,1)
assert slot.cast.move.id=='RH01' and len(slot.cast.lanes)==1
initial=slot.enemy.hp;hit(s,slot.enemy)
assert initial-slot.enemy.hp==9
move(s,slot.enemy.x+41)
hp=s.actors[1].hp
batch(core,s,slot.cast.ends)
assert slot.enemy.recovering and s.actors[1].hp==hp
initial=slot.enemy.hp;hit(s,slot.enemy)
assert initial-slot.enemy.hp>100
move(s,slot.enemy.x-54)
for _ in range(340):
    if slot.cast and slot.cast.move.id=='RH02': break
    batch(core,s,1)
cast=slot.cast
assert cast.move.id=='RH02' and [lane.at for lane in cast.lanes.values()]==[57,92]
move(s,slot.enemy.x)
batch(core,s,cast.ends)
assert s.actors[1].hp==hp and slot.enemy.recovering
before=s.progression.questXp
hit(s,slot.enemy,1000)
assert s.story.quests[third].count==1 and s.progression.questXp==before and slot.phase=='respawn'
collect(s,1455,382,third,1)
collect(s,1455,480,third,2)
gate(s,57,shelter)
collect(s,777,480,third,3)
report(s,third,(6649,153675,3))
s=restore(s)
assert s.story.node==shelter and s.story.quests[third].status=='complete'
assert any(d.text=='稜線の観測記録・展示中' for d in core.frame(s,'sprite','legacy').draws.values())

proof=dict(legacyLevelOneAccess=True,optionalBarrierTest=True,shelfThreeAngles=True,observationsSaved=True,
    gustGateRejected=True,calmLift=True,pauseFreezesWind=True,leeRouteOpenInGust=True,
    twoBossTelegraphs=True,zeroImprintRecovery=True,belowLedgeOnly=True,exhibitSaved=True,
    firstReport=[6649,153675,3],noSecondPayout=True)
(ROOT/'evidence/spine-observation-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/spine-observation-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
