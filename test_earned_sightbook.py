"""Walk Ayaka's castle town from the level-40 ferry save and keep each possible illustration."""
import json
from runtime import ROOT, runtime
from test_earned_branch_quests import Journey
from tools.quest_guide_test import GuideChecks

quest='ayaka-join'
town, road, port='inazuma-town','inazuma-road','inazuma-port'
folder=ROOT/'work/inazuma-fresh-route'
folder.mkdir(exist_ok=True)
engine=runtime()
checks=GuideChecks('inazuma-sightbook')

def save(trip,name):
    path=folder/(name+'.json')
    path.write_text(json.dumps(trip.snapshot(),ensure_ascii=False),encoding='utf8')
    return path

def pending(trip):
    rows=trip.frame().storyWorksites
    return [p.point for p in rows[quest].values()] if rows and rows[quest] else []

trip=Journey(ROOT/'work/liyue-fresh-route/inazuma-save.json',engine)
assert trip.state.progression.level==40 and trip.state.story.node==port
ferry_hash=trip.source
trip.act('story_accept:inazuma-moving-lantern')
save(trip,'sightbook-start')
trip.act('story_accept:'+quest)
trip.cross(road)
trip.cross(town)
assert set(pending(trip))=={'sakura','rooftops','slope'}
for key,x,y in [('sakura',250,480),('rooftops',570,340),('slope',1090,480),('bridge',790,480)]:
    trip.approach(x,y,key)
    checks.expect(trip.frame(),quest,point=key,xy=(x,y))
    if key=='bridge':
        assert pending(trip)==['bridge']
        break
    trip.act('story_collect')
    assert key not in pending(trip)
    if key=='sakura':
        trip.restore()
        assert set(pending(trip))=={'rooftops','slope'}
        if trip.state.story.node!=town:
            trip.cross(road)
            trip.cross(town)
bridge=save(trip,'sightbook-bridge')
choices={}
for key in ('sakura','rooftops','slope','bridge'):
    trip=Journey(bridge,engine)
    if trip.state.story.node!=town:
        trip.cross(road)
        trip.cross(town)
    trip.approach(790,480,'bridge')
    trip.act('story_collect')
    assert {p.id for p in trip.frame().storySightChoices.values()}=={'sakura','slope','rooftops','bridge'}
    trip.act('story_sight_mark:'+key)
    assert trip.frame().storySightNote.id==key and not pending(trip)
    trip.cross(road)
    trip.cross(port)
    trip.report(quest)
    trip.restore()
    note=trip.frame().storySightNote
    assert note.id==key and note.node==town and note.quest==quest and trip.frame().storyJoined.ayaka
    choices[key]=dict(name=note.name,report=trip.reports[0])
checks.save()
(ROOT/'evidence/earned-sightbook.json').write_text(json.dumps(
    dict(ferrySave=ferry_hash,bridgeSave=trip.source,choices=choices),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(choices,ensure_ascii=False))
