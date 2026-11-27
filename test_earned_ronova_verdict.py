"""Reach Ronova's final safe gate and lamp return through ordinary game inputs."""

from argparse import ArgumentParser
import json
from pathlib import Path

from test_earned_stygian_rematch import StygianRematch


def replay(source, output, spend_lamp):
    trip = StygianRematch(source, 'ronova')
    state, run = trip.state, trip.run
    boss, spec = run.boss, trip.spec
    arena = spec['arena']
    stages, verdicts, shifts, cast_keys = [], [], [], []
    prior_serial = jump_until = 0
    road_marks, safe_recovery, counter_damage = 0, 0, 0
    first_safe = lamp = returned = None

    for tick in range(1, 60 * 720 + 1):
        hero, cast = trip.actor, run.cast
        key = cast.key if cast else None
        if not stages or stages[-1] != run.stage:
            stages.append(run.stage)
            shifts.append(boss.hp)
        if cast and cast.serial != prior_serial:
            prior_serial, jump_until = cast.serial, 0
            cast_keys.append(key)
        unsafe = spend_lamp and not returned
        goal, attack, jump, point = hero.x, False, False, None
        if run.wipe or run.phase in ('enter', 'phase'):
            pass
        elif key == 'RN05' and cast.t < 138:
            if cast.t >= 84:
                offset = 65 if cast.mark < 820 else -65
                goal = cast.mark + offset
        elif key == 'RN08' and cast.t < cast.recover:
            if cast.waived:
                pass
            elif cast.gateX:
                goal = cast.gateX if not unsafe else 860 if cast.gateX < 650 else 108
            elif 252 <= cast.t < 612 and cast.found < 2:
                light = next((p for p in cast.shadows.values() if not p.taken), None)
                if light:
                    point = light.x, light.y
            elif cast.t < 240:
                goal = 170 if boss.dir > 0 else 790
        elif key == 'RN12' and 30 <= cast.t < cast.recover and not cast.arrived:
            x, y = arena['road'][cast.passed]
            point = x, y - 24
        elif key in ('RN03', 'RN06') and cast.t < cast.recover and not cast.done and len(cast.shadows):
            light = next((p for p in cast.shadows.values() if not p.taken), None)
            if light:
                point = light.x, light.y
        elif key == 'RN07' and cast.t < cast.recover:
            progress = min(1, max(0, (cast.t - 72) / 180))
            goal = cast.mark + (cast.endMark - cast.mark) * progress
        else:
            dx = boss.x - hero.x
            direction = 1 if dx > 0 else -1
            goal = boss.x - direction * 76
            if abs(goal - hero.x) < 9 and dx * hero.dir < 0:
                goal = hero.x + direction * 20
            allowed = run.stage < 4 or first_safe is not None
            if allowed and hero.y < 420 and hero.ground:
                trip.act('drop')
            attack = allowed and abs(dx) < 112 and dx * hero.dir > 0 and hero.y > 420 and not boss.invulnerable
            if key == 'RN08' and first_safe and cast.serial == first_safe:
                attack = attack and counter_damage == 0
        if point:
            goal, y = point
            if y < 406 and hero.y > 407 and abs(hero.x - goal) < 127 and cast.t > jump_until:
                jump_until = cast.t + 42
                trip.act('jump')
            jump = cast.t < jump_until

        last_seq = state.events[len(state.events)].seq if len(state.events) else 0
        boss_before, hero_before = boss.hp, hero.hp
        gate_before = cast.gateX if cast else None
        party_before = [a.hp for a in state.actors.values()]
        trip.tick(1, trip.lua.table(left=goal < hero.x - 6, right=goal > hero.x + 6, jump=jump, attack=attack))
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and not state.returns
        if cast and key == 'RN08' and cast.t == 811 and not first_safe and not run.wipe and not cast.waived:
            if (verdicts[-1]['serial'] if verdicts else None) != cast.serial:
                label = '安全門の内側' if not unsafe else f'安全門の外側{len(verdicts) + 1}'
                trip.capture(label, tick, cast)
        for event in state.events.values():
            if event.seq <= last_seq:
                continue
            if event.kind == 'stygian:ronova:RN12:road':
                road_marks = max(road_marks, event.value)
                if event.value == 2 and '冥路の上段' not in trip.frames:
                    assert hero.y <= 375
                    trip.capture('冥路の上段', tick, cast)
            elif event.kind in ('stygian:ronova:RN08:verdict-safe', 'stygian:ronova:authority_lethal'):
                assert key == 'RN08', (key, tick, event.tick, stages)
                safe = event.kind.endswith('verdict-safe')
                if safe:
                    assert abs(hero.x - gate_before) <= .7 * arena['unit']
                    assert hero.hp == hero_before
                else:
                    assert abs(hero.x - gate_before) > .7 * arena['unit'] and hero.hp == 0
                verdicts.append(dict(serial=cast.serial, tick=event.tick, safe=safe, collected=cast.found,
                                     x=hero.x, gateX=gate_before, hpBefore=hero_before, hpAfter=hero.hp,
                                     life=run.life, lamps=run.lamps, activeAfter=state.active))
                if safe and not first_safe:
                    first_safe = cast.serial
                    trip.capture('終告・裁定を回避', tick, cast)
                elif not safe and not run.wipe:
                    assert state.active != hero.id and run.lamps == 5
                    trip.capture('終告・相方に交代', tick, cast)
            elif event.kind == 'stygian:ronova:lamp-spent':
                assert unsafe and not lamp and key == 'RN08'
                lamp = dict(tick=tick, lamps=run.lamps, bossHp=boss_before, stage=run.stage,
                            moveTick=cast.t, partyBefore=party_before, waitTicks=run.wipe.wait)
                trip.capture('復活の灯を消費', tick, cast)
            elif event.kind == 'stygian:ronova:returned':
                assert lamp and not returned and run.life == 100 and run.protected == 120
                assert (boss.hp, run.stage, cast.t) == (lamp['bossHp'], lamp['stage'], lamp['moveTick'])
                assert tick - lamp['tick'] == lamp['waitTicks'] and cast.waived and len(cast.shadows) == 0
                assert all(a.hp == a.maxhp for a in state.actors.values())
                returned = dict(tick=tick, bossHp=boss.hp, stage=run.stage, moveTick=cast.t, life=run.life,
                                protectionTicks=run.protected, lamps=run.lamps)
                trip.capture('二人が安全な床に復帰', tick, cast)
                if state.active != 1:
                    trip.act('swap')
        if cast and cast.serial == first_safe and run.cast and run.cast.serial == first_safe and cast.t >= cast.recover:
            safe_recovery += 1
            counter_damage += boss_before - boss.hp
            if safe_recovery == 1:
                trip.capture('終告・反撃開始', tick, cast)
    else:
        raise AssertionError((run.stage, run.phase, boss.hp, verdicts, lamp, returned, cast_keys[-12:]))

    assert stages == [1, 2, 3, 4] and shifts == [12300, 9225, 5535, 1845]
    assert road_marks == 4 and safe_recovery == 270 and counter_damage > 0
    assert [row['safe'] for row in verdicts if not row['safe']] == ([False, False] if spend_lamp else [])
    assert verdicts[2 if spend_lamp else 0]['safe']
    assert all(row['tick'] == 840 and row['collected'] == 2 for row in verdicts)
    assert run.lamps == (4 if spend_lamp else 5) and bool(lamp) == bool(returned) == spend_lamp
    assert trip.frames['終告・裁定を回避']['view']['finalVerdict'] == 'gate'
    if spend_lamp:
        assert trip.frames['復活の灯を消費']['view']['finalVerdict'] == 'down'
        assert trip.frames['二人が安全な床に復帰']['view']['protection'] == 120
    reward = trip.verify_clear()
    case = 'ronova-return' if spend_lamp else 'ronova-gate'
    label = '裁定で倒れ、灯で戻ってから安全門へ' if spend_lamp else '最初の終告を安全門でしのぐ'
    (output / f'{case}-frames.json').write_text(
        json.dumps(trip.frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, verdicts, lamp, returned, safe_recovery, counter_damage, flush=True)
    return dict(controller='ronova', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stages=stages, phaseStartHp=shifts, movesSeen=list(dict.fromkeys(cast_keys)), roadMarks=road_marks,
                verdicts=verdicts, lamp=lamp, returned=returned, recoveryTicks=safe_recovery,
                counterDamage=counter_damage, reward=reward, extremeClears=[trip.prior, trip.prior + 1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = [replay(args.from_save, args.output_dir, spend) for spend in (False, True)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + '\n', 'utf8')
