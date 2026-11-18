import copy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core=runtime()
survey,repair='threadline-survey','threadline-restore'
hub,walk,relay,loom='liyue-harbor','cloth-service-walk','threadline-relay','buried-weaving-room'
boss='original-twin-shuttle-loom'
state=core.new(12)
core.action(state,'story_start')
core.grantExp(state,LEVELS[33]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(state,hub)
empty=lua.table()


def move_at(x,y=480):
    actor=state.actors[state.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def press(key):
    core.action(state,key)


def step(count,**keys):
    inputs=lua.table_from(keys) if keys else empty
    for _ in range(count): core.step(state,1/60,inputs)


def gate(x,destination):
    move_at(x)
    press('story_nearby_portal')
    assert state.story.node==destination,(state.story.node,destination)


def saved():
    return validate_save(native(core.checkpoint(state)))


def restore(save):
    return core.restore(lua.table_from(save,recursive=True),12)


def assert_count(quest,count):
    assert state.story.quests[quest].count==count


fixture=saved()
press('story_accept:'+repair)
assert state.story.quests[repair] is None
gate(1320,hub)
press('story_accept:'+survey)
gate(1320,walk)
gate(1138,walk)
# Out of order and horizontally correct but vertically wrong interactions cannot advance.
move_at(715,382)
press('story_collect')
assert_count(survey,0)
move_at(355)
press('pause')
press('story_collect')
assert_count(survey,0)
press('pause')
press('story_collect')
press('story_collect')
assert_count(survey,1)
mid=saved()
state=restore(mid)
assert state.story.node==hub
assert_count(survey,1)
gate(1320,walk)
move_at(715)
press('story_collect')
assert_count(survey,1)
press('jump')
step(60,jump=True)
assert state.actors[1].ground and abs(state.actors[1].y-382)<.01
assert core.frame(state,'sprite','legacy').storyNearbyMilestone.label=='ヒューズ箱を調べる'
press('story_collect')
assert_count(survey,2)
gate(1138,relay)
gate(1018,relay)
move_at(710)
press('story_collect')
assert_count(survey,3)
press('story_report:'+survey)
assert state.story.quests[survey].status=='active'
gate(60,walk)
gate(55,hub)
before=(state.progression.questXp,state.mora)
press('story_report:'+survey)
press('story_report:'+survey)
assert (state.progression.questXp-before[0],state.mora-before[1])==(1300,250)
press('story_accept:'+repair)
gate(1320,walk)
gate(1138,relay)
gate(1018,relay)
move_at(853)
press('story_collect')
assert_count(repair,0)
move_at(710)
press('story_collect')
assert_count(repair,1)
core.storyBossDefeated(state,boss)
assert_count(repair,1)
gate(1018,loom)
core.storyBossDefeated(state,'original-tide-surveyor')
assert_count(repair,1)
# Use the normal combat receiver, expose the core, and finish as the game does.
slot=state.weeklySlots[boss]
step(45)
for part in slot.shuttles.values():
    core.resolveCast(state,lua.table_from(dict(id=1,targetId=part.id,x=part.x,y=480,atk=500,
        dir=1,radial=True,mult=1,range=140,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))
step(1)
assert slot.openUntil is not None
core.resolveCast(state,lua.table_from(dict(id=1,targetId=slot.primary.id,x=480,y=480,atk=500,
    dir=1,radial=True,mult=1,range=140,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))
assert_count(repair,2)
assert slot.phase=='respawn' and state.story.quests['loom-stopped'] is None
done=saved()
invalid=copy.deepcopy(done)
del invalid['story']['visited'][loom]
invalid['story']['node']=relay
try:validate_save(invalid)
except ValueError as error:assert '未訪問' in str(error)
else:raise AssertionError('Unvisited milestone accepted')
state=restore(done)
assert state.story.node==hub and state.weeklySlots[boss].phase=='respawn'
assert_count(repair,2)
gate(1320,walk)
gate(1138,relay)
move_at(853)
press('story_collect')
assert_count(repair,3)
assert any(d.text=='試験灯・点灯' for d in core.frame(state,'sprite','legacy').draws.values())
gate(60,walk)
gate(55,hub)
before=(state.progression.questXp,state.mora)
press('story_report:'+repair)
press('story_report:'+repair)
assert (state.progression.questXp-before[0],state.mora-before[1])==(2300,480)
state=restore(saved())
assert state.story.quests[repair].status=='complete'
gate(1320,walk)
gate(1138,relay)
move_at(853)
step(1)
assert any(d.text=='試験灯・点灯' for d in core.frame(state,'sprite','legacy').draws.values())
assert core.frame(state,'sprite','legacy').storyNearbyMilestone is None
result={'twoOrderedQuests':True,'lockedUntilReport':True,'realJumpToFuse':True,'gatesRequireMilestones':True,
        'wrongPhaseAndNodeIgnored':True,'saveAfterFirstAndBoss':True,'unvisitedMilestoneRejected':True,
        'persistentLitLamp':True,'surveyorReward':[1300,250],'restorationReward':[2300,480]}
(ROOT/'evidence/threadline-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
(ROOT/'work/threadline-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(result)
