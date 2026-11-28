"""Revisit the Morte and Erinnyes waterworks from the earned Lv94 checkpoint."""
import json

from runtime import ROOT, runtime
from test_earned_survey_itineraries import SurveyJourney, quests


WORK = ROOT/'work/earned-fontaine-waterworks'
SOURCE = ROOT/'work/earned-fontaine-acts/acts-browser-complete.json'
HUB = 'fontaine-hub'
MORTE, ROOT_SURVEY = 'fon-morte-sluice-survey', 'fon-erinnyes-root-water-survey'
OUTSIDE, TOWER = 'fon-wp-55765', 'morte-tower-sluice'
WORKSHOP, ROOT_WATER = 'fon-wp-55784', 'erinnyes-root-waterway'
BUBBLES, CLEFT = 'chassanion-legend-bubble-room', 'erinnyes-corrouge-cleft'


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def check_depth(trip, q, index, offset):
    step = quests[q]['itinerary'][index-1]
    x,y = step['x'],step['y']
    trip.approach(x,y+offset,q)
    direction = 'up' if offset>0 else 'down'
    frame = trip.frame()
    hint = frame.storySwimInstrument
    assert hint.objective==step['objective'] and hint.direction==direction
    before = trip.state.story.quests[q].count
    trip.act('story_collect')
    assert trip.state.story.quests[q].count==before
    trip.approach(x,y,q)
    frame = trip.frame()
    assert frame.storySwimInstrument is None and frame.storyNearbyMilestone.label==step['label']
    trip.act('story_collect')
    assert trip.state.story.quests[q].count==index
    return dict(step=index, instrument=step['waterInstrument'], direction=direction,
                markY=y, attemptedY=y+offset)


def check_route(trip, target, last_source):
    guide = trip.guide(target)
    assert guide['status']=='blocked' and guide['reason']=='必要Lv100', guide
    leg = guide['stops'][-1]
    assert (leg['from'],leg['id'])==(last_source,target), leg
    return dict(entrance=last_source, target=target, requiredLevel=100)


def check_morte(trip):
    approach = trip.travel(OUTSIDE)
    trip.confirm_lock(TOWER,'開通まで 0/1')
    route_before = check_route(trip,BUBBLES,OUTSIDE)
    gauge = check_depth(trip,MORTE,1,-76)
    trip.restore()
    assert trip.state.story.node==HUB and trip.state.story.quests[MORTE].count==1
    trip.warp(OUTSIDE)
    trip.cross(TOWER)
    assert trip.state.story.quests[MORTE].count==2
    valve = check_depth(trip,MORTE,3,79)
    trip.cross(OUTSIDE)
    assert trip.state.story.quests[MORTE].count==4
    trip.warp(HUB)
    trip.report(MORTE)
    trip.restore()
    assert trip.state.story.quests[MORTE].cycles==1
    trip.warp(OUTSIDE)
    route_after = check_route(trip,BUBBLES,TOWER)
    trip.cross(TOWER)
    trip.approach(738,384,MORTE)
    assert trip.frame().storySwimInstrument is None
    trip.confirm_lock(BUBBLES,'必要レベル 100')
    trip.cross(OUTSIDE)
    trip.warp(HUB)
    return dict(approach=[(leg['id'],leg['mode']) for leg in approach],depth=[gauge,valve],
                restoredAtCount=1,restoredReport=True,entranceBefore=route_before,
                entranceAfter=route_after,payout=trip.reports[-1])


def check_erinnyes(trip):
    trip.act('story_accept:'+ROOT_SURVEY)
    assert trip.state.story.quests[ROOT_SURVEY].status=='active'
    approach = trip.travel(WORKSHOP)
    trip.confirm_lock(ROOT_WATER,'開通まで 0/1')
    trip.mark(ROOT_SURVEY,1)
    trip.cross(ROOT_WATER)
    assert trip.state.story.quests[ROOT_SURVEY].count==2
    edge = next(e for e in trip.exits[ROOT_WATER] if e['to']==CLEFT)
    at_level = lambda:trip.core.atlasGateRestriction(trip.state,ROOT_WATER,trip.lua.table_from(edge,recursive=True),100)
    assert '依頼「エリニュスの根へ続く水脈」' in at_level()
    current = check_depth(trip,ROOT_SURVEY,3,-80)
    temperature = check_depth(trip,ROOT_SURVEY,4,83)
    trip.cross(WORKSHOP)
    assert trip.state.story.quests[ROOT_SURVEY].count==5
    trip.warp(HUB)
    trip.report(ROOT_SURVEY)
    trip.restore()
    assert trip.state.story.quests[ROOT_SURVEY].cycles==1
    trip.warp(WORKSHOP)
    trip.cross(ROOT_WATER)
    trip.approach(1120,309,ROOT_SURVEY)
    assert trip.frame().storySwimInstrument is None
    assert at_level() is None
    entrance = check_route(trip,CLEFT,ROOT_WATER)
    trip.confirm_lock(CLEFT,'必要レベル 100')
    trip.cross(WORKSHOP)
    trip.warp(HUB)
    return dict(approach=[(leg['id'],leg['mode']) for leg in approach],depth=[current,temperature],
                restoredReport=True,questRequirementCleared=True,entrance=entrance,payout=trip.reports[-1])


if __name__=='__main__':
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(SOURCE,runtime(),select_traveler=True)
    assert trip.state.story.node==HUB and trip.state.progression.level==94
    assert trip.state.story.quests[MORTE].count==0 and trip.state.story.quests[MORTE].status=='active'
    assert trip.state.story.quests['fon-lyney-magic'].status=='complete'
    result=dict(sourceSha256=trip.source,morte=check_morte(trip),erinnyes=check_erinnyes(trip))
    assert trip.state.returns==0
    result.update(endLevel=trip.state.progression.level,returns=trip.state.returns,completedInstrumentsStopGuiding=True)
    save(trip,'waterworks-complete')
    (ROOT/'evidence/earned-fontaine-waterworks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print('Earned Morte and Erinnyes surveys restored. Named depths and report-dependent Lv100 entrances verified.')
