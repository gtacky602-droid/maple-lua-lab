from copy import deepcopy
import json
import sys

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,room='fontaine-hub','fontaine-rehearsal-room'
wings,seats,stage='fon-magic-wings','fon-magic-seats','fontaine-grand-stage'
main1,main2,main3='fontaine-moon-parcel','fontaine-understage-crew','fontaine-grand-finale'
quest='fon-lyney-magic'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests={q['id']:q for q in graph['quests']}
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle,jump,right=(lua.table_from(data) for data in ({},{'jump':True},{'right':True}))
earned='--earned' in sys.argv
work=ROOT/'work/earned-fontaine-acts'
morte='fon-morte-sluice-survey'


def act(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def state(id_=quest):
    return s.story.quests[id_]


def move(x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def gate(x,target,available=True,y=480):
    before=s.story.node
    move(x,y)
    portal=frame().storyNearbyPortal
    assert portal and portal.to==target and portal.available is available,native(portal)
    act('story_nearby_portal')
    assert s.story.node==(target if available else before)


def collect(x,label,y=480):
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


def displayed(key):
    a=core.lyneyMagicArt[key]
    return any(d.source==a.source and native(d.box)==native(a.box) for d in frame().draws.values())


def observe(phase):
    v=frame().storyLyneyMagic
    assert v.phase==phase,native(v)
    return v


def rehearse(variant,pos,name,label):
    collect(pos,name)
    assert state().storyChoice==variant and state().count==5
    collect(1179,'新しい演目の合図を待つ')
    assert state().count==5 and observe('wait').variant==variant
    cue_remaining=observe('wait').cueRemaining
    assert cue_remaining==quests[quest]['pocketMagic']['cueDelay']
    act('story_collect')
    assert '合図の前' in observe('wait').message
    act('pause')
    observed=s.t
    advance(core,s,120,idle)
    assert s.t==observed and state().count==5
    assert observe('wait').cueRemaining==cue_remaining
    act('pause')
    advance(core,s,66,right)
    assert s.actors[s.active].x==1179
    assert observe('cue').variant==variant and observe('cue').cueRemaining is None
    collect(1179,label)
    observe('show')
    advance(core,s,74,idle)
    assert observe('reveal').birds and displayed('birds')
    assert displayed('screen')==(variant=='light')
    advance(core,s,134,idle)
    assert state().count==6 and displayed('broken')


def witness_and_report():
    gate(1555,seats)
    collect(424,'客席から演目を見る')
    advance(core,s,72,idle)
    assert observe('reveal').birds and not observe('reveal').cartVisible
    assert not displayed('cart') and not displayed('broken') and displayed('birds')
    advance(core,s,132,idle)
    assert state().count==7
    gate(1216,hub)
    before=(s.progression.questXp,s.mora)
    act('story_report:'+quest)
    act('story_report:'+quest)
    assert state().status=='complete'
    return [s.progression.questXp-before[0],s.mora-before[1]]


if earned:
    s=restore(validate_save(json.loads((work/'freminet-complete.json').read_bytes())))
    assert s.story.node==hub and s.progression.level==93 and state(main3).status=='complete'
    assert state('fon-freminet-dive').storyChoice=='bubbles'
    act('story_accept:'+morte)
    assert state(morte) is None
else:
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
    fixture=checkpoint()
    reached(main3,quests[main3]['goal'],'complete')
    late_fixture=checkpoint()
    (ROOT/'work/fon-lyney-magic-fixture.json').write_text(json.dumps(late_fixture,ensure_ascii=False)+'\n',encoding='utf8')
    s=restore(fixture)
act('story_accept:'+quest)
gate(1240,room)
gate(997,wings)
collect(219,'リネとリネットに段取りを聞く')
gate(1555,seats,False)
move(553)
act('story_collect')
assert state().count==1
act('jump')
for _ in range(120):
    advance(core,s,1,jump)
    actor=s.actors[s.active]
    if actor.y==392 and actor.ground:
        break
else:
    raise AssertionError((s.active,actor.x,actor.y,actor.ground,s.storyNotice))
collect(553,'上段から箱の通り道を調べる',392)
gate(1555,seats)
collect(424,'客席から舞台を見渡す')
assert observe('idle').cartVisible is False and not displayed('cart')
gate(56,wings)
collect(819,'合図に合わせて箱を送る')
assert displayed('cart') and observe('wheel').cartVisible
advance(core,s,99,idle)
assert state().count==4 and displayed('broken') and not displayed('cart')
after_stop=checkpoint()

rewards=[]
plans=[
    ('curtain',1100,'二重の幕を使う','合図に合わせて幕を開ける'),
    ('light',1303,'逆光の影絵を使う','合図に合わせて逆光を切り替える'),
]
for variant,pos,name,label in (plans[1:] if earned else plans):
    s=restore(after_stop)
    assert s.story.node==room and state().count==4
    gate(997,wings)
    rehearse(variant,pos,name,label)
    saved=checkpoint()
    bad=deepcopy(saved)
    bad['story']['quests'][quest]['storyChoice']='wheel'
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError('Unsafe cart branch accepted in checkpoint')
    s=restore(saved)
    gate(997,wings)
    rewards.append(witness_and_report())
    s=restore(checkpoint())
    gate(1240,room)
    gate(997,wings)
    gate(1555,seats)
    score=s.progression.questXp
    collect(424,'客席からもう一度見る')
    advance(core,s,74,idle)
    assert observe('reveal').variant==variant and not displayed('broken')
    advance(core,s,134,idle)
    assert s.progression.questXp==score

if earned:
    gate(1216,hub)
else:
    # Report the side quest before the chapter's first staged performance.
    reached('fon-furina-cues',4,'complete')
    reached(main3,5,'active')
    core.enterStoryNode(s,stage)
    move(1046)
    assert frame().storyLyneyMagic is None
    move(1447,390)
    act('story_collect')
    advance(core,s,91,idle)
    act('story_collect')
    assert state(main3).count==6
    assert not observe('idle').message and frame().storyFurinaFinale.phase=='lights'
    advance(core,s,187,idle)
    assert observe('reveal').chapter and observe('reveal').variant=='light'
    advance(core,s,140,idle)
    assert not observe('idle').chapter
    gate(1602,hub,y=390)
    act('story_report:'+main3)
    s=restore(checkpoint())
gate(1320,stage)
move(1046)
assert observe('idle').variant=='light'
collect(1046,'主舞台の追加演目を見る')
advance(core,s,73,idle)
assert observe('reveal').birds
assert rewards==[[QUEST_REPORT_EXP['Q-FON-S04'],4200]]*(1 if earned else 2)

proof={'quest':quest,'requiresMain2':True,'upperWingRoute':True,'audienceOcclusion':True,
       'wheelFailureLocksCart':True,'pauseAndEarlyCueHandled':True,
       'storedPlanReplays':True}
report=ROOT/'evidence/fon-lyney-magic-lua.json'
if earned:
    assert s.progression.level==94 and s.returns==0
    advance(core,s,160,idle)
    gate(1602,hub,y=390)
    act('story_accept:'+morte)
    assert state(morte).status=='active' and state(morte).count==0
    (work/'acts-complete.json').write_text(json.dumps(checkpoint(),ensure_ascii=False)+'\n','utf8')
    proof.update(startLevel=93,endLevel=94,plan='逆光の影絵',morteAccepted=True,mainStageEncore=True,rewards=rewards)
    report=ROOT/'evidence/earned-fontaine-lyney.json'
else:
    proof.update(twoSafePlans=True,chapterFirstShowAndEncore=True,sameRewards=rewards)
report.write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
print(quest,proof)
