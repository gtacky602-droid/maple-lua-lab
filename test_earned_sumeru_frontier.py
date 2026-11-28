"""Continue the earned Baptist checkpoint through Sumeru's frontier to Fontaine."""
from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_sumeru_baptist import HUB, QUEST as BAPTIST, completed_commissions, hunt_to_level
from test_earned_survey_itineraries import SurveyJourney, quests, walk_objectives


WORK = ROOT/'work/earned-sumeru-frontier'
SOURCE = ROOT/'work/earned-sumeru-baptist/baptist-complete.json'
CAMP, FIELD = 'tunigi-camp', 'sumeru-field'
ENTRY, FONTAINE = 'fontaine-entry', 'fontaine-hub'
WATER, WIND, SURVEY = 'sum-mapped-tunigi-water', 'sum-mapped-desert-wind', 'tunigi-survey'
SHELF, SHAFT, SHELTER = 'sum-wp-41838', 'sum-wp-41836', 'sum-wp-41835'


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', 'utf8')


def fontaine_gate(trip):
    assert trip.state.story.node == FIELD
    guide = trip.guide(ENTRY)
    level = trip.state.progression.level
    assert guide['status']=='blocked' and guide['requiredLevel']==80 and level<80
    trip.confirm_lock(ENTRY, '必要レベル 80')
    return dict(level=level, **trip.locks[-1])


def wind_sign(trip, calm):
    label = '弱風 残り' if calm else '風待ち '
    frame = trip.frame()
    sign, = [d for d in frame.draws.values() if d.kind=='text' and d.text.startswith(label)]
    portal = frame.storyNearbyPortal
    assert portal.to==SHAFT and portal.available==calm and portal.wind.calm==calm
    sky = next(p for p in frame.storyPortals.values() if p.to==SHAFT).wind
    assert sky.calm==calm and sign.text==label+str(sky.seconds)+'秒'
    for profile in ('legacy','h32c16'):
        other, = [d for d in trip.core.frame(trip.state,'rect',profile).draws.values()
                  if d.kind=='text' and d.text==sign.text]
        assert (other.x,other.y,other.color)==(sign.x,sign.y,sign.color)
    return dict(seconds=sky.seconds,text=sign.text)


def first_window(trip):
    gate = next(e for e in trip.exits[SHELF] if e['to']==SHAFT)
    trip.approach(gate['x'], gate['y'], '砂風の昇降機')
    for _ in range(round(gate['wind']['period']*60)):
        portal = trip.frame().storyNearbyPortal
        if portal.to==SHAFT and not portal.available and portal.wind.seconds>.35:
            break
        trip.tick(1)
    else:
        raise AssertionError('Did not observe the closed gate')
    closed = wind_sign(trip, False)
    trip.act('story_nearby_portal')
    assert trip.state.story.node==SHELF and not trip.state.lift
    assert '風が弱まるまで' in trip.state.storyNotice
    for _ in range(round(gate['wind']['period']*60)):
        if trip.frame().storyNearbyPortal.available:
            opened = wind_sign(trip, True)
            break
        trip.tick(1)
    else:
        raise AssertionError('Did not observe the open gate')
    trip.cross(SHAFT)
    return dict(closed=closed,opened=opened)


def walk_wind(trip):
    trip.warp(CAMP)
    trip.act('story_accept:'+WIND)
    quest = trip.state.story.quests[WIND]
    assert quest.status=='active'
    trip.travel(SHELTER)
    save(trip,'wind-ready')
    trip.cross(SHELF)
    assert quest.count==1
    windows = first_window(trip)
    assert quest.count==2
    trip.mark(WIND,3)
    trip.cross(SHELF)
    assert quest.count==4
    trip.warp(CAMP)
    trip.report(WIND)
    return windows


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip = SurveyJourney(source,runtime())
    state = trip.state
    assert state.story.node==HUB and state.progression.level==74 and not state.inventory.sampleKit
    assert state.story.quests[BAPTIST].status=='complete'
    commissions = completed_commissions(trip)
    assert len(commissions)==14
    trip.travel(FIELD)
    locks = [fontaine_gate(trip)]
    trip.travel(CAMP)
    trip.act('story_accept:'+SURVEY)
    save(trip,'water-ready')
    water = walk_objectives(trip,quests[WATER])
    assert state.story.quests[SURVEY].count==1
    trip.report(SURVEY)
    trip.warp(HUB)
    lower = hunt_to_level(trip,'sum-wp-28745','sumeru-north-bank-terraces',78)
    windows = walk_wind(trip)
    trip.warp(HUB)
    bank = hunt_to_level(trip,'sum-wp-28745','sumeru-north-bank-terraces',79)
    higher = hunt_to_level(trip,'sum-wp-28741','sites-hunt-28753',80)
    assert state.progression.level==80
    save(trip,'fontaine-ready')
    route = trip.travel(FONTAINE)
    assert [(step['id'],step['mode']) for step in route]==[(FIELD,'walk'),(ENTRY,'walk'),(FONTAINE,'walk')]
    trip.restore()
    assert trip.state.story.node==FONTAINE and trip.state.progression.level==80
    assert completed_commissions(trip)==commissions
    assert all(trip.state.story.quests[q].status=='complete' and trip.state.story.quests[q].cycles==1
               for q in (WATER,WIND,SURVEY))
    assert all(trip.state.story.visited[stage] for stage in (SHAFT,'sum-wp-46523',ENTRY,FONTAINE))
    save(trip,'fontaine-arrival')
    return dict(sourceSha256=trip.source, gateChecks=locks, wind=windows, waterObjectives=water['objectives'],
                waterRoute=[[step['id'],step['mode']] for leg in water['routes'] for step in leg['stops']],
                reports=trip.reports, hunts=dict(rootTerracesTo78=lower,rootTerracesTo79=bank,northDomainTo80=higher),
                crossing=[[step['id'],step['mode']] for step in route],
                arrivalLevel=80, arrivalTotalExp=trip.state.progression.total, reportedCommissions=commissions,
                returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-sumeru-frontier.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(f"Arrived in Fontaine at Lv{result['arrivalLevel']}; {len(result['reports'])} new reports, {result['returns']} returns.")
