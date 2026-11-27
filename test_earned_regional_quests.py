"""Play the outstanding character and festival quests on an earned adventure."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from story_scope import suspended_stage_returns
from test_earned_branch_quests import graph, quests
from test_earned_hunts import CHASE
from test_earned_survey_itineraries import SurveyJourney, nodes


def reach(trip, node):
    if trip.state.story.node != node:
        trip.travel(node)


def inspect(trip, x, y=480):
    trip.approach(x, y, 'quest interaction')
    trip.act('story_collect')


def mark(trip, qid, index):
    reach(trip, quests[qid]['itinerary'][index - 1]['node'])
    trip.mark(qid, index)


def move_until(trip, done, controls=None, limit=600):
    for _ in range(limit):
        if done():
            return
        trip.tick(1, controls)
    assert done(), (trip.state.story.node, trip.actor.x, trip.actor.y, trip.state.storyNotice)


def fight_wave(trip, qid, index):
    step = quests[qid]['itinerary'][index - 1]
    reach(trip, step['node'])
    enemies = {e.spawnId: e for e in trip.state.enemies.values()}
    chase = trip.lua.eval(CHASE)
    for spawn in step['enemies']:
        enemy = enemies[spawn]
        assert chase(trip.core, trip.state, enemy), (qid, spawn, enemy.hp, trip.actor.x, trip.actor.y)
    assert trip.state.story.quests[qid].count == index


def return_box(trip, qid):
    for index in range(1, 5):
        mark(trip, qid, index)
    orchard = trip.state.story.node
    trip.restore()
    reach(trip, orchard)
    trip.approach(1060, 480, qid)
    move_until(trip, lambda: trip.state.story.quests[qid].count == 5, trip.inputs['right'])
    fight_wave(trip, qid, 6)
    mark(trip, qid, 7)


def night_banner(trip, qid):
    for index in range(1, 5):
        mark(trip, qid, index)
    fight_wave(trip, qid, 5)
    mark(trip, qid, 6)
    mark(trip, qid, 7)


def fireworks(trip, qid):
    mark(trip, qid, 1)
    for index, expected in enumerate(('partial', 'blocked', 'clear'), 2):
        mark(trip, qid, index)
        assert trip.frame().storySurveyMap.status == expected
    step = quests[qid]['itinerary'][4]
    reach(trip, step['node'])
    trip.approach(step['x'], step['y'], qid)
    trip.act('story_firework_select:color:wisteria')
    trip.act('story_firework_select:shape:fan')
    trip.act('story_collect')
    assert trip.frame().storyFireworkStatus.phase == 'window'
    move_until(trip, lambda: trip.state.story.quests[qid].count == 5)


def itto(trip, qid):
    mark(trip, qid, 1)
    field = quests[qid]['target']
    reach(trip, field)
    spec = nodes[field]['ittoGames']
    inspect(trip, 174)
    for flag in spec['flags']:
        trip.approach(flag['x'], flag['y'], qid)
        trip.tick(1)
    assert trip.state.story.quests[qid].count == 2
    trip.restore()
    reach(trip, field)
    inspect(trip, 174)
    arm = trip.lua.eval(CHASE)
    for target in list(trip.state.enemies.values()):
        assert arm(trip.core, trip.state, target), (target.id, target.hp)
    assert trip.state.story.quests[qid].count == 3
    inspect(trip, 174)
    for waypoint in spec['relay']['marks']:
        trip.approach(waypoint['x'], 480, qid)
        move_until(trip, lambda: trip.state.ittoRound.own.at, limit=240)
        trip.act('story_collect')
        trip.tick(1)
    assert trip.state.story.quests[qid].ittoContest.best == 3


def fungus(trip, qid):
    for index in range(1, 12):
        if index in (2, 4, 6):
            fight_wave(trip, qid, index)
        else:
            if index == 11:
                trip.tick(150)
            mark(trip, qid, index)


def springs(trip, qid):
    mark(trip, qid, 1)
    reach(trip, 'natlan-xilonen-workshop')
    for x in (235, 442):
        inspect(trip, x)
        trip.act('jump')
        trip.tick(90)
        assert not trip.state.springRun
    inspect(trip, 650)
    for slot, kind in (('rise', 'high'), ('roof', 'low'), ('reach', 'high')):
        trip.act(f'story_spring_pick:{slot}:{kind}')
    trip.act('story_spring_confirm')
    reach(trip, 'natlan-xilonen-course')
    inspect(trip, 139)
    right = trip.inputs['right']
    for index, section in enumerate(quests[qid]['springCourse']['sections'], 1):
        move_until(trip, lambda: trip.actor.x >= section['launch']['x'] - 2, right)
        trip.act('jump')
        move_until(trip, lambda: trip.state.springRun.section > index, right)
    move_until(trip, lambda: not trip.state.springRun, right)
    assert trip.state.springResult.retries == 0


def training(trip, qid):
    mark(trip, qid, 1)
    reach(trip, 'natlan-iansan-training')
    attack = trip.lua.table(attack=True)
    for lap in (1, 2):
        inspect(trip, 155)
        trip.approach(419, 380, qid)
        assert trip.state.iansanRound.marker
        for target in trip.state.enemies.values():
            if target.hp > 0:
                trip.approach(target.x - 40, 480, qid)
                move_until(trip, lambda: target.hp == 0, attack)
        if lap == 1:
            trip.approach(1110, 480, qid)
            trip.tick(170)
            inspect(trip, 1231)
        move_until(trip, lambda: trip.state.iansanPanel, trip.inputs['right'])
        if lap == 1:
            trip.act('story_iansan_focus:recovery')
    trip.act('story_iansan_close')


def magic(trip, qid):
    for index in (1, 2, 3):
        mark(trip, qid, index)
    reach(trip, 'fon-magic-wings')
    inspect(trip, 819)
    move_until(trip, lambda: trip.state.story.quests[qid].count == 4)
    inspect(trip, 1303)
    inspect(trip, 1179)
    move_until(trip, lambda: trip.frame().storyLyneyMagic.phase == 'cue', limit=110)
    trip.act('story_collect')
    move_until(trip, lambda: trip.state.story.quests[qid].count == 6)
    reach(trip, 'fon-magic-seats')
    inspect(trip, 424)
    move_until(trip, lambda: trip.state.story.quests[qid].count == 7)


def dive(trip, qid):
    mark(trip, qid, 1)
    reach(trip, 'fon-toy-shallows')

    def swim(x, y):
        for axis, goal, lower, upper in (('y', y, 'up', 'down'), ('x', x, 'left', 'right')):
            for _ in range(600):
                delta = goal - trip.actor[axis]
                if abs(delta) < 3:
                    break
                trip.tick(1, trip.inputs[lower if delta < 0 else upper])
            else:
                raise AssertionError((axis, goal, trip.actor.x, trip.actor.y))

    for x, y in ((291, 216), (525, 368), (715, 261), (1082, 437)):
        swim(x, y)
        trip.act('story_collect')
    swim(1354, 304)
    trip.tick(300)
    trip.act('story_collect')
    assert trip.state.story.quests[qid].count == 6
    swim(1547, 250)
    trip.act('story_nearby_portal')
    assert trip.state.story.node == quests[qid]['hub']


def rumor(trip, qid):
    for index in range(1, 5):
        mark(trip, qid, index)
    reach(trip, 'nod-rumor-ledge')
    inspect(trip, 470)
    trip.act('story_collect')
    trip.act('story_reflection_light')
    assert not trip.frame().storyReflection.lit
    trip.act('story_reflection_light')
    trip.act('story_reflection_confirm')
    assert trip.state.story.quests[qid].count == 5
    reach(trip, quests[qid]['hub'])
    inspect(trip, 1390)


def bloom(trip, qid):
    mark(trip, qid, 1)
    fight_wave(trip, qid, 2)
    for index in range(3, 8):
        mark(trip, qid, index)


routes = {
    'mond-return-box-quest': return_box, 'mond-night-banner-quest': night_banner,
    'ina-window-fireworks': fireworks, 'ina-itto-three-games': itto,
    'sum-fungus-visitors': fungus, 'natlan-xilonen-springs': springs,
    'natlan-iansan-self-test': training, 'fon-lyney-magic': magic,
    'fon-freminet-dive': dive, 'nod-moon-rumor': rumor, 'nod-moon-bloom': bloom,
}


def main(source, output_dir):
    trip = SurveyJourney(source.resolve(), runtime(), select_traveler=True)
    previous = trip.snapshot()
    before = previous['story']['quests']
    paused = suspended_stage_returns(graph)
    active = {q['id'] for q in quests.values() if not q.get('legacyOnly')
              and q['hub'] not in paused and q.get('target') not in paused}
    pending = active - {qid for qid, record in before.items() if record['status'] == 'complete'}
    assert pending <= routes.keys(), pending - routes.keys()
    output_dir.mkdir(parents=True, exist_ok=True)
    for qid, route in routes.items():
        if qid not in pending:
            continue
        hub = quests[qid]['hub']
        if trip.state.story.visited[hub]:
            trip.warp(hub)
        else:
            reach(trip, hub)
        trip.act(f'story_accept:{qid}')
        assert trip.state.story.quests[qid].status == 'active', (qid, trip.state.storyNotice)
        route(trip, qid)
        assert trip.state.story.quests[qid].count == quests[qid]['goal'], (qid, trip.state.storyNotice)
        reach(trip, hub)
        trip.report(qid)
        trip.restore()
        assert trip.state.returns == 0
        (output_dir / 'progress-save.json').write_text(
            json.dumps(trip.snapshot(), ensure_ascii=False, sort_keys=True) + '\n', encoding='utf-8')
        print(qid, flush=True)
    final = trip.snapshot()
    after = final['story']['quests']
    assert all(after[qid]['status'] == 'complete' for qid in active)
    assert all(after[qid] == record for qid, record in before.items() if record['status'] == 'complete')
    assert {r['quest'] for r in trip.reports} == pending
    assert set(final['endgame']['bosses']) >= set(previous['endgame']['bosses'])
    for key in ('bosses', 'weekly', 'stygian'):
        assert all(final['endgame'][key][id]['clears'] >= record['clears']
                   for id, record in previous['endgame'][key].items())
    for suffix, data in [('save', final), ('route', trip.proof() | {'complete': len(active)})]:
        (output_dir / f'regional-quest-{suffix}.json').write_text(
            json.dumps(data, ensure_ascii=False, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    main(args.from_save, args.output_dir)
