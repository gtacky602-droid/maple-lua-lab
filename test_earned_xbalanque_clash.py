"""Replay Xbalanque's Solar Clash and his three chains from an earned save."""

from argparse import ArgumentParser
import json
from pathlib import Path

from test_earned_stygian_rematch import StygianRematch


def replay(source, output, evade):
    trip = StygianRematch(source, 'xbalanque')
    state, hero = trip.state, trip.actor
    run, spec = trip.run, trip.spec
    boss, arena = run.boss, spec['arena']
    finale = spec['moves']['XB08']
    stages, hits, windows, samples, chains = [], [], [], [], {}
    completed_chains = []
    first_serial, path = None, None
    completed = False
    recovery, return_damage = 0, 0
    middle = (arena['left'] + arena['right']) / 2
    left_limit, right_limit = arena['left'] + 18, arena['right'] - 18

    def attack_edge(area):
        if not evade:
            return max(area.left + 24, min(area.right - 24, hero.x))
        outside = [x for x in (area.left - 26, area.right + 26) if left_limit <= x <= right_limit]
        assert outside, (area.left, area.right)
        return min(outside, key=lambda x: abs(hero.x - x))

    for tick in range(1, 60 * 360 + 1):
        cast = run.cast
        if not stages or stages[-1] != run.stage:
            stages.append(run.stage)
        first_finale = cast and cast.key == 'XB08' and not completed
        if first_finale and first_serial is None:
            first_serial = cast.serial
        goal, attack = hero.x, False
        dx = boss.x - hero.x
        if first_finale and cast.t < finale['recovery']:
            if cast.t >= finale['locks'][0]:
                child = cast.child
                if not path:
                    path = dict(origin=child.origin, landing=child.landing, direction=child.dir)
                    trip.capture('疾走の走路固定', tick - 1, cast)
                if cast.t < finale['windows'][0][1]:
                    goal = attack_edge(child.areas[1])
                elif cast.t < finale['windows'][2][1]:
                    if evade:
                        goal = middle
                    elif cast.t < finale['windows'][1][1]:
                        goal = child.areas[2].right - 28
                    else:
                        goal = child.areas[3].left + 28
                elif cast.t >= finale['locks'][1]:
                    goal = attack_edge(child.areas[4])
        elif run.phase not in ('enter', 'phase'):
            goal = boss.x - (74 if dx > 0 else -74)
            if abs(goal - hero.x) <= 9 and dx * hero.dir < 0:
                goal = hero.x + (24 if dx > 0 else -24)
            allowed = run.stage < 3 or first_finale and not return_damage or completed and (
                not evade or len(completed_chains) == 3)
            attack = allowed and abs(dx) < 113 and dx * hero.dir > 0 and hero.y > 420 and not boss.invulnerable
        goal = max(left_limit, min(right_limit, goal))
        controls = trip.lua.table(left=goal < hero.x - 9, right=goal > hero.x + 9, attack=attack)
        before_player, before_boss = hero.hp, boss.hp
        seq_before = state.events[len(state.events)].seq if len(state.events) else 0
        trip.tick(1, controls)
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and not state.returns and hero.hp > 0

        if first_finale:
            for event in state.events.values():
                if event.seq <= seq_before or event.cast != first_serial:
                    continue
                if event.kind == 'stygian:xbalanque:XB08:window':
                    i = event.value
                    windows.append(event.tick)
                    area = cast.child.areas[i]
                    samples.append(dict(group=i, x=hero.x, y=hero.y, left=area.left, right=area.right))
                    trip.capture(('終点の拳', '左の火帯', '右の火帯', '締めの太陽拳')[i-1], tick, cast)
                elif event.kind == 'stygian:xbalanque:XB08:contact' and event.actor == hero.id:
                    assert event.value == before_player - hero.hp
                    hits.append(dict(group=event.group, tick=event.tick, damage=event.value))
            if cast.t == finale['dash'][0] + 7:
                assert hero.hp == before_player
                trip.capture('疾走中の残像', tick, cast)
            if finale['recovery'] <= cast.t < finale['total']:
                recovery += 1
                if recovery == 1:
                    trip.capture('反撃開始', tick, cast)
                return_damage += before_boss - boss.hp
            if not run.cast:
                completed = True
        active = run.cast
        if evade and active and active.key == 'XB07' and active.variant not in completed_chains:
            variant = active.variant
            seen = chains.setdefault(variant, [])
            if not seen or seen[-1]['key'] != active.child.key:
                seen.append(dict(key=active.child.key, start=active.child.offset))
                trip.capture(f'烈日連携 {variant}・{len(seen)}段目', tick, active)
        if evade and cast and cast.key == 'XB07' and cast.variant not in completed_chains and not active:
            expected = [{'key': child['key'], 'start': child['at']}
                        for child in spec['moves']['XB07']['variants'][cast.variant]['children']]
            assert chains[cast.variant] == expected
            completed_chains.append(cast.variant)
    else:
        raise AssertionError(('time budget', run.stage, run.phase, boss.hp, completed_chains))

    assert completed and stages == [1, 2, 3] and windows == [a for a, _ in finale['windows']]
    assert recovery == finale['total'] - finale['recovery'] and return_damage > 0
    if evade:
        assert completed_chains == ['C', 'B', 'A']
        assert all(abs(row['x'] - middle) < 20 and row['y'] == arena['floor'] for row in samples[1:3])
        assert not hits, (hits, samples, path)
    else:
        assert [row['group'] for row in hits] == [1, 2, 3, 4], (hits, samples, path)
    for label in ('左の火帯', '右の火帯'):
        assert trip.frames[label]['view']['safe']['inLane'] == evade
    assert trip.frames['反撃開始']['view']['finale']['damage'] == ([0] * 4 if evade else [68] * 4)
    reward = trip.verify_clear()
    case = 'xbalanque-center' if evade else 'xbalanque-firebands'
    label = '烈日激突・中央の安全路で回避' if evade else '烈日激突・火帯と拳が命中'
    (output / f'{case}-frames.json').write_text(
        json.dumps(trip.frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, path, hits, samples, recovery, return_damage, completed_chains, reward, flush=True)
    return dict(controller='xbalanque', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stageOrder=stages, path=path, windows=windows, positions=samples, hits=hits,
                recoveryTicks=recovery, recoveryDamageDealt=return_damage,
                chainOrder=completed_chains, chains=chains, reward=reward,
                extremeClears=[trip.prior, trip.prior + 1], loadout=trip.loadout)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = [replay(args.from_save, args.output_dir, evade) for evade in (True, False)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + '\n', 'utf8')
