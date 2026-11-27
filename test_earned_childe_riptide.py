"""Replay three WC10 cleanses through movement and real hits in an earned expert run."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


def replay(source, output, route):
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if b['controller'] == 'childe')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(source.resolve(), runtime(), spec)
    state, hero, boss = trip.state, trip.actor, slot.primary
    hp_start = boss.hp
    before = state.progression.total, state.mora
    frames, forms, transformations = {}, [], []
    mark = cleanse = lock = impact = None
    first_drop = finished = False
    recovery_ticks = recovery_damage = 0

    def sample(label, tick, card=None):
        frames[label] = capture_scene(trip, tick, slot.form, card.id if card else 'form', card.tick if card else 0)

    for tick in range(1, 60 * 420 + 1):
        cast, switch = slot.cast, slot.shift
        if not forms or forms[-1] != slot.form:
            forms.append(slot.form)
        if switch and switch.tick == 1:
            assert boss.invulnerable
            transformations.append(dict(form=switch.next, hp=boss.hp))
            sample(f'第{switch.next}形態への変身', tick - 1)
        dx = boss.x - hero.x
        direction = 1 if dx > 0 else -1
        goal = boss.x - direction * 73
        if abs(hero.x - goal) < 7 and dx * hero.dir < 0:
            goal = hero.x + direction * 24
        attack = not boss.invulnerable and abs(dx) < 113 and dx * hero.dir > 0 and abs(hero.y - boss.y) < 70
        before_mark = slot.marks[state]
        if switch and switch.next == 2:
            goal, attack = 410, False
        if slot.form == 2 and not finished:
            attack = False
            if not first_drop and cast and cast.id == 'WC10':
                first_drop = True
                assert before_mark == 'electro'
                sample('追雷の予告', tick - 1, cast)
            if first_drop:
                if cast.tick >= cast.recovery:
                    attack = recovery_damage == 0 and abs(dx) < 113 and dx * hero.dir > 0 and abs(hero.y-boss.y)<70
                elif cast.cancelled:
                    # Return from the lamp while Childe waits after the cancelled drop.
                    pass
                elif route == 'early' or cast.tick >= 84 and not cleanse:
                    goal = 29
                elif cleanse:
                    goal = 110 if route == 'late-hit' else 29
                else:
                    goal = 133
            else:
                goal = 133 if mark else 410

        if hero.ground and hero.y < 480:
            trip.act('drop')
        seq = state.events[len(state.events)].seq if len(state.events) else 0
        hp_before, boss_before = hero.hp, boss.hp
        trip.tick(1, trip.lua.table(left=goal < hero.x - 5, right=goal > hero.x + 5, attack=attack))
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp > 0
        if slot.form != 2 or finished:
            continue
        current = slot.cast
        for event in state.events.values():
            if event.seq <= seq:
                continue
            if event.kind == 'childe:mark:electro' and not first_drop and not mark:
                mark = dict(tick=tick, move=current.id, actor=event.actor)
                sample('雷断流を受ける', tick, current)
            if not first_drop or event.target != boss.id:
                continue
            if event.kind == 'childe:WC10:lock':
                lock = dict(tick=tick, moveTick=current.tick, x=current.land)
                sample('追雷の落下地点が固定', tick, current)
            elif event.kind == 'childe:cleanse' and not cleanse:
                cleanse = dict(tick=tick, moveTick=current.tick, x=hero.x)
                assert slot.marks[state] is None
                sample('金灯で断流を解除', tick, current)
        if not first_drop:
            continue
        if current and current.tick == 144 and not current.cancelled:
            impact = dict(tick=tick, moveTick=current.tick, x=current.land, heroX=hero.x,
                          damage=hp_before - hero.hp, reapplied=slot.marks[state] == 'electro')
            sample('固定位置への落撃', tick, current)
        if current and slot.phase == 'recovery':
            recovery_ticks += 1
            recovery_damage += boss_before - boss.hp
            if recovery_ticks == 1:
                sample('追雷後の反撃開始', tick, current)
        elif not current:
            finished = True
    else:
        raise AssertionError((slot.form, slot.phase, boss.hp, mark, cleanse, lock, impact))

    assert forms == [1, 2, 3] and len(transformations) == 2 and finished
    assert mark and cleanse and cleanse['x'] <= spec['edge']
    assert recovery_ticks == (60 if route == 'early' else 120) and recovery_damage > 0
    if route == 'early':
        assert cleanse['moveTick'] < 84 and lock is None and impact is None
        reply = frames['追雷後の反撃開始']['view']['riptideDrop']
        assert reply == {'phase': 'cancelled', 'targeted': True, 'cleansed': 'before', 'recovery': 60}
    else:
        assert lock['moveTick'] == 84 < cleanse['moveTick'] < impact['moveTick'] == 144
        assert lock['x'] == impact['x']
        assert (impact['damage'] > 0) == (route == 'late-hit')
        assert impact['reapplied'] == (route == 'late-hit')
        assert frames['金灯で断流を解除']['view']['riptideDrop']['cleansed'] == 'after'
        reply = frames['追雷後の反撃開始']['view']['riptideDrop']
        assert reply == {'phase': 'landed', 'targeted': True, 'cleansed': 'after',
                         'x': lock['x'], 'damage': impact['damage'], 'recovery': 120}
    reward = trip.frame().weeklyBoss.reward
    result = dict(xp=reward.xp, mora=reward.mora, first=reward.first)
    verify_repeat(trip, before, start, mode, key, prior)
    case = 'childe-' + route
    label = {'early': '地点固定前に断流解除', 'late-evade': '固定後に解除して落撃を回避',
             'late-hit': '固定後に解除して落撃が命中'}[route]
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, mark, lock, cleanse, impact, recovery_ticks, recovery_damage, flush=True)
    return dict(controller='childe', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                bossHP=hp_start, loadout=loadout, forms=forms, transformations=transformations,
                mark=mark, lock=lock, cleanse=cleanse, impact=impact, recoveryTicks=recovery_ticks,
                recoveryDamage=recovery_damage, reward=result, expertClears=[prior, prior + 1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    fights = [replay(args.from_save, args.output_dir, route) for route in ('early', 'late-evade', 'late-hit')]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(fights, ensure_ascii=False, indent=2) + '\n', 'utf8')
