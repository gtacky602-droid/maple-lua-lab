from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, terrace = 'fontaine-hub', 'fon-photo-terrace'
quest, main = 'fon-navia-photo', 'fontaine-moon-parcel'
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests = {q['id']: q for q in graph['quests']}
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle, right = lua.table(), lua.table_from({'right': True})


def act(key):
    core.action(s,key)


def state():
    return s.story.quests[quest]


def frame():
    return core.frame(s,'sprite','legacy')


def view():
    return frame().storyNaviaPhoto


def move(x):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,480,0,True


def gate(x,target,available=True):
    before=s.story.node
    move(x)
    p=frame().storyNearbyPortal
    assert p and p.to==target and p.available is available,native(p)
    act('story_nearby_portal')
    assert s.story.node==(target if available else before)


def collect(x,label):
    move(x)
    assert frame().storyNearbyMilestone.label==label,native(frame().storyNearbyMilestone)
    act('story_collect')


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def restore(record):
    return core.restore(lua.table_from(record,recursive=True),12)


def reject(change):
    bad=deepcopy(checkpoint())
    change(bad['story']['quests'][quest])
    try:
        validate_save(bad)
    except ValueError as err:
        assert '集合写真' in str(err)
    else:
        raise AssertionError('Invalid photo progress accepted')


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
act('story_accept:'+quest)
assert state() is None
route=quests[main]
s.story.quests[main]=lua.table_from(dict(status='complete',count=route['goal'],cycles=1))
for step in route['itinerary']:
    s.story.visited[step['node']]=True
fixture=checkpoint()
(ROOT/'work/fon-navia-photo-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')

gate(316,terrace,False)
act('story_accept:'+quest)
gate(316,terrace)
for index,(x,label) in enumerate([
    (210,'ナヴィアに話を聞く'),(365,'荷受けの木箱を持つ'),(547,'荷置き場に箱を置く'),
    (720,'配達札を受け取りと配達に分ける'),(897,'カメラの台を支えて整備士を手伝う'),
],1):
    collect(x,label)
    assert state().count==index
    if index==2:
        assert any(d.source==core.naviaPhotoArt.crate.source and d.y==451 for d in frame().draws.values())
act('story_photo_seat:side')
assert state().groupPhoto is None
collect(1066,'椅子と台を並べる')
assert view().panel=='layout' and not view().ready
act('story_photo_confirm')
assert state().count==5
act('story_photo_riser:high')
assert view().ready
act('story_photo_seat:side')
assert view().seat=='side'
advance(core,s,24,right)
assert s.actors[s.active].x==1066

s=restore(checkpoint())
assert s.story.node==hub and not s.photoPanel
gate(316,terrace)
collect(1066,'椅子と台を並べる')
assert view().seat=='side' and view().riser=='high'
act('story_photo_riser:low')
assert view().ready
act('story_photo_confirm')
assert state().count==6
reject(lambda record:record['groupPhoto'].__setitem__('seat','center'))
reject(lambda record:record.pop('groupPhoto'))
reject(lambda record:record['groupPhoto'].__setitem__('posted','formal'))

collect(1066,'タイマーを巻く')
earlier=s.t
act('pause')
advance(core,s,330,idle)
assert s.t==earlier and state().count==6
act('pause')
advance(core,s,286,idle)
assert state().count==6 and s.photoTimer is None
assert '間に合いません' in s.storyNotice
collect(1066,'タイマーを巻く')
advance(core,s,48,right)
for _ in range(90):
    if s.actors[1].x>=1430:
        break
    advance(core,s,1,right)
assert 1430<=s.actors[1].x<=1480
advance(core,s,280,idle)
assert state().count==7 and s.photoTimer is None

captured=checkpoint()
rewards=[]
for print_id in ['formal','candid']:
    s=restore(captured)
    gate(316,terrace)
    collect(1724,'二枚の写真を見比べる')
    v=view()
    assert v.panel=='choose' and v.preview.formal and v.preview.candid
    assert len(v.preview.formal)==6 and len(v.preview.candid)==6
    assert native(v.preview.formal)!=native(v.preview.candid)
    act('story_photo_publish:invalid')
    assert state().count==7
    act('story_photo_publish:'+print_id)
    assert state().count==8
    gate(1843,hub)
    before=s.progression.questXp,s.mora
    act('story_report:'+quest)
    act('story_report:'+quest)
    rewards.append([s.progression.questXp-before[0],s.mora-before[1]])
    assert state().status=='complete'
    reject(lambda record:record['groupPhoto'].__setitem__('posted',['formal']))
    s=restore(checkpoint())
    gate(316,terrace)
    collect(1724,'掲示した集合写真を見る')
    v=view()
    assert v.panel=='read' and v.posted==print_id and list(v.preview.keys())==[print_id]
    act('story_photo_publish:formal')
    assert state().groupPhoto.posted==print_id

assert rewards==[[QUEST_REPORT_EXP['Q-FON-S03'],3600]]*2
proof={'quest':quest,'main1Required':True,'threeWorkers':True,'occlusionRejected':True,
       'layoutRestored':True,'timerFailureRetried':True,'actualWalkToMark':True,
       'pausedTimer':True,'variantsRestoreAndDisplay':True,'rewards':rewards}
(ROOT/'evidence/fon-navia-photo-lua.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
print(quest,proof)
