"""Replay the entry and current surveys, then prepare an earned save for the later ruins."""
import json

from runtime import ROOT, runtime
from test_earned_survey_itineraries import SurveyJourney, quests


WORK = ROOT/'work/earned-bygone-current'
LOW = ROOT/'work/earned-fontaine-surveys/surveys-complete.json'
HIGH = ROOT/'work/cap-fresh-route/lv200-save.json'
HUB, CAMP, CAVE = 'fontaine-hub', 'bygone-camp', 'bygone-depth'
WEST, EAST = 'bygone-wp-68604', 'bygone-wp-68605'
PIER = 'bygone-waterway-pier'
SURVEY, CURRENT = 'bygone-survey', 'fon-mapped-bygone-current'
RUINS = ('bygone-stone-rubbings','bygone-lit-passage','bygone-sound-book')


def save(trip, name):
    path = WORK/f'{name}.json'
    path.write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def depth_gate(trip, target, y, direction, label):
    origin = trip.state.story.node
    gate = next(e for e in trip.exits[origin] if e['to']==target)
    trip.approach(gate['x'],y,target)
    hint = trip.frame().storySwimGate
    assert hint.to==target and hint.direction==direction and hint.name==label
    route = trip.guide(target)
    step, = route['stops']
    assert route['status']=='ready' and step['mode']=='swim' and label in step['hint']
    assert ('浮上' if direction=='up' else '潜る') in step['hint']
    trip.act('story_nearby_portal')
    assert trip.state.story.node==origin
    trip.cross(target)
    assert trip.frame().storySwimGate is None
    return dict(origin=origin,target=target,direction=direction,gateY=gate['y'],hint=step['hint'])


def low_route():
    trip = SurveyJourney(LOW,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==92
    assert trip.state.story.quests['fon-mapped-north-lock'].status=='complete'
    assert not trip.state.story.visited[CAMP]
    save(trip,'bygone-ready')
    entry = trip.travel(CAMP)
    assert [leg['id'] for leg in entry]==['fontaine-field',CAMP]
    trip.confirm_lock(PIER,'必要レベル 148')
    assert trip.guide(PIER)['reason']=='必要Lv148'
    for quest in (SURVEY,CURRENT):
        trip.act('story_accept:'+quest)
    trip.cross(CAVE)
    assert trip.state.story.quests[SURVEY].count==1 and trip.state.story.quests[CURRENT].count==1
    trip.cross(WEST)
    assert trip.state.story.quests[CURRENT].count==2
    gates = [depth_gate(trip,EAST,345,'up','東海の石橋へ続く上の門')]
    assert trip.state.story.quests[CURRENT].count==3
    trip.mark(CURRENT,4)
    gates.append(depth_gate(trip,WEST,264,'down','西海の峡谷へ戻る下の門'))
    assert trip.state.story.quests[CURRENT].count==5
    home = trip.guide(CAVE)
    assert home['stops'][0]['mode']=='water' and '西海から洞口へ戻る水路' in home['stops'][0]['hint']
    trip.cross(CAVE)
    trip.cross(CAMP)
    for quest in (SURVEY,CURRENT):
        trip.report(quest)
        assert trip.reports[-1]==dict(quest=quest,xp=quests[quest]['xp'],mora=quests[quest]['mora'])
    trip.restore()
    assert trip.state.story.node==CAMP and trip.state.returns==0
    assert all(trip.state.story.quests[q].cycles==1 for q in (SURVEY,CURRENT))
    assert trip.state.endgame.bosses['boss-26140101'].clears==1
    trip.warp(EAST)
    assert trip.state.storySwimming and trip.actor.y==339
    trip.warp(CAMP)
    assert not trip.state.storySwimming
    save(trip,'bygone-complete')
    return dict(sourceSha256=trip.source, level=trip.state.progression.level, entry=entry, depthGates=gates,
                reports=trip.reports, restoredWarp=True, highLevelGate=trip.locks[-1])


def prepare_ruins():
    trip = SurveyJourney(HIGH,runtime(),select_traveler=True)
    assert trip.state.progression.level==200 and all(not trip.state.story.quests[q] for q in RUINS)
    trip.warp(HUB)
    assert [leg['id'] for leg in trip.travel(CAMP)]==['fontaine-field',CAMP]
    save(trip,'ruins-ready')
    return dict(sourceSha256=trip.source, level=trip.state.progression.level, arrivedFrom=HUB)


if __name__=='__main__':
    WORK.mkdir(parents=True,exist_ok=True)
    result = dict(surveys=low_route(),ruinsStart=prepare_ruins())
    (ROOT/'evidence/earned-bygone-current.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print('Earned Lv92 current and exploration reports restored. Earned Lv200 ruins start prepared.')
