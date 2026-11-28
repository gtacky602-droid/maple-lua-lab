from copy import deepcopy
import json
import sys

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,water,room='fontaine-hub','fon-toy-shallows','fontaine-rehearsal-room'
main1,main2='fontaine-moon-parcel','fontaine-understage-crew'
quest='fon-freminet-dive'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests={q['id']:q for q in graph['quests']}
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle,up,down,right=(lua.table_from(data) for data in ({},{'up':True},{'down':True},{'right':True}))
earned='--earned' in sys.argv
work=ROOT/'work/earned-fontaine-acts'
source=ROOT/'work/earned-bygone-current/bygone-complete.json'


def act(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def state():
    return s.story.quests[quest]


def move(x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,not bool(s.toyDive)


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


def finished(id_):
    q=quests[id_]
    s.story.quests[id_]=lua.table_from(dict(status='complete',count=q['goal'],cycles=1))
    for item in q['itinerary']:
        s.story.visited[item['node']]=True


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def displayed(sprite):
    return any(draw.source==sprite.source and native(draw.box)==native(sprite.box)
               for draw in frame().draws.values())


if earned:
    work.mkdir(parents=True,exist_ok=True)
    s=restore(validate_save(json.loads(source.read_bytes())))
    assert s.progression.level==92 and s.story.quests['fon-mapped-bygone-current'].status=='complete'
    act('story_fast:'+hub)
    assert s.story.node==hub and s.story.quests[main1].status=='complete'
else:
    s=core.new(12)
    act('story_start')
    core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    act('story_accept:'+quest)
    assert state() is None
    finished(main1)
act('companion:emilie')
if s.active!=2:
    act('swap')
assert s.active==2 and s.companion=='emilie'
assert state() is None
fixture=checkpoint()
seed=work/'freminet-ready.json' if earned else ROOT/'work/fon-freminet-dive-fixture.json'
seed.write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')

act('story_accept:'+quest)
gate(484,water,False)
collect(477,'フレミネと玩具を点検する')
hp=s.actors[1].hp
s.actors[1].hp=0
gate(484,water,False)
blocked=frame()
destination=next(n for n in blocked.storyGraph.nodes.values() if n.id==water)
assert destination.travelerGateMessage==blocked.storyNearbyPortal.reason==s.storyNotice
s.actors[1].hp=hp
gate(484,water)
assert s.active==1 and s.toyDive.previousActive==2 and s.companion=='emilie'
assert len(s.enemies)==0 and not displayed(core.companionArt.emilie)
actor=s.actors[1]
saved=(actor.hp,s.gauge,s.actors[2].hp,s.auto)
for command in ('swap','normal','skill1','dodge','auto','boss_farka','companion:amber','story_start'):
    act(command)
assert s.active==1 and s.story.node==water and s.companion=='emilie'
assert (actor.hp,s.gauge,s.actors[2].hp,s.auto)==saved
assert not len(s.pending)
assert checkpoint()['active']==2

advance(core,s,24,down)
assert actor.y>220
advance(core,s,21,up)
assert actor.y<180
before=(actor.x,actor.y,s.t)
act('pause')
advance(core,s,24,right)
assert (actor.x,actor.y,s.t)==before
act('pause')
advance(core,s,33,up)
assert 146==actor.x and actor.y>=108
assert '回収灯へ戻り' in s.storyNotice

collect(291,'泡の向きを確かめる',216)
collect(525,'岩の陰の流れを調べる',368)
advance(core,s,3,idle)
move(685,265)
act('story_dive_reset')
assert actor.x==525 and actor.y==368
collect(715,'玩具が止まった場所を調べる',261)
move(744,261)
saw_push=False
for _ in range(100):
    advance(core,s,1,right)
    saw_push=saw_push or bool(s.toyDive.pushed)
assert actor.x<=761 and saw_push
advance(core,s,41,down)
assert actor.y>=380
advance(core,s,69,right)
assert actor.x>940
assert actor.hp==saved[0] and s.actors[2].hp==saved[2]
before_choice=checkpoint()

rewards,timers=[],[]
routes=[
    ('bubbles',961,379,'泡の列に目印を置く'),
    ('coral',1082,437,'珊瑚のくぼみに目印を置く'),
    ('arch',1199,362,'光の入る石窓に目印を置く'),
]
for id_,x,y,label in (routes[:1] if earned else routes):
    s=restore(before_choice)
    assert s.story.node==hub and s.active==2 and s.companion=='emilie'
    gate(484,water)
    collect(x,label,y)
    assert state().count==5 and state().storyChoice==id_
    remaining=frame().storyToyDive.toy.remaining
    assert remaining>0
    act('pause')
    advance(core,s,40,idle)
    assert frame().storyToyDive.toy.remaining==remaining
    act('pause')
    collect(1354,'玩具の到着を待つ',304)
    assert state().count==5
    before_route=checkpoint()
    broken=deepcopy(before_route)
    broken['story']['quests'][quest]['storyChoice']='drift'
    try:
        validate_save(broken)
    except ValueError:
        pass
    else:
        raise AssertionError('Unknown route accepted')
    s=restore(before_route)
    assert s.active==2
    gate(484,water)
    assert state().storyChoice==id_ and not frame().storyToyDive.toy.arrived
    restored_remaining=frame().storyToyDive.toy.remaining
    assert restored_remaining==remaining
    advance(core,s,80,idle)
    flying=frame().storyToyDive.toy
    assert flying.x>760 and flying.y>325 and not flying.arrived
    assert 0<flying.remaining<restored_remaining
    advance(core,s,220,idle)
    assert frame().storyToyDive.toy.arrived and frame().storyToyDive.toy.remaining is None
    timers.append(round(remaining,3))
    collect(1354,'玩具の帰還を見届ける',304)
    gate(1547,hub,y=250)
    assert s.active==2 and not s.toyDive and s.companion=='emilie'
    before=(s.progression.questXp,s.mora)
    act('story_report:'+quest)
    act('story_report:'+quest)
    rewards.append([s.progression.questXp-before[0],s.mora-before[1]])
    assert state().status=='complete'
    collect(477,'展示の潜航玩具を見る')
    assert displayed(core.freminetDiveArt.toy)
    gate(484,water)
    collect(1454,'浅瀬を眺める',177)
    assert '見晴らし' in frame().storyToyDive.message
    assert frame().storyToyDive.marker==quests[quest]['toyRoute']['markers'][id_]['name']
    move(747,261)
    advance(core,s,108,right)
    assert s.actors[1].x>1050 and not s.toyDive.pushed

assert rewards==[[QUEST_REPORT_EXP['Q-FON-S05'],4550]]*(1 if earned else 3)
gate(1547,hub,y=250)
if not earned:
    finished(main2)
gate(1240,room)
collect(1109,'展示の潜航玩具を見る')
advance(core,s,1,idle)
assert displayed(core.freminetDiveArt.toy)

proof={'quest':quest,'main1Prerequisite':True,'fourDirectionAndCurrent':True,'boundaryAndManualRecovery':True,
       'noCombatOrPartyMutation':True,'preservesActiveOnExitAndRestore':True,
       'routeDurationSeconds':timers,'toyExhibitAndPostQuestSightseeing':True}
report=ROOT/'evidence/fon-freminet-dive-lua.json'
if earned:
    assert s.progression.level==93 and state().storyChoice=='bubbles'
    gate(1264,hub)
    (work/'freminet-complete.json').write_text(json.dumps(checkpoint(),ensure_ascii=False)+'\n','utf8')
    proof.update(startLevel=92,endLevel=93,route='泡の列',source=source.name,rewards=rewards)
    report=ROOT/'evidence/earned-fontaine-freminet.json'
else:
    proof.update(threeSavedRoutesAndEqualReward=rewards)
report.write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
print(quest,proof)
