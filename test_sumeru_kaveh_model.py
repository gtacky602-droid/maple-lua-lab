from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, shop = 'sumeru-hub', 'sum-kaveh-workshop'
observatory, room = 'sumeru-sky-observatory', 'sum-kaveh-reading-room'
quest = 'sum-kaveh-model'
main2, main3 = 'sumeru-forest-levels', 'sumeru-observatory-map'
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests = {q['id']:q for q in graph['quests']}
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def action(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def move(x):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground = x, 480, 0, True


def gate(x,to,available=True):
    move(x)
    near = frame().storyNearbyPortal
    assert near and near.to == to and near.available is available, native(near)
    source = s.story.node
    action('story_nearby_portal')
    assert s.story.node == (to if available else source)


def record():
    return s.story.quests[quest]


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def finished_main(id_):
    route = quests[id_]
    s.story.quests[id_] = lua.table_from(dict(status='complete',count=route['goal'],cycles=1))
    for step in route['itinerary']:
        s.story.visited[step['node']] = True


def start():
    action('story_accept:'+quest)
    gate(702,shop)
    move(450)
    action('story_model_move:shelves')
    assert not record().roomLayout
    action('story_collect')
    assert record().count == 1 and not frame().storyKavehModel
    action('story_collect')
    assert frame().storyKavehModel.here.id == 'entrance'


def pawn(where):
    action('story_model_move:'+where)
    assert frame().storyKavehModel.here.id == where


def choose(field,value):
    action('story_model_set:'+field+':'+value)
    assert record().roomLayout[field] == value


def report():
    gate(65,hub)
    before = (s.progression.questXp,s.mora)
    action('story_report:'+quest)
    action('story_report:'+quest)
    return [s.progression.questXp-before[0],s.mora-before[1]]


def reject(change):
    bad = deepcopy(checkpoint())
    change(bad['story']['quests'][quest])
    try:
        validate_save(bad)
    except ValueError as error:
        assert '閲覧室' in str(error)
    else:
        raise AssertionError('Invalid layout was accepted')


def displayed(key,x,flip=False):
    return any(d.source == core.kavehRoomArt[key].source and native(d.box) == native(core.kavehRoomArt[key].box)
               and d.x == x-s.camera and d.flip is flip for d in frame().draws.values())


s = core.new(12)
action('story_start')
core.grantExp(s,LEVELS[59]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
action('story_accept:'+quest)
assert not record()
finished_main('sumeru-leaf-crossing')
finished_main(main2)
before_observatory = checkpoint()
finished_main(main3)
fixture = checkpoint()
s = load(before_observatory)
start()

initial = frame().storyKavehModel.result
assert initial.storage == 7 and not initial.view and initial.visited == 1
action('story_model_move:window')
action('story_model_set:shelf:wall')
assert record().roomLayout.station == 'entrance' and record().roomLayout.shelf == 'center'
advance(core,s,60,lua.table_from({'right':True}))
assert s.actors[s.active].x == 450
pawn('shelves')
choose('shelf','low')
result = frame().storyKavehModel.result
assert result.view and result.storage == 4 and not result.ready
reject(lambda q:q['roomLayout'].__setitem__('shelf','bad'))
reject(lambda q:q['roomLayout'].__setitem__('station',['bad']))
s = load(checkpoint())
assert s.story.node == hub and record().roomLayout.shelf == 'low'
gate(702,shop)
move(450)
action('story_collect')
assert frame().storyKavehModel.here.id == 'shelves'
action('story_model_close')
assert not frame().storyKavehModel
action('story_model_set:shelf:wall')
assert record().roomLayout.shelf == 'low'
action('story_collect')
choose('shelf','wall')
pawn('window')
choose('window','inward')
pawn('seat')
choose('seat','view')
result = frame().storyKavehModel.result
assert result.storage == 8 and result.view and result.visited == 4 and not result.clear
action('story_model_confirm')
assert record().count == 1 and frame().storyKavehModel
choose('seat','aisle')
assert frame().storyKavehModel.result.ready
action('story_model_confirm')
assert record().count == 2 and not frame().storyKavehModel
reject(lambda q:q.pop('roomLayout'))
reject(lambda q:q['roomLayout'].__setitem__('seat','view'))
reward = report()
assert reward == [QUEST_REPORT_EXP['Q-SUM-S04'],2450] and record().status == 'complete'
core.enterStoryNode(s,observatory)
gate(1237,room,False)
finished_main(main3)
gate(1237,room)
assert frame().storyKavehRoom.window == 'inward' and not len(s.enemies)
move(1040)
advance(core,s,1,lua.table())
assert displayed('windowIn',1040) and displayed('desk',640,True)
action('story_collect')
assert '内に開く窓' in frame().storyNotice
s = load(checkpoint())
assert s.story.node == observatory
gate(1237,room)
assert frame().storyKavehRoom.storage == 8

s = load(fixture)
core.enterStoryNode(s,observatory)
move(1237)
assert not frame().storyNearbyPortal
action('story_fast:'+hub)
start()
pawn('shelves')
choose('shelf','wall')
pawn('window')
pawn('seat')
choose('seat','view')
assert frame().storyKavehModel.result.ready
action('story_model_confirm')
assert report() == reward
gate(1282,observatory)
gate(1237,room)
move(870)
advance(core,s,1,lua.table())
assert displayed('windowOut',1040) and displayed('desk',864)
assert frame().storyKavehRoom.seat == 'view' and frame().storyKavehRoom.window == 'outward'
checkpoint()

proof = {
    'mainPrerequisite':True,'adjacentPawnAndInputIsolation':True,'rejectsChangingPartsAwayFromStation':True,
    'blockedViewVsStorage':True,'seatClashesWithInwardWindow':True,'draftAndStationRestore':True,
    'invalidSavedPlanRejected':True,'roomBothCompletionOrders':True,
    'distinctInstalledLayouts':True,'roomRestores':True,'reward':reward,
}
(ROOT/'evidence/sum-kaveh-room-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/sum-kaveh-room-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
