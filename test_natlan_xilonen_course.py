from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core=runtime()
hub, lab, course='natlan-hub','natlan-xilonen-workshop','natlan-xilonen-course'
quest,first,second='natlan-xilonen-springs','natlan-ridge-flag','natlan-two-trials'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests={q['id']:q for q in graph['quests']}
spec=quests[quest]['springCourse']
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle,right=lua.table(),lua.table_from({'right':True})


def state():
    return s.story.quests[quest]


def frame():
    return core.frame(s,'sprite','legacy')


def act(key):
    core.action(s,key)


def actor():
    return s.actors[s.active]


def move(x,y=480):
    a=actor()
    a.x,a.y,a.vy,a.ground=x,y,0,True


def collect(x,expected,y=480):
    move(x,y)
    assert frame().storyNearbyMilestone.label==expected,native(frame().storyNearbyMilestone)
    act('story_collect')


def gate(x,node,y=480,available=True):
    previous=s.story.node
    move(x,y)
    p=frame().storyNearbyPortal
    assert p and p.to==node and p.available is available,native(p)
    act('story_nearby_portal')
    assert s.story.node==(node if available else previous)


def save():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def reject(data,mutate):
    edited=deepcopy(data)
    mutate(edited)
    try:
        validate_save(edited)
    except ValueError:
        return
    raise AssertionError('Invalid spring-course save was accepted')


def sample(x,label):
    collect(x,label)
    act('jump')
    advance(core,s,90,idle)
    assert not s.springRun and frame().storySpringCourse.result.kind=='sample'


def layout(rise,roof,reach):
    collect(650,'三つの踏み台を組み替える')
    for id_,value in [('rise',rise),('roof',roof),('reach',reach)]:
        act(f'story_spring_pick:{id_}:{value}')
    assert frame().storySpringCourse.ready
    act('story_spring_confirm')
    assert not s.springPanel


def until_x(x):
    for _ in range(350):
        if actor().x>=x:
            return
        advance(core,s,1,right)
    raise AssertionError((x,actor().x,actor().y,s.storyNotice))


def attempt(index,succeeds=True):
    section=spec['sections'][index-1]
    until_x(section['launch']['x']-2)
    act('jump')
    retry=s.springRun.retries
    for _ in range(120):
        advance(core,s,1,right)
        if s.springRun.section>index or s.springRun.retries>retry:
            break
    assert (s.springRun.section>index) is succeeds,(index,actor().x,actor().y,s.storyNotice)
    if not succeeds:
        assert s.springRun.retries==retry+1
    return s.storyNotice


def start():
    collect(139,'試走を始める')
    assert s.springRun.section==1


def finish():
    for index in range(1,4):
        attempt(index)
    until_x(1456)
    assert not s.springRun and actor().y==272
    return native(s.springResult)


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
act('story_accept:'+quest)
assert state() is None
s.story.quests[first]=lua.table_from(dict(status='complete',count=quests[first]['goal'],cycles=1))
for step in quests[first]['itinerary']:
    s.story.visited[step['node']]=True
for path in quests[second]['paths']:
    for step in path['steps']:
        s.story.visited[step['node']]=True
s.story.quests[second]=lua.table_from(
    dict(status='active',count=1,cycles=0,pathProgress=dict(high=dict(count=3),water=dict(count=3))),recursive=True)
act('story_accept:'+quest)
assert state() is None
pre=save()
for sole in ('high','water'):
    s=restore(pre)
    for route in ('high','water'):
        s.story.quests[second].pathProgress[route].count=4 if sole==route else 0
    act('story_accept:'+quest)
    assert state().count==0
    data=save()
    def remove_path(edited):
        edited['story']['quests'][second]['pathProgress'][sole]['count']=3
    reject(data,remove_path)

