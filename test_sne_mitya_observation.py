import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
town,shed,yard,ridge,old_field="snezhnaya-hub","sne-survey-shed","sne-survey-yard","sne-survey-ridge","snezhnaya-field"
quest,legacy="sne-mitya-observation","mitya-join"
run=lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def frame(s):
    return core.frame(s,"sprite","legacy")


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True
    s.camera=max(0,min(x-400,s.worldwidth-960))


def approach(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone


def inspect(s,x,y=480):
    approach(s,x,y)
    core.action(s,"story_collect")


def gate(s,x,to,available=True,y=480):
    previous=s.story.node
    move(s,x,y)
    edge=frame(s).storyNearbyPortal
    assert edge and edge.to==to and edge.available==available,native(edge)
    core.action(s,"story_nearby_portal")
    assert s.story.node==(to if available else previous)


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(save):
    return core.restore(lua.table_from(save,recursive=True),12)


def progress(s):
    return s.story.quests[quest]


def strike(s,target):
    cast=dict(id=1,targetId=target.id,x=target.x,y=target.y,atk=500,dir=1,radial=True,mult=1,
              range=24,limit=1,element="physical",gain=0,color="#d6efef",critRate=0)
    core.resolveCast(s,lua.table_from(cast))
    assert target.hp<=0


def jump(s,x,y,landing):
    move(s,x,y)
    core.action(s,"jump")
    run(core,s,60,lua.table_from({"jump":True}))
    assert s.actors[s.active].ground and s.actors[s.active].y==landing


s=core.new(12)
core.action(s,"story_start")
core.grantExp(s,LEVELS[139]["maple_reference_total_exp_to_reach"],"quest")
core.enterStoryNode(s,town)
fixture=checkpoint(s)
core.action(s,"story_accept:"+legacy)
core.action(s,"story_accept:"+quest)
assert not progress(s) and not s.story.quests[legacy]
assert not any(q.id==legacy for q in frame(s).storyGraph.quests.values())
gate(s,417,shed)
assert sum(d.source=="mitya-idle-source-v2.png" for d in frame(s).draws.values())==1
assert not s.story.quests["white-pass-ticket"]
core.action(s,"story_accept:"+quest)
gate(s,849,ridge,False)
inspect(s,311)
gate(s,1039,yard)
inspect(s,349)
assert frame(s).storySurvey.samples==1 and "屋根の縁" in s.storyNotice
gate(s,1316,ridge,False)
inspect(s,942)
assert frame(s).storySurvey.samples==2
gate(s,1316,ridge)
assert len(s.enemies)==2
for foe in list(s.enemies.values()):
    strike(s,foe)
assert progress(s).count==4
jump(s,550,480,386)
jump(s,900,386,291)
inspect(s,1076,291)
assert frame(s).storySurvey.samples==3 and "針がぶれる" in s.storyNotice
inspect(s,1405,386)
approach(s,1469,386)
assert frame(s).storySurveyRig.label=="雪の上に直置き" and not frame(s).storySurveyRig.ready
core.action(s,"story_survey_confirm")
assert progress(s).count==6 and "雪壁" in s.storyNotice
core.action(s,"story_collect")
assert frame(s).storySurveyRig.label=="脚を長く伸ばす"
core.action(s,"story_survey_confirm")
assert progress(s).count==6 and "揺れる" in s.storyNotice
setup_checkpoint=checkpoint(s)
broken=checkpoint(s)
broken["story"]["quests"][quest]["surveySupport"]=99
try:
    validate_save(broken)
except ValueError as e:
    assert "設置方法" in str(e)
else:
    raise AssertionError("Unsupported position accepted")
s=restore(setup_checkpoint)
assert s.story.node==shed
gate(s,1039,yard)
gate(s,1316,ridge)
assert not len(s.enemies)
approach(s,1469,386)
assert frame(s).storySurveyRig.label=="脚を長く伸ばす"
core.action(s,"story_collect")
assert frame(s).storySurveyRig.ready
core.action(s,"story_survey_confirm")
assert progress(s).count==7 and progress(s).surveySupport is None
inspect(s,1592,386)
assert "休憩は後にしよう" in s.storyNotice
gate(s,1656,shed,y=386)
before=(s.progression.questXp,s.mora)
for _ in range(2):
    core.action(s,"story_report:"+quest)
reward=(QUEST_REPORT_EXP["Q-SNE-S01"],9200)
assert (s.progression.questXp-before[0],s.mora-before[1])==reward
assert frame(s).storyJoined.mitya and s.companion=="amber"
core.action(s,"story_select_joined:"+quest)
assert s.companion=="mitya"
joined=frame(s)
assert joined.starterEquipment.weapon.atk==1 and joined.starterEquipment.flower.hp==10
assert sum(d.source=="mitya-idle-source-v2.png" for d in joined.draws.values())==1
s=restore(checkpoint(s))
assert frame(s).starterEquipment and s.companion=="mitya"
gate(s,849,ridge)
inspect(s,1469,386)
assert "見通し3/3" in s.storyNotice and not frame(s).storySurveyRig

old=restore(fixture)
old.story.quests[legacy]=lua.table_from(dict(status="active",count=2))
old=restore(checkpoint(old))
gate(old,1380,old_field)
for foe in list(old.enemies.values())[:2]:
    strike(old,foe)
assert old.story.quests[legacy].count==4
gate(old,60,town)
core.action(old,"story_report:"+legacy)
core.action(old,"story_select_joined:"+legacy)
assert old.companion=="mitya" and frame(old).storyJoined.mitya
old=restore(checkpoint(old))
assert old.companion=="mitya" and frame(old).storyJoined.mitya and not frame(old).starterEquipment

proof=dict(firstMeetingBeforeMain=True,threeReadings=True,normalJumpLandings=[386,291],twoFailuresDiffer=True,
           inProgressSetupRestored=True,badSetupRejected=True,unexpectedReading=True,joinedAndStarter=True,
           noDuplicateMitya=True,revisitFixedRig=True,legacyCompletionAndSelection=True,reward=reward)
(ROOT/"evidence/sne-survey-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/sne-survey-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
