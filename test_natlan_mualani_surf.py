import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,run,cove='natlan-hub','natlan-surf-run','natlan-surf-cove'
quest,main='natlan-mualani-surf','natlan-ridge-flag'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
specs={q['id']:q for q in graph['quests']}
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle,right=lua.table(),lua.table_from({'right':True})


def act(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def state():
    return s.story.quests[quest]


def actor():
    return s.actors[s.active]


def move(x):
    a=actor()
    a.x,a.y,a.vy,a.ground=x,480,0,True


def gate(x,target,available=True):
    previous=s.story.node
    move(x)
    p=frame().storyNearbyPortal
    assert p and p.to==target and p.available is available,native(p)
    act('story_nearby_portal')
    assert s.story.node==(target if available else previous)


def collect(x):
    move(x)
    assert frame().storyNearbyMilestone
    act('story_collect')


def save():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def skate_until(x):
    for _ in range(480):
        if actor().x>=x:
            return
        advance(core,s,1,right)
    raise AssertionError((x,actor().x,s.storyNotice))


def finish_run(first_hop=462):
    for _ in range(850):
        if not s.surfRound:
            return
        x=actor().x
        if actor().ground and (first_hop<=x<first_hop+70 or 1015<=x<1080):
            act('jump')
        advance(core,s,1,right)
    raise AssertionError((actor().x,actor().y,s.storyNotice))


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
act('companion:emilie')
act('swap')
act('story_accept:'+quest)
assert state() is None and s.active==2
s.story.quests[main]=lua.table_from(dict(status='complete',count=specs[main]['goal'],cycles=1))
for item in specs[main]['itinerary']:
    s.story.visited[item['node']]=True
fixture=save()
act('story_accept:'+quest)
assert state().count==0
gate(545,run,False)
collect(302)
gate(545,run)
gate(1562,cove,False)
collect(190)
assert state().count==2 and frame().storySurf.phase=='run'
snapshot=(s.active,s.companion,actor().hp,s.mora,s.gauge,s.kills,s.hits)
for command in ('swap','normal','skill1','dodge','auto','companion:kachina','story_start','story_portal:'+hub):
    act(command)
assert (s.active,s.companion,actor().hp,s.mora,s.gauge,s.kills,s.hits)==snapshot and s.story.node==run
assert len(s.pending)==0
advance(core,s,95,right)
assert frame().storySurf.retries>=1
first=frame().storySurf.retries
act('pause')
frozen=(s.t,actor().x,actor().y)
advance(core,s,20,right)
assert (s.t,actor().x,actor().y)==frozen
act('pause')
skate_until(480)
act('jump')
skate_until(820)
assert s.surfRound.bank==807
advance(core,s,95,right)
assert frame().storySurf.retries>first and actor().x>=807
mid=save()
assert mid['active']==2 and mid['story']['quests'][quest]['count']==2
s=restore(mid)
assert s.story.node==hub and s.active==2 and not s.surfRound
gate(545,run)
collect(190)
finish_run()
assert state().count==3 and s.surfResult.rings<3
attempt=native(s.surfResult)
gate(1562,cove)
assert len(s.enemies)==0
gate(1074,hub,False)
collect(445)
act('story_surf_hit')
advance(core,s,1,idle)
assert state().count==3 and 'まだ届きません' in s.storyNotice
advance(core,s,150,idle)
assert s.surfRound.retries>=1
for _ in range(175):
    if frame().storySurf.ready:
        act('story_surf_hit')
        advance(core,s,1,idle)
        break
    advance(core,s,1,idle)
assert state().count==4 and not s.surfRound and s.surfResult.kind=='cove'
assert (s.active,s.companion,actor().hp,s.mora,s.gauge,s.kills,s.hits)==snapshot
collect(445)
assert frame().storySurf.phase=='cove'
act('story_collect')
assert frame().storySurf.phase=='idle' and state().count==4
gate(1074,hub)
before=s.progression.questXp,s.mora
act('story_report:'+quest)
act('story_report:'+quest)
assert (s.progression.questXp-before[0],s.mora-before[1])==(QUEST_REPORT_EXP['Q-NAT-S02'],4900)
s=restore(save())
collect(307)
assert '波札' in s.storyNotice
gate(545,run)
collect(190)
finish_run(first_hop=378)
assert s.surfResult.rings==3 and state().count==4
gate(1562,cove)
collect(445)
assert frame().storySurf.phase=='cove' and state().status=='complete'
act('story_collect')
gate(1074,hub)
assert (s.progression.questXp-before[0],s.mora-before[1])==(1404867,4900)

(ROOT/'work/nat-mualani-surf-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')
proof=dict(firstChapterPrerequisite=True,bothShallowRecoveries=True,ordinaryCombatInert=True,boardAttempt=attempt,
           optionalFullRingReplay=True,
           pauseAndPartyPreserved=True,midCourseSaveRestoresTown=True,ballMissAndRetry=True,
           replayAndExit=True,reward=[1404867,4900],mementoAfterReload=True)
(ROOT/'evidence/nat-mualani-surf-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Mualani practice, wave falls, timed rally, replay, checkpoints and reward passed')
