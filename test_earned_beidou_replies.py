"""Compare Beidou's standard extreme guard replies from one earned save."""

from argparse import ArgumentParser
import json
from pathlib import Path
from types import SimpleNamespace

from test_earned_stygian_rematch import StygianRematch


def replay(source, output, bait, evade):
    trip = StygianRematch(source, 'beidou')
    state, run, hero = trip.state, trip.run, trip.actor
    boss, spec = run.boss, trip.spec
    arena = spec['arena']
    floor = arena['floor']
    assert boss.maxhp == 2860
    phase_start, impacts, positions = {}, [], {}
    decision = trigger_hp = None
    first_opening = opening_damage = 0
    completed = False

    def capture(label, tick, key):
        trip.capture(label, tick, SimpleNamespace(key=key, t=boss.tick))

    for tick in range(1, 60 * 240 + 1):
        phase, move = boss.phase, boss.move
        key = move.key if move else phase
        first = boss.turn == 1
        dx = boss.x - hero.x
        direction = 1 if dx > 0 else -1
        goal = boss.x - direction * 76
        if abs(goal - hero.x) < 10 and dx * hero.dir < 0:
            goal = hero.x + direction * 24
        close = abs(dx) < 110 and dx * hero.dir > 0 and hero.y > 420
        attack, jump = False, False
        if boss.turn == 0 or phase == 'intro':
            goal = hero.x if phase == 'intro' else goal
        elif phase == 'guard':
            attack = first and bait and close
            if hero.ground and hero.y < floor:
                trip.act('drop')
        elif phase in ('tell', 'strike', 'feint'):
            if first and not evade:
                goal = (move.lo + move.hi) / 2
                if hero.ground and hero.y < floor:
                    trip.act('drop')
            elif first and key == 'wake':
                goal = (move.lo + move.hi) / 2
                if phase == 'tell' and boss.tick == 43:
                    trip.act('jump')
                jump = (phase == 'tell' and boss.tick >= 43
                        or phase == 'strike' and boss.tick < 14)
            else:
                ends = [x for x in (move.lo - 16, move.hi + 16)
                        if arena['left'] <= x <= arena['right']]
                if ends:
                    goal = min(ends, key=lambda x: abs(hero.x - x))
                if first and key == 'baited' and phase == 'tell' and boss.tick == 28:
                    trip.act('jump')
                jump = first and key == 'baited' and (phase == 'strike' or boss.tick >= 28)
        elif phase == 'recover':
            attack = close and (completed or opening_damage == 0)
            if hero.ground and hero.y < floor:
                trip.act('drop')

        last_seq = state.events[len(state.events)].seq if len(state.events) else 0
        boss_before, hero_before = boss.hp, hero.hp
        trip.tick(1, trip.lua.table(left=goal < hero.x - 5, right=goal > hero.x + 5,
                                   jump=jump, attack=attack))
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and not state.returns and hero.hp > 0
        if not first and boss.turn != 1:
            continue
        if boss.phase == 'guard' and phase != 'guard':
            phase_start['guard'] = tick
            trigger_hp = boss.hp
            capture('構え', tick, 'guard')
        if boss.phase == 'tell' and phase != 'tell':
            phase_start[boss.move.key] = tick
            capture('返し波の予告' if boss.move.key == 'wake' else '斬撃の予告', tick, boss.move.key)
        if boss.phase == 'strike' and boss.tick == spec['timing']['impactStart']:
            current = boss.move
            positions[current.key] = dict(tick=tick, x=hero.x, y=hero.y,
                                          left=current.lo, right=current.hi,
                                          top=current.ground-current.height)
            capture('返し波の着弾' if current.key == 'wake' else '斬撃の着弾', tick, current.key)
        for event in state.events.values():
            if event.seq <= last_seq or not event.kind.startswith('stygian:beidou:'):
                continue
            kind = event.kind.removeprefix('stygian:beidou:')
            if kind in ('baited', 'waited'):
                assert boss.hp == trigger_hp
                decision = dict(kind=kind, tick=tick, actor=event.actor, guardedBossHp=boss.hp)
            elif kind.startswith('impact:') and event.actor == hero.id:
                assert event.value == hero_before - hero.hp
                impacts.append(dict(move=kind.split(':')[1], tick=tick, damage=event.value))
        if boss.phase == 'recover' and boss.turn == 1:
            first_opening += 1
            opening_damage += boss_before - boss.hp
            if first_opening == 1:
                capture('反撃開始', tick, 'recover')
        if first and boss.turn != 1:
            completed = True
    else:
        raise AssertionError((boss.phase, boss.hp, phase_start, impacts, positions, first_opening))

    assert decision['kind'] == ('baited' if bait else 'waited') and completed
    assert first_opening == (72 if bait else 139) and opening_damage > 0
    if bait:
        assert list(positions) == ['baited', 'wake']
        wave = positions['wake']
        assert wave['left'] <= wave['x'] <= wave['right']
        assert (wave['y'] <= wave['top']) == evade, positions
    else:
        assert list(positions) == ['quiet']
    expected_damage = [] if evade else [61, 36] if bait else [51]
    assert [hit['damage'] for hit in impacts] == expected_damage, (impacts, positions)
    kind = 'baited' if bait else 'quiet'
    damage_by_move = {hit['move']: hit['damage'] for hit in impacts}
    reply = {'kind': kind, 'damage': damage_by_move.get(kind, 0)}
    if bait:
        reply['waveDamage'] = damage_by_move.get('wake', 0)
    assert trip.frames['反撃開始']['view']['guardReply'] == reply
    reward = trip.verify_clear()
    case = 'beidou-' + ('bait' if bait else 'wait') + ('-evade' if evade else '-hit')
    label = ('打ち込んで誘い返し' if bait else '待って見切りの一閃') + ('・回避' if evade else '・被弾')
    (output / f'{case}-frames.json').write_text(
        json.dumps(trip.frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, decision, impacts, first_opening, opening_damage, flush=True)
    return dict(controller='beidou', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                bossHP=2860, phaseStart=phase_start, decision=decision, positions=positions, hits=impacts,
                recoveryTicks=first_opening, recoveryDamage=opening_damage,
                reward=reward, extremeClears=[trip.prior, trip.prior + 1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    fights = [replay(args.from_save, args.output_dir, bait, evade)
              for bait in (False, True) for evade in (True, False)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(fights, ensure_ascii=False, indent=2) + '\n', 'utf8')
