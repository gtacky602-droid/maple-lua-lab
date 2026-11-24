import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.original_boss_lifecycle import check_original_boss_retry


lua, core = runtime()
camp, terraces, road, rig, pavilion, gully = ('chenyu-camp','chenyu-tea-terraces','chenyu-cart-road',
    'chenyu-tea-lift','chenyu-tea-pavilion','chenyu-boulder-gully')
first, second, third = 'chenyu-tea-delivery', 'chenyu-loading-landing', 'chenyu-tea-with-friends'
boss = 'original-tea-boulder'
batch = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def session(level, node):
    s=core.new(12);core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,node)
    return s


def move(s, x, y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(s, x, destination, *, y=480, opened=True, lift=False):
    move(s,x,y)
    portal=core.frame(s,'sprite','legacy').storyNearbyPortal
    assert portal.to==destination and portal.available is opened, (s.story.node,destination,portal.reason)
    core.action(s,'story_nearby_portal')
    if opened and lift: assert s.lift.destination==destination
    elif opened: assert s.story.node==destination


def collect(s, x, y, q, count):
    move(s,x,y);core.action(s,'story_collect')
    assert s.story.quests[q].count==count,(q,s.story.quests[q].count,count)


def hit(s,e,strength=100):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=e.id,x=e.x,y=e.y,atk=strength,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


def checkpoint(s): return validate_save(native(core.checkpoint(s)))


def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s, q, expected):
    before=s.progression.questXp,s.mora,s.inventory.upgradeOre
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    after=s.progression.questXp,s.mora,s.inventory.upgradeOre
    assert tuple(a-b for a,b in zip(after,before))==expected


low=session(20,camp)
gate(low,950,terraces,opened=False)
gate(low,1380,'chenyu-depth')

optional=session(95,camp)
gate(optional,950,terraces)
gate(optional,1793,road)
gate(optional,1560,pavilion)
assert optional.story.quests[first] is None

s=session(95,camp)
fixture=checkpoint(s)
gate(s,1198,rig,opened=False)
core.action(s,'story_accept:'+first)
gate(s,950,terraces)
collect(s,318,480,first,1)
collect(s,929,480,first,1)
collect(s,929,390,first,2)
collect(s,1430,480,first,3)
gate(s,1537,pavilion,y=384)
collect(s,660,480,first,4)
gate(s,55,road)
collect(s,1234,480,first,5)
gate(s,55,camp)
report(s,first,(122000,2100,2))

core.action(s,'story_accept:'+second)
gate(s,1198,rig)
gate(s,570,rig,opened=False)
collect(s,355,480,second,1)
assert len(s.platforms)==2 and s.platforms[2].track=='tea-landing' and s.platforms[2].y==312
gate(s,570,rig,lift=True)
batch(core,s,29)
assert 312<s.actors[1].y<480 and 570<s.actors[1].x<650
middle=s.actors[1].y
core.action(s,'pause');batch(core,s,29)
assert s.actors[1].y==middle
core.action(s,'pause');batch(core,s,45)
assert not s.lift and (s.actors[1].x,s.actors[1].y,s.actors[1].ground)==(650,312,True)
core.action(s,'story_collect')
assert s.story.quests[second].count==2
s=restore(s)
assert s.story.node==camp
gate(s,1198,rig)
assert len(s.platforms)==2 and s.platforms[2].y==312
collect(s,922,480,second,3)
assert [(p.y,p.track) for p in s.platforms.values() if p.track]==[(385,'tea-landing')]
s=restore(s)
gate(s,1198,rig)
assert [(p.y,p.track) for p in s.platforms.values() if p.track]==[(385,'tea-landing')]
gate(s,570,rig,opened=False)
gate(s,1245,pavilion,y=385,lift=True)
batch(core,s,83)
assert s.story.node==pavilion and s.actors[1].y==390
collect(s,428,390,second,4)
gate(s,560,camp,y=390)
report(s,second,(191000,2800,3))

gate(s,1198,rig)
gate(s,1245,pavilion,y=385,lift=True)
batch(core,s,83)
core.action(s,'story_accept:'+third)
gate(s,1325,gully)
slot=s.fieldSlots[boss];s.actors[2].hp=0
move(s,610)
for _ in range(220):
    if slot.cast: break
    batch(core,s,1)
cast=slot.cast;assert cast.move.id=='TB01' and cast.left==645
assert core.frame(s,'sprite','legacy').fieldBoss.cover[1].x==511
initial=slot.enemy.hp;hit(s,slot.enemy)
assert initial-slot.enemy.hp==9
hp=s.actors[1].hp
s.actors[1].inv=0
batch(core,s,cast.move.windup+2)
assert s.actors[1].hp==hp and cast.seen[1] is None
move(s,680)
s.actors[1].inv=0
batch(core,s,1)
assert s.actors[1].hp==hp-cast.move.damage,(native(cast.seen),s.actors[1].inv,s.actors[1].hp,native(s.events))
batch(core,s,cast.move.active)
assert s.actors[1].hp==hp-cast.move.damage and slot.enemy.exposed
initial=slot.enemy.hp;hit(s,slot.enemy)
assert initial-slot.enemy.hp>110
move(s,slot.enemy.x-62)
for _ in range(340):
    if slot.cast and slot.cast.move.id=='TB02': break
    batch(core,s,1)
cast=slot.cast;assert cast.move.id=='TB02'
move(s,cast.left-34)
batch(core,s,cast.move.windup+cast.move.active+1)
assert slot.enemy.exposed
before=s.progression.questXp;hit(s,slot.enemy,1200)
assert slot.phase=='respawn' and s.story.quests[third].count==1 and s.progression.questXp==before
gate(s,57,pavilion)
collect(s,865,480,third,1)
collect(s,500,480,third,2)
collect(s,865,480,third,3)
report(s,third,(55165,290472,4))
s=restore(s)
assert s.story.node==pavilion and s.story.quests[third].status=='complete'
frame=core.frame(s,'sprite','legacy')
assert any(d.text=='茶席・一服の記録' for d in frame.draws.values())
assert sum(d.color=='#e3e9cc' for d in frame.draws.values())==6
check_original_boss_retry(lua, core, s, boss, third, lambda state: gate(state, 1325, gully))

proof=dict(legacyLv20Access=True,independentLowRoute=True,threeMarksAndDelivery=True,cartReturn=True,
    actualLiftRiseAndLanding=True,pauseStopsLift=True,onePlatformAfterSwitch=True,placementSaved=True,
    sameRockGeometryAsScene=True,behindRockSafe=True,inBeamHit=True,restAndCupsSaved=True,
    firstReport=[55165,290472,4],noSecondPayout=True)
(ROOT/'evidence/chenyu-tea-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/chenyu-tea-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