s=restore(pre)
s.story.quests[second].pathProgress.high.count=4
s.story.quests[second].pathProgress.water.count=0
act('companion:kachina')
act('swap')
assert s.active==2
fixture=save()
act('story_accept:'+quest)
gate(173,lab,available=False)
collect(244,'シロネンに試作品の話を聞く')
gate(173,lab)
sample(235,'高い型を試す')
assert state().count==1
sample(442,'低い型を試す')
assert state().count==2
heights=native(state().springRecord.samples)
assert heights['high']>2*heights['low'] and 148<=heights['high']<=155 and 60<=heights['low']<=67
gate(936,course,available=False)
collect(650,'三つの踏み台を組み替える')
act('story_spring_pick:rise:low')
act('story_spring_confirm')
assert state().count==2 and not frame().storySpringCourse.ready
draft=save()
s=restore(draft)
gate(173,lab)
collect(650,'三つの踏み台を組み替える')
assert frame().storySpringCourse.layout.rise=='low'
act('story_spring_close')
layout('low','high','low')
gate(936,course)
start()
actor0=(s.active,s.companion,actor().hp,s.gauge,s.kills,s.hits)
act('skill1')
act('swap')
assert (s.active,s.companion,actor().hp,s.gauge,s.kills,s.hits)==actor0 and len(s.pending)==0
act('pause')
frozen=(s.t,actor().x,actor().y)
advance(core,s,22,right)
assert (s.t,actor().x,actor().y)==frozen
act('pause')
assert '届きませんでした' in attempt(1,False)
assert actor().hp==actor0[2]
act('story_collect')
gate(56,lab)
layout('high','high','low')
gate(936,course)
start()
attempt(1)
assert '緩衝材' in attempt(2,False)
act('story_collect')
gate(56,lab)
layout('high','low','low')
gate(936,course)
start()
first_result=finish()
assert state().count==4 and first_result['best']==first_result['ticks'] and first_result['retries']==0
gate(1526,hub,272)
before=s.progression.questXp,s.mora
act('story_report:'+quest)
act('story_report:'+quest)
assert (s.progression.questXp-before[0],s.mora-before[1])==(QUEST_REPORT_EXP['Q-NAT-S04'],5900)
done=save()
reject(done,lambda d:d['story']['quests'][quest]['springRecord'].pop('layout'))
reject(done,lambda d:d['story']['quests'][quest]['springRecord']['best'].update({'high-low-low':-1}))
s=restore(done)
assert s.active==2 and s.companion=='kachina'
gate(173,lab)
gate(936,course)
assert frame().storySpringCourse.best==first_result['best']
start()
advance(core,s,90,idle)
slow_result=finish()
assert slow_result['ticks']>first_result['ticks'] and slow_result['best']==first_result['best']
gate(1526,hub,272)
gate(173,lab)
collect(650,'三つの踏み台を組み替える')
assert frame().storySpringCourse.draftBest==first_result['best']
act('story_spring_pick:reach:high')
assert frame().storySpringCourse.ready and frame().storySpringCourse.draftBest is None
act('story_spring_close')
layout('high','low','high')
gate(936,course)
start()
advance(core,s,75,idle)
second_result=finish()
assert second_result['retries']==0 and state().status=='complete'
assert second_result['best']>first_result['best']
assert len(native(state().springRecord.best))==2
assert (s.progression.questXp-before[0],s.mora-before[1])==(2325046,5900)
assert restore(save()).story.quests[quest].springRecord.best['high-low-low']==first_result['best']

(ROOT/'work/nat-xilonen-course-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')
proof=dict(eitherMainBranch=True,sampleHeights=heights,draftSurvivesSave=True,tooLowAndCeilingRecovery=True,
           twoLayoutsFinish=[first_result,second_result],noDamageOrPartyMutation=True,
           bestPerLayoutAfterRestore=True,reward=[2325046,5900])
(ROOT/'evidence/nat-xilonen-course-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Xilonen both prerequisites, two sample heights, safe failures, two layouts, replay and record passed')
