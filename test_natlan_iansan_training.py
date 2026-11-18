from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,course='natlan-hub','natlan-iansan-training'
quest,first,previous='natlan-iansan-self-test','natlan-ridge-flag','natlan-two-trials'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests={q['id']:q for q in graph['quests']}
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle,j,jump=(lua.table_from(data) for data in ({},{'attack':True},{'jump':True}))


def act(key):
    core.action(s,key)


def state():
    return s.story.quests[quest]


def frame():
    return core.frame(s,'sprite','legacy')


def actor():
    return s.actors[s.active]


def move(x,y=480):
    a=actor()
    a.x,a.y,a.vy,a.ground=x,y,0,True


def collect(x,label,y=480):
    move(x,y)
    assert frame().storyNearbyMilestone.label==label,native(frame().storyNearbyMilestone)
    act('story_collect')


def gate(x,node,available=True):
    old=s.story.node
    move(x)
    portal=frame().storyNearbyPortal
    assert portal and portal.to==node and portal.available is available,native(portal)
    act('story_nearby_portal')
    assert s.story.node==(node if available else old)


def save():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def reject(data,edit):
    changed=deepcopy(data)
    edit(changed['story']['quests'][quest]['trainingLog'])
    try:
        validate_save(changed)
    except ValueError:
        return
    raise AssertionError('Invalid training log accepted')


def normal_targets():
    for target in s.enemies.values():
        for _ in range(120):
            if target.hp<=0:
                break
            move(target.x-42)
            actor().dir=1
            advance(core,s,6,j)
        assert target.hp==0 and target.noRewards


def traverse(delay,allow_hit=False):
    advance(core,s,delay,idle)
    move(419)
    act('jump')
    advance(core,s,57,jump)
    assert actor().y==380 and s.iansanRound.marker
    move(659)
    advance(core,s,90,idle)
    assert frame().storyIansan.remaining==3
    normal_targets()
    if allow_hit:
        move(1110)
        advance(core,s,175,idle)
        assert s.iansanRound.hits>=1
        hp=actor().hp
        collect(1231,'水場で回復する')
        healed=actor().hp
        assert healed>hp
        collect(1231,'水場は利用済み')
        assert actor().hp==healed
    move(1526)
    advance(core,s,1,idle)
    assert not s.iansanRound and s.iansanPanel


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
for id_ in (first,previous):
    q=quests[id_]
    for step in q['itinerary']:
        s.story.visited[step['node']]=True
    for path in q.get('paths',[]):
        for step in path['steps']:
            s.story.visited[step['node']]=True
    s.story.quests[id_]=lua.table_from(dict(status='complete',count=q['goal'],cycles=1),recursive=True)
s.story.quests[previous].pathProgress=lua.table_from(dict(high=dict(count=4),water=dict(count=4)),recursive=True)
s.story.quests[previous].status='active'
act('story_accept:'+quest)
assert state() is None
s.story.quests[previous].status='complete'
fixture=save()
act('story_accept:'+quest)
assert state().count==0 and not s.iansanRound
gate(724,course,False)
collect(715,'イアンサに訓練の話を聞く')
gate(724,course)
actor().hp=111
before=(s.kills,s.mora,s.progression.killXp,s.gauge,s.hits,s.damage)
collect(155,'最初の一周を始める')
assert len(s.enemies)==3 and actor().hp==actor().maxhp
act('pause')
t=s.t
advance(core,s,90,idle)
assert s.t==t and s.iansanRound.stopped[1]==0
act('pause')
move(1526)
advance(core,s,2,idle)
assert s.iansanRound and '上段の印' in s.storyNotice
assert save()['story']['quests'][quest]['count']==1
traverse(55,allow_hit=True)
assert state().count==2 and frame().storyIansan.suggestion.id=='recovery'
baseline=native(state().trainingLog.baseline)
assert baseline['hits']>0 and baseline['stopped'][2]>=120
assert (s.kills,s.mora,s.progression.killXp,s.gauge,s.hits,s.damage)==before and actor().hp==111
after_first=save()
reject(after_first,lambda log:log['baseline'].update(stopped=[100000,0,0]))
reject(after_first,lambda log:log.update(focus='movement'))
act('story_iansan_focus:unknown')
assert state().count==2
act('story_iansan_focus:recovery')
assert state().count==3
s=restore(save())
assert state().trainingLog.focus=='recovery' and not s.iansanRound
gate(724,course)
collect(155,'もう一周する')
traverse(400)
assert state().count==4
retest=native(state().trainingLog.retest)
assert retest['ticks']>baseline['ticks']
assert retest['hits']==0
act('story_iansan_close')
gate(56,hub)
mora,xp=s.mora,s.progression.questXp
act('story_report:'+quest)
act('story_report:'+quest)
assert (s.mora-mora,s.progression.questXp-xp)==(6300,QUEST_REPORT_EXP['Q-NAT-S05'])
done=save()
reject(done,lambda log:log.update(focus='other'))
reject(done,lambda log:log.pop('retest'))
s=restore(done)
gate(724,course)
collect(155,'記録台を見る')
assert native(frame().storyIansan.retest)==retest
act('story_iansan_replay')
traverse(5)
assert frame().storyIansan.latest and native(state().trainingLog.baseline)==baseline
assert (s.mora-mora,s.progression.questXp-xp)==(6300,2991093)
act('story_iansan_replay')
act('story_collect')
assert not s.iansanRound and len(s.enemies)==0

(ROOT/'work/nat-iansan-training-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')
proof=dict(mainReportPrerequisite=True,pauseStopsClock=True,markerAndTargetsRequired=True,
           realTargetHitsAndNoDailyKills=True,companionLeavesTargetsForPlayer=True,
           trainingOnlyRecovery=True,onePriorityAndSavedFocus=True,
           baseline=baseline,retest=retest,slowerRetestAccepted=True,replayAndRestart=True,reward=[2991093,6300])
(ROOT/'evidence/nat-iansan-training-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Iansan actual hits and stops, no target reward, slower retest, save and replay passed')
