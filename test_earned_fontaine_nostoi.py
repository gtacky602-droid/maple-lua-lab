"""Reach Lv96 via Beryl hunting and replay the Nostoi shelf from the earned Knave save."""
import json

from experience import LEVELS
from runtime import ROOT, runtime
from test_earned_survey_itineraries import SurveyJourney, nodes, quests


HUB = 'fontaine-hub'
HILLS = 'fontaine-beryl-foothills'
MOUNTAIN = 'fon-wp-50036'
QUEST = 'fon-mapped-nostoi-record'
WORK = ROOT / 'work/earned-fontaine-nostoi'
SOURCE = ROOT / 'work/earned-fontaine-knave/knave-complete.json'


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def hunt_until(trip, stage, parent, target_level, approach_x=None):
    state = trip.state
    exp_per_enemy = LEVELS[nodes[stage]['level']-1]['normal_enemy_base_exp']
    before = state.progression.total
    initial_kills = state.kills
    initial_kill_xp = state.progression.killXp
    passes, recoveries = [], 0
    trip.travel(parent)
    for _ in range(90):
        if state.progression.level == target_level:
            break
        if trip.actor.hp < 95:
            trip.warp(HUB)
            assert trip.actor.hp == trip.actor.maxhp
            trip.warp(parent)
            recoveries += 1
        trip.cross(stage)
        kills, kill_xp = state.kills, state.progression.killXp
        if approach_x:
            trip.approach(approach_x, 480, stage)
        trip.act('auto')
        for tick in range(1, 4501):
            trip.tick(1)
            if state.progression.level == target_level or trip.actor.hp < 65:
                break
        trip.act('auto')
        n = state.kills-kills
        xp = state.progression.killXp-kill_xp
        assert n > 0 and xp == n * exp_per_enemy and state.returns == 0
        passes.append(dict(kills=n, xp=xp, ticks=tick))
        trip.cross(parent)
    assert state.progression.level == target_level
    xp = sum(row['xp'] for row in passes)
    kills = sum(row['kills'] for row in passes)
    extra_xp = state.progression.killXp-initial_kill_xp-xp
    extra_kills = state.kills-initial_kills-kills
    assert state.progression.total-before == xp+extra_xp and extra_xp >= 0
    return dict(kills=kills+extra_kills, xp=xp+extra_xp, betweenPassesKills=extra_kills,
                betweenPassesXp=extra_xp, ticks=sum(row['ticks'] for row in passes), recoveries=recoveries, passes=passes)


def shelf_present(trip, palette, row):
    _, _, width, height, color = palette[row][0]
    return any((draw.w, draw.h, draw.color) == (width, height, color) for draw in trip.frame().draws.values())


def survey(trip):
    quest = quests[QUEST]
    trip.act('story_accept:'+QUEST)
    assert trip.state.story.quests[QUEST].status == 'active'
    approach = trip.travel(quest['itinerary'][0]['from'])
    crossed, depths = [], []
    for index, step in enumerate(quest['itinerary'][:-1], 1):
        target = step['node']
        guide = trip.guide(target)['stops']
        assert len(guide) == 1 and guide[0]['from'] == step['from']
        if index in (3, 5):
            gate = next(e for e in nodes[step['from']]['exits'] if e['to'] == target)
            wrong_y = gate['y'] + (-75 if index == 3 else 75)
            trip.approach(gate['x'], wrong_y, target)
            cue = trip.frame().storySwimGate
            assert cue.to == target and cue.direction == ('down' if index == 3 else 'up')
            trip.act('story_nearby_portal')
            assert trip.state.story.node == step['from'] and trip.state.story.quests[QUEST].count == index-1
            depths.append(dict(target=target, direction=cue.direction))
        trip.cross(target)
        assert trip.state.story.quests[QUEST].count == index
        crossed.append(guide[0])
        if index == 3:
            trip.restore()
            assert trip.state.story.node == HUB and trip.state.story.quests[QUEST].count == 3
            trip.warp(target)

    step = quest['itinerary'][-1]
    definition = json.loads((ROOT / 'content/story-graph.json').read_bytes())
    palette = definition['waterInstruments']['recordShelf']
    trip.approach(step['x'], step['y']+78, QUEST)
    cue = trip.frame().storySwimInstrument
    assert cue.direction == 'up' and cue.objective == step['objective']
    assert shelf_present(trip, palette, 'before')
    trip.act('story_collect')
    assert trip.state.story.quests[QUEST].count == 5
    trip.mark(QUEST, 6)
    assert shelf_present(trip, palette, 'after') and shelf_present(trip, palette, 'pending')

    return_guides = []
    for destination, label in (('fon-wp-68343', '記録棚から南室へ戻る水路'),
                               ('fon-wp-68342', None),
                               ('fon-wp-68345', '北室から第一層へ戻る水路'),
                               ('fon-wp-68341', '遺構から島南の桟橋へ浮上')):
        leg = trip.guide(destination)['stops'][0]
        if label:
            assert label in leg['hint']
        trip.cross(destination)
        return_guides.append(leg)
    assert not trip.state.storySwimming
    trip.warp(HUB)
    trip.report(QUEST)
    trip.restore()
    assert trip.state.story.quests[QUEST].cycles == 1
    trip.warp(step['node'])
    assert shelf_present(trip, palette, 'reported') and trip.frame().storySwimInstrument is None
    trip.warp(HUB)
    return dict(approach=approach, crossed=crossed, depths=depths, returnGuides=return_guides,
                steps=quest['goal'], payout=trip.reports[-1], restored=True)


if __name__ == '__main__':
    WORK.mkdir(parents=True, exist_ok=True)
    trip = SurveyJourney(SOURCE, runtime(), select_traveler=True)
    assert trip.state.progression.level == 95 and trip.state.story.node == HUB
    assert trip.state.story.quests['knave-weekly-commission'].status == 'complete'
    trip.act('story_accept:'+QUEST)
    assert not trip.state.story.quests[QUEST]
    hunting = hunt_until(trip, HILLS, MOUNTAIN, 96)
    trip.warp(HUB)
    write(WORK / 'level96-ready.json', trip.snapshot())
    print(f"Lv96 reached with {hunting['kills']} defeats", flush=True)
    record = survey(trip)
    assert trip.state.returns == 0
    assert record['payout'] == dict(quest=QUEST, xp=205000, mora=15800)
    write(WORK / 'nostoi-complete.json', trip.snapshot())
    write(ROOT / 'evidence/earned-fontaine-nostoi-lua.json',
          dict(sourceSha256=trip.source, levels=[95, 96], hunt=hunting, survey=record, returns=0))
    print('Nostoi: survey, return, report and underwater restore passed')
