from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, stop, glade = 'sumeru-hub', 'sumeru-observation-stop', 'sum-nahida-dew-glade'
quest = 'sum-nahida-map'
main1, main2 = 'sumeru-leaf-crossing', 'sumeru-forest-levels'
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests = {q['id']: q for q in graph['quests']}
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
empty = lua.table()
right = lua.table_from({'right': True})


def action(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def record():
    return s.story.quests[quest]


def move(x,y=480):
    actor=s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground=x,y,0,True


def gate(x,to,available=True):
    move(x)
    near=frame().storyNearbyPortal
    assert near and near.to==to and near.available is available, native(near)
    before=s.story.node
    action('story_nearby_portal')
    assert s.story.node==(to if available else before),s.story.node


def finished_main(id_):
    q=quests[id_]
    s.story.quests[id_]=lua.table_from(dict(status='complete',count=q['goal'],cycles=1))
    for step in q['itinerary']:
        s.story.visited[step['node']]=True


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def begin():
    action('story_accept:'+quest)
    move(950)
    action('story_discovery_pick:leaf')
    assert record().discoveryDraft is None
    action('story_collect')
    assert record().count==1 and not frame().storyDiscoveryMap


def open_map():
    move(950)
    action('story_collect')
    assert frame().storyDiscoveryMap
    return frame().storyDiscoveryMap


def pick(id_):
    action('story_discovery_pick:'+id_)


def method(id_,value):
    action('story_discovery_method:'+id_+':'+value)


def confirm():
    action('story_discovery_confirm')


def report():
    before=(s.progression.questXp,s.mora)
    action('story_report:'+quest)
    action('story_report:'+quest)
    assert record().status=='complete'
    return [s.progression.questXp-before[0],s.mora-before[1]]


def reject(change):
    bad=deepcopy(checkpoint())
    change(bad['story']['quests'][quest])
    try:
        validate_save(bad)
    except ValueError as err:
        assert 'discovery' in str(err).lower() or 'Undiscovered' in str(err)
    else:
        raise AssertionError('Invalid discovery map save accepted')


s=core.new(12)
action('story_start')
core.grantExp(s,LEVELS[59]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
action('story_accept:'+quest)
assert record() is None
finished_main(main1)
action('story_accept:'+quest)
assert record() is None
finished_main(main2)
fixture=checkpoint()
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/sum-nahida-map-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')

gate(1162,stop)
gate(983,glade,False)
gate(55,hub)
begin()
view=open_map()
assert [card.id for card in view.cards.values() if card.known]==['leaf','roots','branches']
initial_visited=native(s.story.visited)
pick('sky')
pick('dew')
assert record().discoveryDraft is None
pick('leaf')
pick('roots')
pick('branches')
confirm()
assert record().count==1 and not frame().storyDiscoveryMap.ready
method('leaf','notvalid')
assert record().discoveryDraft.leaf==''
method('leaf','below')
method('roots','steps')
assert frame().storyDiscoveryMap.described==2
advance(core,s,45,right)
assert s.actors[s.active].x==950
action('story_portal:sumeru-observation-stop')
assert s.story.node==hub
reject(lambda q:q['discoveryDraft'].__setitem__('dew','leaf'))
reject(lambda q:q.__setitem__('discoveryDew',True))
reject(lambda q:q['discoveryDraft'].__setitem__('roots',['steps']))
reject(lambda q:q['discoveryDraft'].__setitem__('roots','panel'))
s=restore(checkpoint())
assert s.story.node==hub and not frame().storyDiscoveryMap
assert open_map().described==2
method('branches','sound')
confirm()
assert record().count==2 and not frame().storyDiscoveryMap
reject(lambda q:q.pop('discoveryDraft'))
reject(lambda q:q['discoveryDraft'].__setitem__('leaf',''))
reward=report()
assert reward==[QUEST_REPORT_EXP['Q-SUM-S05'],2600]
s=restore(checkpoint())
view=open_map()
assert view.posted and view.readOnly and view.ready
assert {card.id:card.method for card in view.cards.values()}=={'leaf':'below','roots':'steps','branches':'sound'}
method('leaf','panel')
assert record().discoveryDraft.leaf=='below'
assert native(s.story.visited)==initial_visited and not s.story.visited[glade]

s=restore(fixture)
begin()
finished_main('sumeru-observatory-map')
gate(1162,stop)
gate(983,glade)
move(620)
action('story_collect')
assert not record().discoveryDew
move(620,480)
action('jump')
advance(core,s,26,lua.table_from({'jump':True}))
advance(core,s,28,empty)
assert s.actors[s.active].y==394,native(frame().actors)
assert frame().storyNearbyMilestone.label=='葉の上の朝露を調べる'
action('story_collect')
assert record().discoveryDew and len(s.enemies)==0
s=restore(checkpoint())
assert s.story.node==hub and record().discoveryDew
assert all(card.known for card in open_map().cards.values())
for name,way in [('sky','canopy'),('dew','gleam'),('leaf','panel')]:
    pick(name)
    method(name,way)
pick('roots')
assert record().discoveryDraft.roots is None
confirm()
assert report()==reward
posted={card.id:card.method for card in open_map().cards.values()}
assert posted=={'sky':'canopy','dew':'gleam','leaf':'panel'}
proof={'quest':quest,'prerequisite':main2,'reused':['leaf','roots','branches'],
       'originalThreeRequiredNoRevisit':True,'optionalSite':glade,'dewElevation':394,
       'alternativePostedMap':posted,'equalChoiceRewards':reward,'rejectedDrafts':6}
(ROOT/'evidence/sum-nahida-map-lua.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
print(f'{quest}: saved draft, equal rewards, optional glade and posted map verified')
