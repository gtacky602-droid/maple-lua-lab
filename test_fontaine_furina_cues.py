import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,room,arena='fontaine-hub','fontaine-rehearsal-room','fontaine-grand-stage'
main1,main2,main3='fontaine-moon-parcel','fontaine-understage-crew','fontaine-grand-finale'
quest='fon-furina-cues'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests={q['id']:q for q in graph['quests']}
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle=lua.table()


def act(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def state(id_=quest):
    return s.story.quests[id_]


def move(x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def gate(x,target,y=480):
    move(x,y)
    p=frame().storyNearbyPortal
    assert p and p.to==target and p.available,native(p)
    act('story_nearby_portal')
    assert s.story.node==target


def interact(x,label,y=480):
    move(x,y)
    assert frame().storyNearbyMilestone.label==label,native(frame().storyNearbyMilestone)
    act('story_collect')


def reached(id_,count,status):
    q=quests[id_]
    record=dict(status=status,count=count,cycles=1 if status=='complete' else 0)
    if id_==main3:
        record['stagePlan']='deck'
    s.story.quests[id_]=lua.table_from(record)
    for milestone in q['itinerary'][:count]:
        s.story.visited[milestone['node']]=True


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def cue(name):
    act('story_rehearsal:'+name)


def rehearsal():
    return frame().storyFurinaRehearsal


def show():
    return frame().storyFurinaFinale


def round_one():
    interact(245,'フリーナと舞台係に話を聞く')
    interact(454,'装置を一つずつ試す')
    assert rehearsal().round==1 and rehearsal().cue=='curtain'
    cue('wave')
    assert rehearsal().cue=='curtain'
    cue('curtain')
    assert rehearsal().curtain and not rehearsal().light and rehearsal().cue=='lamp'
    cue('lamp')
    assert rehearsal().light and rehearsal().cue=='wave'
    cue('wave')
    assert state().count==2 and not rehearsal().open


def round_two():
    interact(454,'一拍置く稽古を始める')
    assert rehearsal().round==2 and rehearsal().cue=='pair' and not rehearsal().ready
    cue('pair')
    assert not rehearsal().curtain and not rehearsal().light and state().count==2
    act('pause')
    t=s.t
    advance(core,s,150,idle)
    assert s.t==t and rehearsal().paused and not rehearsal().ready
    act('pause')
    advance(core,s,300,lua.table_from({'right':True}))
    assert s.actors[s.active].x==454
    assert rehearsal().ready
    cue('pair')
    assert rehearsal().curtain and rehearsal().light and not rehearsal().wave and rehearsal().cue=='wave'
    started=s.furinaRun.curtainAt
    cue('wave')
    assert state().count==2 and s.furinaRun.curtainAt==started
    advance(core,s,75,idle)
    cue('wave')
    assert state().count==3 and rehearsal().wave and not rehearsal().open


def report():
    interact(245,'拍手を受け取る')
    gate(1264,hub)
    before=(s.progression.questXp,s.mora)
    act('story_report:'+quest)
    act('story_report:'+quest)
    assert state().status=='complete'
    assert [s.progression.questXp-before[0],s.mora-before[1]]==[QUEST_REPORT_EXP['Q-FON-S02'],3300]


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
act('story_accept:'+quest)
assert state() is None
reached(main1,quests[main1]['goal'],'complete')
act('story_accept:'+quest)
assert state() is None
reached(main2,quests[main2]['goal'],'complete')
pre_main=checkpoint()
reached(main3,quests[main3]['goal'],'complete')
late=checkpoint()
(ROOT/'work/fon-furina-cues-fixture.json').write_text(json.dumps(late,ensure_ascii=False)+'\n',encoding='utf8')

s=restore(pre_main)
act('story_accept:'+quest)
gate(1240,room)
cue('pair')
assert state().count==0 and not rehearsal().open
round_one()
s=restore(checkpoint())
assert s.story.node==room and state().count==2
round_two()
report()

# The first public performance uses the rehearsal only after it has been reported.
reached(main3,5,'active')
core.enterStoryNode(s,arena)
move(1447,390)
assert show() is None
act('story_collect')
advance(core,s,91,idle)
assert frame().storyTheaterPerformance.phase=='cue'
act('story_collect')
assert state(main3).count==6 and show().phase=='lights' and show().curtain and show().light
move(1325,390)
act('story_collect')
assert s.theaterEncoreAt is None and show().phase=='lights'
advance(core,s,41,idle)
assert show().phase=='wave'
advance(core,s,46,idle)
assert show().phase=='bow'
gate(1602,hub,390)
act('story_report:'+main3)
assert state(main3).status=='complete'

s=restore(late)
gate(1320,arena)
move(1447,390)
assert show() is None and frame().storyNearbyMilestone.label=='公演再開の記録を読む'
gate(1602,hub,390)
act('story_accept:'+quest)
gate(1240,room)
round_one()
interact(454,'一拍置く稽古を始める')
cue('close')
assert state().count==2 and not rehearsal().open
round_two()
report()

s=restore(checkpoint())
gate(1320,arena)
move(1447,390)
assert show().phase=='bow'
score=(s.progression.questXp,s.mora)
assert frame().storyNearbyMilestone.label=='公演再開の記録を読む'
interact(1325,'稽古の演出でもう一度上演する',390)
assert show().phase=='quiet' and not show().light and not show().curtain and not show().wave
advance(core,s,30,idle)
act('story_collect')
advance(core,s,61,idle)
assert show().phase=='lights' and show().light and show().curtain and not show().wave
advance(core,s,41,idle)
assert show().phase=='wave'
advance(core,s,45,idle)
assert show().phase=='bow'
assert (s.progression.questXp,s.mora)==score
assert state(main3).count==6 and state(quest).count==4
proof={'quest':quest,'main2Required':True,'threeDevices':True,'pauseFreezesQuiet':True,
       'softRetryKeepsProgress':True,'firstPerformanceUsesRehearsal':True,'lateEncore':True,
       'quietLightsWaveBow':True,'noEncoreRewards':True,
       'reportReward':[QUEST_REPORT_EXP['Q-FON-S02'],3300]}
(ROOT/'evidence/fon-furina-cues-lua.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
print(quest,proof)
