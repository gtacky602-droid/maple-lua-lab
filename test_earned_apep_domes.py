"""Play Apep's expert defense and compare the last pulse inside and outside a dome."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


def replay(source, output, covered):
    spec = next(row for row in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if row['controller'] == 'apep')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(source.resolve(), runtime(), spec)
    state, hero, boss = trip.state, trip.actor, slot.primary
    before = state.progression.total, state.mora
    hp_start = boss.hp
    frames, stages, pulses = {}, [], []
    defense = {}
    retreat = 145
    opening_ticks = opening_damage = 0
    last_wave = spec['moves']['WP17']['windows'][-1][0] + spec['moves']['WP16']['total']
    wave_times = [window[0] + spec['moves']['WP16']['total'] for window in spec['moves']['WP17']['windows']]

    def sample(label, tick):
        if label in frames:
            return
        move = slot.cast
        if slot.wave:
            name = 'WP17' if slot.wave.t >= spec['moves']['WP16']['total'] else 'WP16'
            move_tick = slot.wave.t
        else:
            name = move.id if move else slot.stage
            move_tick = move.t if move else slot.stageTick
        frames[label] = capture_scene(trip, tick, slot.stage, name, move_tick)

    for tick in range(1, 60 * 600 + 1):
        stage, wave, heart = slot.stage, slot.wave, slot.defense
        if not stages or stages[-1]['stage'] != stage:
            stages.append(dict(stage=stage, tick=tick-1))
            sample({'dark': '暗色の守護者', 'expose': '露出した心', 'defense': '心の防衛開始',
                    'rebirth': '原初の蘇生', 'prime': '緑の守護者', 'shelter': '保護域の準備',
                    'weak': '余波後の脱力'}[stage], tick-1)
        goal, target = hero.x, None
        if stage == 'dark' and not boss.invulnerable or stage in ('weak', 'prime') and opening_ticks:
            target = boss.x
        elif stage == 'defense':
            defense = dict(lastProgress=heart.progress, kills=heart.kills)
            units = [unit for unit in heart.units.values() if unit.hp > 0
                     and not (unit.guard and unit.guard.hp > 0)]
            if len(units) >= 3 and '接近する増殖体' not in frames:
                sample('接近する増殖体', tick-1)
            if units:
                unit = min(units, key=lambda e: (
                    abs(hero.x - e.x) + (135 if e.role == 'breeder' and e.shell > 0 else 0)
                    - {'warden': 95, 'burst': 185}.get(e.role, 0)
                    - max(0, 190 - abs(480 - e.x)) * .45))
                target = unit.x
            else:
                goal = 480
            walls = [wall for wall in heart.walls.values() if wall.hp > 0
                     and abs(wall.x - hero.x) < 65]
            if target is not None and any((wall.x-hero.x)*(target-wall.x)>0 for wall in walls):
                target = walls[0].x
        elif stage == 'prime':
            if abs(hero.x-retreat) < 12 and abs(hero.x-boss.x) < 200:
                retreat = 960-retreat
            goal = retreat
        elif stage == 'shelter':
            if not covered and wave.t >= wave_times[2] + 7:
                goal = 310
            else:
                goal = 480

        if hero.ground and hero.y < 470:
            trip.act('drop')
        attack = False
        if target is not None:
            dx = target - hero.x
            direction = 1 if dx >= 0 else -1
            goal = target - direction * 65
            if abs(hero.x-goal) < 8 and dx*hero.dir < 0:
                goal = hero.x + direction*18
            attack = abs(dx) < 107 and dx*hero.dir >= 0
        hp_before, boss_before = hero.hp, boss.hp
        window = bool(stage == 'weak' and spec['dome']['exposureStart'] <= slot.stageTick <
                      spec['moves']['WP18']['recovery'])
        trip.tick(1, trip.lua.table(left=goal < hero.x-6, right=goal > hero.x+6, attack=attack))
        if window and opening_ticks < 480:
            opening_ticks += 1
            opening_damage += boss_before-boss.hp
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp > 0 and slot.stage != 'failed', (tick, defense, stages)
        if slot.stage == 'weak' and slot.stageTick == spec['dome']['exposureStart']:
            sample('8秒の攻撃機会', tick)
        if wave and wave.t in wave_times and not opening_ticks:
            group = wave_times.index(wave.t)+1
            event = next(e for e in reversed(list(state.events.values()))
                         if e.actor == 1 and e.value == group and e.kind in ('apep:WP17:protected','apep:WP17:hit'))
            pulses.append(dict(t=wave.t, group=group, x=hero.x, y=hero.y,
                               damage=hp_before-hero.hp, protected=event.kind.endswith(':protected')))
            if wave.t == last_wave or group == 1:
                sample('ドームで最初の余波を防ぐ' if group == 1 else '最後の余波', tick)
    else:
        raise AssertionError((stages[-3:], boss.hp, defense, opening_damage))

    assert list(dict.fromkeys(step['stage'] for step in stages)) == [
        'dark', 'expose', 'defense', 'rebirth', 'prime', 'shelter', 'weak']
    assert defense['kills'] > 0 and '接近する増殖体' in frames
    assert [p['protected'] for p in pulses] == [True, True, True, covered], (stages, pulses, opening_damage)
    assert [p['damage'] for p in pulses[:-1]] == [0, 0, 0]
    assert (pulses[-1]['damage'] == 0) == covered
    assert frames['8秒の攻撃機会']['view']['apep']['exposure'] == opening_ticks == 480
    final_result = {'protected': covered, 'damage': pulses[-1]['damage']}
    assert frames['最後の余波']['view']['apep']['finalPulse'] == final_result
    assert frames['8秒の攻撃機会']['view']['apep']['finalPulse'] == final_result
    assert opening_damage > 0
    reward = trip.frame().weeklyBoss.reward
    payout = dict(xp=reward.xp, mora=reward.mora, first=reward.first)
    verify_repeat(trip, before, start, mode, key, prior)
    case = 'apep-covered' if covered else 'apep-outside'
    label = '最後の余波をドームで防ぐ' if covered else '最後の余波がドーム外で命中'
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':'))+'\n', 'utf8')
    print(case, tick, defense, pulses, opening_ticks, opening_damage, flush=True)
    return dict(controller='apep', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                bossHP=hp_start, loadout=loadout, stages=stages, defense=defense, pulses=pulses,
                openingTicks=opening_ticks, damageDuringOpening=opening_damage, reward=payout,
                expertClears=[prior, prior+1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    fights = [replay(args.from_save, args.output_dir, safe) for safe in (True, False)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(fights, ensure_ascii=False, indent=2)+'\n', 'utf8')
