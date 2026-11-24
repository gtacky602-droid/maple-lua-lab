import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.original_boss_lifecycle import check_original_boss_retry

lua,core=runtime()
port,view,flags,works='dornman-camp','dornman-wind-stairs','dornman-flag-trestle','dornman-windworks'
station='white-pass-station'
first,second,third='windward-lookouts','windward-flags','windward-tower-clear'
boss='original-windward-tower'
empty=lua.table()


def session(level,node,partial=0):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach']+partial,'quest')
    core.enterStoryNode(s,node)
    return s


def put(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def step(s,ticks,**keys):
    controls=lua.table_from(keys) if keys else empty
    for _ in range(ticks):
        core.step(s,1/60,controls)


def gate(s,x,node,y=480):
    put(s,x,y)
    core.action(s,'story_nearby_portal')
    assert s.story.node==node,(s.story.node,node,s.storyNotice)


def jump(s,x,y):
    put(s,x)
    core.action(s,'jump')
    step(s,60,jump=True)
    assert s.actors[s.active].y==y


def action_at(s,id,count,x,y=480):
    put(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[id].count==count


def hit(s,enemy,amount):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=amount,
        dir=1,radial=True,mult=1,range=70,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,id,xp,mora):
    before=(s.progression.questXp,s.mora)
    core.action(s,'story_report:'+id)
    core.action(s,'story_report:'+id)
    assert s.story.quests[id].status=='complete'
    assert (s.progression.questXp-before[0],s.mora-before[1])==(xp,mora)


# The ordinary endgame and optional branch have independent level gates.
s=session(159,station,LEVELS[158]['required_exp_to_next']-LEVELS[154]['normal_enemy_base_exp'])
gate(s,861,station)
gate(s,1144,'white-pass-woods')
gate(s,1774,'white-pass-ridge')
hit(s,s.enemies[1],100)
assert s.progression.level==160
core.action(s,'story_fast:'+station)
gate(s,861,'aurora-ice-cut')
gate(s,1780,'aurora-ice-cut')
assert not list(s.story.quests.keys())

s=session(175,port)
fixture=checkpoint(s)
core.action(s,'story_accept:'+third)
assert s.story.quests[third] is None
gate(s,536,flags)
gate(s,1698,works)
assert not list(s.story.quests.keys())
assert s.fieldSlots[boss].enemy.barrier==30
gate(s,58,flags)
gate(s,55,port)
core.action(s,'story_accept:'+first)
gate(s,1168,view)
action_at(s,first,0,342)
for i,(x,y) in enumerate(((342,392),(799,388),(1390,399)),1):
    jump(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[first].count==i
gate(s,60,port)
report(s,first,6500000,4600)

core.action(s,'story_accept:'+second)
gate(s,536,flags)
action_at(s,second,1,1090)
s=restore(s)
assert s.story.node==port and s.story.quests[second].count==1
gate(s,1168,view)
jump(s,1720,399)
core.action(s,'story_nearby_portal')
assert s.lift and s.story.node==view
step(s,120)
assert s.story.node==flags and s.actors[1].y==374
jump(s,1410,391)
core.action(s,'story_collect')
assert s.story.quests[second].count==2
gate(s,55,port)
report(s,second,9250000,6400)
core.action(s,'story_accept:'+third)

# The same normal hit deals less through the barrier, at either equipment comparison.
gate(s,536,flags)
gate(s,1698,works)
slot=s.fieldSlots[boss]
b=slot.enemy
old=b.hp
hit(s,b,100)
assert old-b.hp==9
core.action(s,'story_fast:'+port)
core.action(s,'barrier_trial:30')
gate(s,536,flags)
gate(s,1698,works)
b=slot.enemy
old=b.hp
hit(s,b,100)
assert old-b.hp==95
core.action(s,'story_fast:'+port)
core.action(s,'barrier_trial:0')
gate(s,536,flags)
gate(s,1698,works)
put(s,765)
s.actors[1].inv=0
s.actors[2].hp=0
for _ in range(250):
    if slot.cast is not None: break
    step(s,1)
assert slot.cast.move.id=='WDW01'
step(s,55)
hp=s.actors[1].hp
core.action(s,'jump')
step(s,35,jump=True)
assert s.actors[1].hp==hp
assert slot.enemy.exposed and slot.enemy.barrier==0
old=slot.enemy.hp
hit(s,slot.enemy,100)
assert old-slot.enemy.hp==95
for _ in range(420):
    if slot.cast is not None and slot.cast.move.id=='WDW02': break
    step(s,1)
assert slot.cast.move.id=='WDW02'
lane=(slot.cast.left,slot.cast.right)
step(s,106,right=True)
assert s.actors[1].hp==hp and slot.enemy.exposed
assert (slot.cast.left,slot.cast.right)==lane
before=s.progression.questXp
hit(s,slot.enemy,2000)
assert slot.phase=='respawn' and s.story.quests[third].count==1
assert s.progression.questXp==before
s=restore(s)
assert s.story.node==port and s.fieldSlots[boss].phase=='respawn'
gate(s,536,flags)
gate(s,1698,works)
action_at(s,third,2,1375)
gate(s,58,flags)
gate(s,55,port)
report(s,third,5312539,741600)
assert restore(s).story.quests[third].status=='complete'


def reenter_windworks(state):
    gate(state, 536, flags)
    gate(state, 1698, works)


check_original_boss_retry(lua, core, restore(s), boss, third, reenter_windworks)

proof=dict(earlyGateBlocked=True,earnedLv160=True,independentOfQuests=True,
           groundAndLiftPaths=True,pausedQuestRestored=True,lowWindJump=True,lockedVerticalWind=True,
           blockedDamage=9,fullDamage=95,zeroLightExhaustDamage=95,
           firstReport=[5312539,741600],noExtraQuestBonusOnKill=True,restored=True)
(ROOT/'evidence/windward-branch-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/windward-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
