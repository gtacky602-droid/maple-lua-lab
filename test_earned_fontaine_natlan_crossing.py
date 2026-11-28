"""Check both Beryl level gates and the Lv100 routes on one earned save."""
from experience import LEVELS
from runtime import ROOT, runtime
from test_earned_fontaine_nostoi import HILLS, HUB, MOUNTAIN, QUEST, hunt_until, write
from test_earned_survey_itineraries import SurveyJourney


WORK = ROOT / 'work/earned-fontaine-natlan'
SOURCE = ROOT / 'work/earned-fontaine-nostoi/nostoi-browser-save.json'
INLET, BERYL = 'fon-wp-50035', 'sites-hunt-50034'
CANAL, NATION, NATLAN = 'fontaine-field', 'natlan-entry', 'natlan-hub'
DEIANEIRA, VISCOUNT = 'deianeira-legend-lab', 'iron-viscount-legend-pool'
FORT = 'natlan-ridge-flag'
LEGENDS = {DEIANEIRA: ('fon-wp-55768', 'legend-fontaine_deianeira_of_snezhevna'),
           VISCOUNT: ('iron-viscount-thermal-gallery', 'legend-fontaine_iron_viscount')}


def blocked_gate(trip, target, level):
    guide = trip.guide(target)
    leg = guide['stops'][-1]
    assert guide['status'] == 'blocked' and guide['requiredLevel'] == level
    assert leg['id'] == target and leg['reason'] == f'必要Lv{level}' and not leg.get('questReason')
    trip.travel(leg['from'])
    trip.confirm_lock(target, f'必要レベル {level}', leg.get('gateX'))
    remaining = LEVELS[level-1]['maple_reference_total_exp_to_reach']-trip.state.progression.total
    gate = trip.frame().storyNearbyPortal
    assert gate and gate.levelExpRemaining == remaining and gate.questReason is None
    at_gate = trip.guide(target)
    assert at_gate['stops'][0]['levelExpRemaining'] == at_gate['levelExpRemaining'] == remaining
    return dict(target=target, fromNode=leg['from'], level=level, remainingXp=remaining)


def take_natlan_road(trip):
    legs = trip.travel(NATLAN)
    assert [leg['id'] for leg in legs] == [CANAL, NATION, NATLAN]
    trip.act('story_accept:'+FORT)
    assert trip.state.story.quests[FORT].status == 'active'
    trip.restore()
    assert trip.state.story.node == NATLAN and trip.state.story.quests[FORT].status == 'active'
    return legs


def enter_legends(trip):
    for arena, (entrance, boss) in LEGENDS.items():
        trip.warp(HUB)
        route = trip.travel(arena)
        assert route[-1]['from'] == entrance and route[-1]['id'] == arena
        assert trip.state.fieldSlots[boss].enemy.hp > 0
        trip.cross(entrance)


if __name__ == '__main__':
    WORK.mkdir(parents=True, exist_ok=True)
    trip = SurveyJourney(SOURCE, runtime(), select_traveler=True)
    assert trip.state.progression.level == 96 and trip.state.story.node == HUB
    previous_quests = trip.snapshot()['story']['quests']
    assert previous_quests[QUEST]['status'] == 'complete'
    low_beryl = blocked_gate(trip, BERYL, 99)
    first = hunt_until(trip, HILLS, MOUNTAIN, 99)
    print(f"Lv99 reached after {first['kills']} defeats", flush=True)
    trip.warp(HUB)
    write(WORK / 'level99.json', trip.snapshot())
    almost = [blocked_gate(trip, target, 100) for target in [*LEGENDS, NATION]]
    second = hunt_until(trip, BERYL, INLET, 100, approach_x=2370)
    print(f"Lv100 reached after {second['kills']} more defeats", flush=True)
    trip.warp(HUB)
    trip.restore()
    write(WORK / 'level100.json', trip.snapshot())
    enter_legends(trip)
    trip.warp(HUB)
    natlan = take_natlan_road(trip)
    saved = trip.snapshot()
    assert saved['progression']['level'] == 100 and trip.state.returns == 0
    assert all(saved['story']['quests'][id] == record for id, record in previous_quests.items())
    write(WORK / 'natlan-start.json', saved)
    write(ROOT / 'evidence/earned-fontaine-natlan-lua.json',
          dict(sourceSha256=trip.source, levels=[96, 99, 100], berylGate=low_beryl, level100Gates=almost,
               hunt=[dict(stage=HILLS, **first), dict(stage=BERYL, **second)], legendRoundTrips=list(LEGENDS),
               natlanRoute=natlan, accepted=FORT, restored=True, returns=0))
    print('Both legends, Natlan entry and the first quest were verified on the earned Lv100 save.')
