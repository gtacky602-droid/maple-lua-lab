"""Run the Capitano finale with and without avoiding the four attack windows."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import native, runtime
from test_earned_survey_itineraries import SurveyJourney
from test_earned_weekly_mechanics import equipment, read, rectangle_frame


def replay(source, output, evade):
    spec = read('content/stygian-matches.json')['matches']['capitano']
    finale = spec['moves']['CP09']
    trip = SurveyJourney(source.resolve(), runtime(), select_traveler=True)
    start = trip.snapshot()
    loadout = equipment(trip)
    state, hero = trip.state, trip.actor
    bag = state.inventory['items']
    spares = sorted((item for item in bag.values() if not item.owner and not item.locked),
                    key=lambda item: (item.rarity, item.itemLv, item.id))
    if len(bag) == 80:
        trip.act(f'artifact_sell:{spares[0].id}')
    old_items = {item.id for item in bag.values()}
    trip.warp(spec['hub'])
    trip.travel(spec['node'])
    mode = next(row for row in trip.frame().stygianDesk.modes.values() if row.id == 'extreme')
    assert mode.available and mode.record.clears > 0
    prior = mode.record.clears
    before = state.progression.total, state.mora
    trip.act('stygian_start:capitano:extreme:troupe')
    run = state.endgameRun
    boss = run.boss
    arena = spec['arena']
    frames, stages, hits, windows, positions = {}, [], [], [], []
    path = None
    recovery = 0
    return_damage = 0
    completed = False
    first_serial = None
    edge_gap = 218 if evade else 65

    def sample(label, tick, cast):
        frame = trip.frame()
        frames[label] = dict(tick=tick, node=state.story.node, camera=frame.camera,
                             platforms=native(frame.platforms), stage=str(run.stage), move=cast.key,
                             moveTick=cast.t, view=native(frame.endgameRun), png=native(frame.draws),
                             profiles={key: rectangle_frame(trip, key) for key in ('h48c32', 'h32c16')})

    for tick in range(1, 60 * run.rules.limit + 1):
        cast = run.cast
        if not stages or run.stage != stages[-1]:
            stages.append(run.stage)
        first_finale = cast and cast.key == 'CP09' and not completed
        if first_finale and first_serial is None:
            first_serial = cast.serial
        goal, attack, jump = hero.x, False, False
        dx = boss.x - hero.x
        if first_finale and cast.t < finale['recovery']:
            if cast.t >= finale['lock']:
                if path is None:
                    path = dict(origin=cast.origin, landing=cast.land, direction=cast.dir)
                    assert abs(path['landing'] - path['origin']) > 5
                    sample('走路固定', tick - 1, cast)
                middle = finale['windows'][0][1] <= cast.t < finale['windows'][2][1]
                gap = 118 if middle else edge_gap
                jump = 195 <= cast.t < 225 if evade else 267 <= cast.t < 293
                if jump and cast.t == (195 if evade else 267):
                    trip.act('jump')
                goal = cast.land + cast.dir * gap
        elif run.stage == 3 and run.phase == 'phase' and not completed:
            toward = -1 if boss.x > (arena['left'] + arena['right']) / 2 else 1
            goal = boss.x + toward * 76
        elif run.phase not in ('enter', 'phase'):
            goal = boss.x - (74 if dx > 0 else -74)
            if abs(goal - hero.x) <= 9 and dx * hero.dir < 0:
                goal = hero.x + (24 if dx > 0 else -24)
            attack = abs(dx) < 115 and dx * hero.dir > 0 and hero.y > 420 and not boss.invulnerable
            if first_finale and return_damage > 0:
                attack = False
        goal = max(arena['left'] + 18, min(arena['right'] - 18, goal))
        controls = trip.lua.table(left=goal < hero.x - 9, right=goal > hero.x + 9, jump=jump, attack=attack)
        hp_before, boss_before = hero.hp, boss.hp
        seq_before = state.events[len(state.events)].seq if len(state.events) else 0
        trip.tick(1, controls)
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and not state.returns and hero.hp > 0

        if first_finale:
            for event in state.events.values():
                if event.seq <= seq_before or event.cast != first_serial:
                    continue
                if event.kind == 'stygian:capitano:CP09:window':
                    i = event.value
                    windows.append(event.tick)
                    area = cast.shapes[i]
                    positions.append(dict(group=i, x=hero.x, y=hero.y, left=area.left, right=area.right))
                    sample(('終点の一閃', '低い氷線', '高い氷線', '最後の扇')[i-1], tick, cast)
                elif event.kind == 'stygian:capitano:CP09:contact' and event.actor == hero.id:
                    assert event.value == hp_before - hero.hp
                    hits.append(dict(group=event.group, tick=event.tick, damage=event.value))
            if finale['dash'][0] <= cast.t < finale['dash'][1]:
                assert hp_before == hero.hp
                if cast.t == finale['dash'][0] + 7:
                    sample('疾走・終点の手前', tick, cast)
            if finale['recovery'] <= cast.t < finale['total']:
                recovery += 1
                if recovery == 1:
                    sample('反撃開始', tick, cast)
                if boss.hp < boss_before:
                    return_damage += boss_before - boss.hp
            if not run.cast:
                completed = True
    else:
        raise AssertionError(('time budget', run.stage, run.phase, boss.hp, run.clock, hero.hp))

    assert completed and stages == [1, 2, 3] and windows == [w[0] for w in finale['windows']]
    assert recovery == finale['total'] - finale['recovery'] and return_damage > 0
    mid = positions[1:3]
    assert all(row['left'] + 10 < row['x'] < row['right'] - 10 for row in mid), mid
    expected_groups = [] if evade else [1, 2, 3, 4]
    assert [row['group'] for row in hits] == expected_groups, (hits, positions, path)
    assert frames['反撃開始']['view']['finale']['damage'] == ([0] * 4 if evade else [75] * 4)
    reward = native(trip.frame().endgameRun.matchReward)
    assert not reward['first'] and reward['bag']
    assert (reward['xp'], reward['mora']) == (mode.xp, mode.mora)
    assert (state.progression.total - before[0], state.mora - before[1]) == (mode.xp, mode.mora)
    new_items = [item for item in bag.values() if item.id not in old_items]
    assert len(new_items) == 1 and new_items[0].setId == 'troupe'
    trip.restore()
    saved = trip.snapshot()
    assert saved['endgame']['stygian']['capitano:extreme']['clears'] == prior + 1
    assert saved['story']['quests'] == start['story']['quests']
    assert saved['story']['visited'] == start['story']['visited']
    case = 'capitano-evade' if evade else 'capitano-hit'
    label = '隊長の終式・四段を回避' if evade else '隊長の終式・四段が命中'
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, path, hits, positions, recovery, return_damage, reward, flush=True)
    return dict(controller='capitano', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stageOrder=stages, path=path, windows=windows, positions=positions, hits=hits,
                recoveryTicks=recovery, recoveryDamageDealt=return_damage, reward=reward,
                extremeClears=[prior, prior + 1], loadout=loadout)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = [replay(args.from_save, args.output_dir, evade) for evade in (True, False)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + '\n', 'utf8')
