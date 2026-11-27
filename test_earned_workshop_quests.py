"""Complete the stonework, workshop and repair quests on an earned save."""
from argparse import ArgumentParser
from math import ceil
import json
from pathlib import Path

from runtime import ROOT, runtime
from test_earned_branch_quests import quests
from test_earned_survey_itineraries import SurveyJourney
from test_earned_terrain_quests import battle


def stonework(trip, quest):
    stone = quests[quest]['stone']
    for step in stone['marks']:
        trip.travel(step['node'])
        trip.approach(step['x'], step['y'], quest)
        trip.act('story_collect')
    assert trip.state.story.quests[quest].count == 3
    target = quests[quest]['target']
    trip.travel(target)
    mural = stone['mural']
    trip.approach(mural['x'], mural['y'], quest)
    trip.act('story_collect')
    trip.act(f'story_stone_tile:{quest}:build')
    assert trip.state.story.quests[quest].stone.sequence == 0
    for tile in stone['order'][:2]:
        trip.act(f'story_stone_tile:{quest}:{tile}')
    trip.restore()
    assert trip.state.story.quests[quest].stone.sequence == 2
    trip.travel(target)
    trip.approach(mural['x'], mural['y'], quest)
    trip.act(f"story_stone_tile:{quest}:{stone['order'][2]}")
    model = stone['model']
    trip.approach(model['x'], model['y'], quest)
    trip.act('story_collect')


def kaveh(trip, quest):
    trip.travel(quests[quest]['target'])
    trip.mark(quest, 1)
    trip.act('story_collect')
    for station, edit in (('shelves', 'shelf:wall'), ('window', 'window:inward'), ('seat', 'seat:aisle')):
        trip.act(f'story_model_move:{station}')
        trip.act(f'story_model_set:{edit}')
    assert trip.frame().storyKavehModel.result.ready
    trip.act('story_model_confirm')


def nahida(trip, quest):
    trip.mark(quest, 1)
    trip.act('story_collect')
    for card, method in (('leaf', 'below'), ('roots', 'steps'), ('branches', 'sound')):
        trip.act(f'story_discovery_pick:{card}')
        trip.act(f'story_discovery_method:{card}:{method}')
    assert trip.frame().storyDiscoveryMap.ready
    trip.act('story_discovery_confirm')


def repair(trip, quest):
    for index, step in enumerate(quests[quest]['itinerary'], 1):
        trip.travel(step['node'])
        if step['kind'] == 'inspect':
            trip.mark(quest, index)
        elif step['boss'] == 'original-twin-shuttle-loom':
            boss = trip.state.weeklySlots[step['boss']]
            if boss.waitUntil:
                trip.tick(max(1, ceil((boss.waitUntil - trip.state.t) * 60) + 1))
            assert boss.phase != 'respawn'
            fight = trip.lua.execute((ROOT / 'tools/earned_boss_driver.lua').read_text('utf-8'))
            result = fight(trip.core, trip.state, boss, 'weekly', 60 * 240, 'mechanics')
            assert result.status == 'clear' and trip.state.story.quests[quest].count == index
        else:
            battle(trip, quest, index)
        if step['kind'] == 'boss':
            trip.restore()
            assert trip.state.story.quests[quest].count == index


def main(source, directory):
    trip = SurveyJourney(source.resolve(), runtime(), select_traveler=True)
    directory.mkdir(parents=True, exist_ok=True)
    original = trip.snapshot()['story']['quests']
    fixtures = {
        'liyue-stone-marks': stonework,
        'sum-kaveh-model': kaveh,
        'sum-nahida-map': nahida,
        'threadline-restore': repair,
        'snow-rail-pressure': repair,
    }
    for quest, route in fixtures.items():
        if original.get(quest, {}).get('status') == 'complete':
            continue
        hub = quests[quest]['hub']
        trip.warp(hub)
        trip.act(f'story_accept:{quest}')
        assert trip.state.story.quests[quest].status == 'active'
        route(trip, quest)
        assert trip.state.story.quests[quest].count == quests[quest]['goal']
        trip.travel(hub)
        trip.report(quest)
        trip.restore()
        print(quest, flush=True)
    save = trip.snapshot()
    records = save['story']['quests']
    assert trip.state.returns == 0
    assert all(records[q]['status'] == 'complete' for q in fixtures)
    assert all(records[q] == record for q, record in original.items() if record['status'] == 'complete')
    for suffix, data in [('save', save), ('route', trip.proof())]:
        (directory / f'workshop-expedition-{suffix}.json').write_text(
            json.dumps(data, ensure_ascii=False, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    main(args.from_save, args.output_dir)
