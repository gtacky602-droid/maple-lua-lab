"""Play both Rerir acts from the same earned save, varying the light collected."""

from argparse import ArgumentParser
import json
from pathlib import Path

from test_earned_stygian_rematch import StygianRematch


def replay(source, output, collect_count):
    trip = StygianRematch(source, 'rerir')
    state, hero, run = trip.state, trip.actor, trip.run
    boss = run.boss
    fog, trials, stages = {}, {}, []
    jump_until = 0
    first_after_fog = None

    for tick in range(1, 60 * 360 + 1):
        cast = run.cast
        if not stages or stages[-1] != run.stage:
            stages.append(run.stage)
        goal, jump, attack = hero.x, False, False
        if cast and cast.key == 'RR05':
            attempt = run.fog.attempt
            lamp = fog.setdefault(attempt, {'wardBefore': run.fog.ward, 'exposedTicks': 0})
            if (attempt == 1 and cast.t == 43) or (attempt > 1 and cast.t == 84):
                trip.act('encounter_interact')
                lamp.update(inputTick=cast.t, wardAfter=run.fog.ward, accepted=bool(cast.lamp))
                trip.capture(f'霧{attempt}・灯を掲げる', tick - 1, cast)
        elif cast and cast.path and cast.t < 1080:
            result = trials.setdefault(cast.path, {'pickups': [], 'recoveryTicks': 0, 'damageDealt': 0})
            if cast.t == 0:
                jump_until = 0
            if 120 <= cast.t < 960 and cast.collected < collect_count:
                light = next(p for p in cast.pickups.values() if not p.owner)
                goal = light.x
                if light.y < 400 and hero.y > 400 and abs(hero.x - goal) < 122 and cast.t > jump_until + 10:
                    jump_until = cast.t + 39
                    trip.act('jump')
                jump = cast.t < jump_until
            elif collect_count == 2 and cast.collected == 2 and cast.t >= 960:
                goal = 305 if cast.path == 1 else 655
        elif run.phase not in ('enter', 'interlude', 'fog-entry', 'blessing'):
            dx = boss.x - hero.x
            direction = 1 if dx > 0 else -1
            goal = boss.x - direction * 74
            if abs(goal - hero.x) < 9 and dx * hero.dir < 0:
                goal = hero.x + direction * 24
            second_done = run.trials[2] == 'done'
            if cast and cast.path:
                allowed = trials[cast.path]['damageDealt'] == 0 and boss.hp > 0
            else:
                allowed = run.stage == 1 or second_done or boss.hp > boss.maxhp * .235
            attack = allowed and not boss.invulnerable and abs(dx) < 113 and dx * hero.dir > 0 and hero.y > 422

        last_event = state.events[len(state.events)].seq if len(state.events) else 0
        hp_before, boss_before = hero.hp, boss.hp
        trip.tick(1, trip.lua.table(left=goal < hero.x - 7, right=goal > hero.x + 7, jump=jump, attack=attack))
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and not state.returns and hero.hp > 0
        active = run.cast
        if active and active.key == 'RR11' and active.variant == 'first_after_fog' and first_after_fog is None:
            first_after_fog = active.serial
            trip.capture('霧明け・三重地殴', tick, active)
        if not cast:
            continue
        same_cast = active and active.serial == cast.serial
        if cast.key == 'RR05' and same_cast and not boss.invulnerable:
            lamp['exposedTicks'] += 1
            if lamp['exposedTicks'] == 1:
                trip.capture(f'霧{attempt}・攻撃可能', tick, cast)
        if not cast.path:
            continue
        result = trials[cast.path]
        for event in state.events.values():
            if event.seq <= last_event or event.cast != cast.serial or event.actor != hero.id:
                continue
            suffix = event.kind.rsplit(':', 1)[-1]
            if suffix == 'pickup':
                result['pickups'].append(dict(id=event.group, tick=event.tick, x=hero.x, y=hero.y))
                if event.group == 2:
                    trip.capture(f'試練{cast.path}・中央の足場', tick, cast)
            elif suffix in ('protected', 'collapse'):
                damage = hp_before - hero.hp
                assert damage == (0 if suffix == 'protected' else event.value)
                result.update(collected=cast.collected, burstTick=event.tick, damage=damage)
                trip.capture(f'試練{cast.path}・最終衝撃', tick, cast)
        if same_cast and not boss.invulnerable:
            result['recoveryTicks'] += 1
            result['damageDealt'] += boss_before - boss.hp
            if result['recoveryTicks'] == 1:
                trip.capture(f'試練{cast.path}・反撃開始', tick, cast)
    else:
        raise AssertionError((run.stage, run.phase, boss.hp, fog, trials))

    assert stages == [1, 2] and first_after_fog
    assert list(fog.values()) == [
        {'wardBefore': 2, 'inputTick': 43, 'wardAfter': 2, 'accepted': False, 'exposedTicks': 0},
        {'wardBefore': 2, 'inputTick': 84, 'wardAfter': 1, 'accepted': True, 'exposedTicks': 90},
        {'wardBefore': 1, 'inputTick': 84, 'wardAfter': 0, 'accepted': True, 'exposedTicks': 180},
    ], fog
    for path, result in trials.items():
        assert [p['id'] for p in result['pickups']] == list(range(1, collect_count + 1)), result
        assert result['pickups'][1]['y'] <= 373, result
        assert (result['collected'], result['burstTick'], result['damage']) == (
            collect_count, 1008, 0 if collect_count == 3 else 82)
        assert result['recoveryTicks'] == (180 if path == 1 else 240 if collect_count == 3 else 96), result
        assert result['damageDealt'] > 0, result
        burst = trip.frames[f'試練{path}・最終衝撃']['view']['trialResult']
        assert burst == {'protected': collect_count == 3, 'damage': result['damage']}
        recovery = trip.frames[f'試練{path}・反撃開始']['view']['hint']
        assert recovery == f"反撃の隙 {result['recoveryTicks'] / 60:.1f}秒"
    assert list(trials) == [1, 2]
    reward = trip.verify_clear()
    case = 'rerir-protected' if collect_count == 3 else 'rerir-short'
    label = '淡金の光を3つ回収' if collect_count == 3 else '淡金の光を2つ回収'
    (output / f'{case}-frames.json').write_text(
        json.dumps(trip.frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, fog, trials, flush=True)
    return dict(controller='rerir', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stageOrder=stages, fog=fog, trials=trials, reward=reward,
                extremeClears=[trip.prior, trip.prior + 1], loadout=trip.loadout)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = [replay(args.from_save, args.output_dir, count) for count in (3, 2)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + '\n', 'utf8')
