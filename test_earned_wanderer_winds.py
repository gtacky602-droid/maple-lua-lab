"""Play the three Four Winds routes with ordinary inputs from the same earned save."""

from argparse import ArgumentParser
import json
from pathlib import Path

from test_earned_stygian_rematch import StygianRematch


def replay(source, output, target_marks, offset):
    trip = StygianRematch(source, 'wanderer')
    state, run = trip.state, trip.run
    hero, boss = trip.actor, run.boss
    arena = trip.spec['arena']
    center, floor = arena['centerX'], arena['floor']
    stages, marks, contacts = [], [], []
    previous_serial = jump_until = 0
    jump_kind, side = None, 0
    finale = gate = before_burst = burst_position = None
    finished = False
    air_hit = air_ticks = counter_ticks = counter_damage = 0

    for tick in range(1, 60 * 360 + 1):
        cast = run.cast
        key = cast.key if cast else None
        if not stages or stages[-1] != run.stage:
            stages.append(run.stage)
        if cast and cast.serial != previous_serial:
            previous_serial = cast.serial
            jump_until, jump_kind = 0, None
        if key == 'WD06' and finale is None:
            finale = cast.serial
        first_finale = cast and cast.serial == finale and key == 'WD06'
        goal, attack, point = hero.x, False, None
        hop = None

        if key == 'WD06' and cast.t < cast.recover:
            required = target_marks if first_finale else 2
            if cast.gate:
                goal = cast.gate.x + (offset if first_finale else 0)
                if hero.ground and hero.y < floor:
                    trip.act('drop')
            elif cast.t >= cast.data.markWindow[1] and cast.collected < required:
                point = next((p for p in cast.marks.values() if not p.taken), None)
            elif cast.collected >= required:
                goal = center
                if hero.ground and hero.y < floor:
                    trip.act('drop')
            elif 49 <= cast.t < 69 and hero.y > 472:
                hop = 'floor'
        elif key == 'WD03' and not cast.drop and cast.t < cast.recover:
            if cast.t >= cast.data.markWindow[1]:
                point = next((p for p in cast.marks.values() if not p.taken), None)
        elif run.phase not in ('enter', 'phase'):
            dx = boss.x - hero.x
            direction = 1 if dx > 0 else -1
            goal = boss.x - direction * 76
            if abs(goal - hero.x) < 9 and dx * hero.dir < 0:
                goal = hero.x + direction * 20
            if key == 'WD02' and cast.t < 124:
                if hero.ground and hero.y < floor:
                    trip.act('drop')
            else:
                if hero.ground and boss.y == floor and hero.y < floor:
                    trip.act('drop')
                allowed = run.stage < 3 or finished or first_finale and counter_damage == 0
                attack = (allowed and not boss.invulnerable and abs(dx) < 108
                          and dx * hero.dir > 0 and abs(hero.y - boss.y) < 68)

        if point:
            on_left = hero.x < center
            if point.y == 372:
                goal = point.x
                if hero.y > 374 and abs(hero.x - goal) < 20:
                    hop = 'side'
                if hero.ground and hero.y == 290:
                    trip.act('drop')
            else:
                if not side or hero.ground and hero.y in (372, 290):
                    side = -1 if on_left else 1
                if hero.ground and hero.y <= 291 or jump_kind == 'center' and not hero.ground:
                    goal = point.x
                elif hero.ground and hero.y == 372:
                    goal = center + side * 173
                    if abs(hero.x - goal) < 10:
                        hop, goal = 'center', point.x
                else:
                    goal = center + side * 270
                    if hero.y > 473 and abs(hero.x - goal) < 20:
                        hop = 'pad-for-center'
        t = cast.t if cast else 0
        if hop and hero.ground and t > jump_until + 1:
            jump_until, jump_kind = t + 48, hop
            trip.act('jump')
        last_seq = state.events[len(state.events)].seq if len(state.events) else 0
        boss_before = boss.hp
        if first_finale and t == 559:
            before_burst = hero.hp
            burst_position = {'x': hero.x, 'y': hero.y, 'offset': hero.x - cast.gate.x}
            trip.capture('最後の風の直前', tick - 1, cast)
        trip.tick(1, trip.lua.table(left=goal < hero.x - 5, right=goal > hero.x + 5,
                                   jump=t < jump_until, attack=attack))
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and not state.returns and hero.hp > 0
        same_cast = cast and run.cast and run.cast.serial == cast.serial
        if key == 'WD02' and '渡り風の残像' not in trip.frames and cast.t == 95:
            trip.capture('渡り風の残像', tick, cast)
        if key == 'WD03' and cast.drop and cast.t >= cast.recover and same_cast and air_ticks < 156:
            if not air_ticks:
                trip.capture('中段の足場で反撃開始', tick, cast)
            air_ticks += 1
            air_hit += boss_before - boss.hp
        if first_finale:
            for event in state.events.values():
                if event.seq <= last_seq or event.cast != finale or event.actor != hero.id:
                    continue
                if event.kind == 'stygian:wanderer:WD06:mark':
                    marks.append(dict(tick=event.tick, n=event.value, x=hero.x, y=hero.y))
                    trip.capture(f'風標{event.value}を点灯', tick, cast)
                elif event.kind == 'stygian:wanderer:WD06:contact' and event.tick >= 560:
                    contacts.append(dict(tick=event.tick, damage=event.value))
            if cast.t == cast.data.gateTick:
                gate = {'x': cast.gate.x, 'width': cast.gate.half * 2}
                trip.capture('安全門が開く', tick, cast)
            if cast.t == 574 and '最後の風の結果' not in trip.frames:
                assert before_burst - hero.hp == sum(row['damage'] for row in contacts)
                trip.capture('最後の風の結果', tick, cast)
            if same_cast and cast.t >= cast.recover:
                counter_ticks += 1
                counter_damage += boss_before - boss.hp
                if counter_ticks == 1:
                    trip.capture('四風の反撃開始', tick, cast)
            if not same_cast:
                finished = True
    else:
        raise AssertionError((run.stage, run.phase, boss.hp, air_ticks, air_hit, marks, gate, counter_ticks))

    assert stages == [1, 2, 3] and air_ticks == 156 and air_hit > 0
    assert finished and len(marks) == target_marks and [m['y'] for m in marks] == [372, 290][:target_marks]
    assert gate == {'x': center, 'width': 160 if target_marks == 2 else 112}
    assert burst_position['y'] == floor and abs(burst_position['offset'] - offset) <= 6
    assert contacts == ([{'tick': 560, 'damage': 50}] if target_marks == 1 and offset else []), contacts
    assert counter_ticks == (240 if target_marks == 2 else 150) and counter_damage > 0
    before = trip.frames['最後の風の直前']['view']
    assert before['safe']['inside'] == (not contacts)
    result = trip.frames['四風の反撃開始']['view']
    assert result['finalWind'] == {'width': gate['width'], 'damage': sum(row['damage'] for row in contacts)}
    assert result['hint'] == f'反撃の隙 {counter_ticks / 60:.1f}秒'
    reward = trip.verify_clear()
    route = 'wide-edge' if target_marks == 2 else 'narrow-edge' if offset else 'narrow-center'
    case = f'wanderer-{route}'
    label = ('風標二つ・門の中心から60px' if target_marks == 2 else
             '風標一つ・門の中心から60px' if offset else '風標一つ・門の中央')
    (output / f'{case}-frames.json').write_text(
        json.dumps(trip.frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, gate, burst_position, contacts, counter_ticks, counter_damage, flush=True)
    return dict(controller='wanderer', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stages=stages, firstAirRecoveryTicks=air_ticks, firstAirDamage=air_hit, marks=marks, gate=gate,
                burstPosition=burst_position, contacts=contacts, recoveryTicks=counter_ticks,
                counterDamage=counter_damage, reward=reward, extremeClears=[trip.prior, trip.prior + 1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = [replay(args.from_save, args.output_dir, count, offset) for count, offset in ((2, 60), (1, 60), (1, 0))]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + '\n', 'utf8')
