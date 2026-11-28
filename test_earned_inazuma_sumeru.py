"""Finish Inazuma's three field surveys and sail into Sumeru from the earned boss save."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_enkanomiya_bathysmal import CAMP, PORT, PREVIOUS, QUEST
from test_earned_inazuma_bosses import TOWN
from test_earned_inazuma_island_bosses import OUTER, train
from test_earned_survey_itineraries import SurveyJourney, quests, walk_objectives


SOURCE = ROOT/'work/earned-enkanomiya-bathysmal/bathysmal-complete.json'
WORK = ROOT/'work/earned-inazuma-sumeru'
SEIRAI, FLOOR, BEACONS = 'ina-mapped-seirai-ferry', 'ina-mapped-undersea-floor', 'ina-mapped-enkan-beacons'
CENTRAL, SOUTH = 'enkan-wp-21580', 'enkan-wp-21592'
WEST, NORTHWEST = 'enkan-wp-21576', 'enkan-wp-21593'
ENTRY, HUB = 'sumeru-entry', 'sumeru-hub'
ISLAND = 'sites-hunt-18667'


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


def gate(trip, destination, needed):
    guide = trip.guide(destination)
    assert guide['status'] == 'blocked' and guide['requiredLevel'] == needed, guide
    trip.confirm_lock(destination, f'必要レベル {needed}')
    return dict(actual=trip.state.progression.level, required=needed, destination=destination)


def report_survey(trip, quest):
    q = quests[quest]
    trip.travel(q['hub'])
    count = trip.state.progression.level
    survey = walk_objectives(trip, q)
    assert trip.reports[-1] == dict(quest=quest, xp=q['xp'], mora=q['mora'])
    return dict(level=count, objectives=survey['objectives'], report=trip.reports[-1])


def stone_lit(trip):
    return any(item.color == '#fff2ba' for item in trip.frame().draws.values())


def sail(trip, destination):
    origin = trip.state.story.node
    guide = trip.guide(destination)
    assert guide['status']=='ready' and len(guide['stops'])==1 and guide['stops'][0]['mode']=='boat', guide
    assert '移動に4.8秒' in guide['stops'][0]['hint']
    edge = trip.edges[origin, destination]
    trip.approach(edge['x'], 480, destination)
    portal = trip.frame().storyNearbyPortal
    assert portal and portal.to==destination and portal.available and portal.boatSeconds==4.8
    trip.act('story_nearby_portal')
    assert trip.state.lift.boat
    trip.tick(287)
    assert trip.state.story.node==origin and trip.state.lift.boat
    trip.tick(1)
    assert trip.state.story.node==destination and trip.state.lift is None
    return dict(origin=origin, destination=destination, seconds=4.8)


def run(source):
    WORK.mkdir(parents=True, exist_ok=True)
    trip = SurveyJourney(source, runtime())
    assert trip.state.progression.level == 54 and trip.state.story.node == PORT
    assert not trip.state.inventory.sampleKit
    finished = (*PREVIOUS, QUEST, SEIRAI, FLOOR, BEACONS)
    assert all(trip.state.story.quests[q].status=='complete' for q in (*PREVIOUS, QUEST))
    trip.travel(TOWN)
    locks = [gate(trip, ENTRY, 60)]
    save(trip,'surveys-ready')
    surveys = {q: report_survey(trip, q) for q in (SEIRAI, FLOOR)}
    trip.travel(CAMP)
    trip.act('story_accept:'+BEACONS)
    assert trip.state.progression.level < 57 and not trip.state.story.quests[BEACONS]
    locks.append(dict(actual=trip.state.progression.level, required=57, quest=BEACONS))
    trip.warp(PORT)
    training = [train(trip, OUTER, 56)]
    training.append(train(trip, ISLAND, 57, position=2450))
    trip.warp(CAMP)
    save(trip,'beacons-ready')
    trip.act('story_accept:'+BEACONS)
    assert trip.state.story.quests[BEACONS].status == 'active'
    trip.travel(WEST)
    guide = trip.guide(NORTHWEST)
    assert guide['status']=='blocked' and guide['stops'][0]['label']=='浮石', guide
    trip.confirm_lock(NORTHWEST, '依頼')
    assert trip.frame().storyNearbyPortal.floatingStone
    assert not trip.state.lift and trip.state.story.quests[BEACONS].count == 0
    surveys[BEACONS] = report_survey(trip, BEACONS)
    trip.restore()
    assert trip.state.story.node==CAMP and trip.state.story.quests[BEACONS].cycles==1
    trip.warp(SOUTH)
    assert stone_lit(trip)
    south_approach = 'enkan-wp-21584'
    guide = trip.guide(south_approach)
    assert guide['status']=='ready' and guide['stops'][0]['label']=='浮石'
    trip.approach(trip.edges[SOUTH,south_approach]['x'],480,south_approach)
    assert trip.frame().storyNearbyPortal.floatingStone
    trip.act('story_nearby_portal')
    frame = trip.frame()
    assert frame.storyLift.floatingStone and frame.storyLift.seconds==3.5
    assert sum(d.color=='#80f0df' and d.w==10 for d in frame.draws.values()) == 3
    trip.tick(210)
    assert trip.state.story.node==south_approach and not trip.state.lift
    trip.warp(PORT)
    training.append(train(trip, ISLAND, 59, position=2450))
    trip.travel(TOWN)
    locks.append(gate(trip, ENTRY, 60))
    save(trip,'lv59-locked')
    trip.warp(PORT)
    training.append(train(trip, ISLAND, 60, position=2450))
    trip.travel(TOWN)
    save(trip,'boat-ready')
    crossing=sail(trip,ENTRY)
    trip.cross(HUB)
    trip.restore()
    assert trip.state.progression.level==60 and trip.state.story.node==HUB
    assert all(trip.state.story.quests[q].status=='complete' for q in finished)
    assert all(trip.state.story.quests[q].cycles==1 for q in (SEIRAI,FLOOR,BEACONS))
    assert trip.state.returns==0
    save(trip,'sumeru-arrival')
    trip.cross(ENTRY)
    back=sail(trip,TOWN)
    return dict(sourceSha256=trip.source, startLevel=54, arrivalLevel=60, surveys=surveys,
                locks=locks, restoredSouthBeacon=True, crossing=[crossing,back], training=training,
                finishedAt=HUB, lockedNorthwestFloatingStone=True, southernFloatingStoneSeconds=3.5, partyWipes=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-inazuma-sumeru.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for run in result['training']:
        print(run['reached'],sum(s['kills'] for s in run['sorties']),len(run['sorties']))
