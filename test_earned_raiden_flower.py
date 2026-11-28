"""Compare charged and uncharged flower outcomes from an earned expert rematch."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import (capture_scene, expert_rematch, read,
                                         restore_rematch_equipment, verify_repeat)


def replay(source, output, route, *, weapon='SW06', next_save=None):
    engine = runtime()
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses'] if b['controller'] == 'raiden')
    trip, slot, start, loadout, mode, record_key, prior = expert_rematch(
        source.resolve(), engine, spec, weapon=weapon, trial_flower=next_save is not None)
    state, hero = trip.state, trip.actor
    before = state.progression.total, state.mora
    frames, stages, charges, first_slash = {}, [], [], {}
    last_stage = None
    impact_tick = spec['moves']['WR15']['windows'][0][0]
    repair_end = False
    defense_frames = 0
    form_hp = None
    charge_flower = route != 'empty'

    def capture(label, tick, move, phase_tick):
        if label not in frames:
            frames[label] = capture_scene(trip, tick, slot.stage, move, phase_tick)

    for tick in range(1, 60 * 240 + 1):
        cast = slot.cast
        stage = slot.stage
        move = cast.id if cast else None
        if stage != last_stage:
            stages.append({'stage': stage, 'tick': tick - 1, 'bossHp': slot.primary.hp})
            if stage == 'collapse':
                form_hp = slot.primary.hp
            if stage == 'normal' and last_stage == 'repair':
                assert slot.primary.hp == form_hp
                repair_end = True
                capture('復帰', tick - 1, 'WR17', slot.stageTick)
            last_stage = stage

        attack = repair_end
        target = slot.primary.x
        goal = target + (-66 if hero.x < target else 66)
        if move == 'WR14':
            target = cast.location
            goal = target + (-64 if target > 480 else 64)
            attack = charge_flower and cast.opened is not None and cast.charges < spec['objects']['flowerHits']
        elif move == 'WR15':
            goal = cast.location
            if route == 'outside':
                offset = spec['objects']['flowerRadius'] + 25
                goal += offset if goal < 480 else -offset
            attack = False
        dx, delta = target - hero.x, goal - hero.x
        steer = delta if abs(delta) > 8 else dx if attack and dx * hero.dir < 0 else 0
        controls = trip.lua.table(left=steer < 0, right=steer > 0, attack=attack and abs(dx) <= 108 and dx * hero.dir >= 0)
        hp = hero.hp
        trip.tick(1, controls)
        if slot.waitUntil:
            break
        assert state.returns == 0 and hero.hp > 0

        cast = slot.cast
        if cast and cast.id == 'WR14':
            if cast.t in (75, 360):
                capture('追念の花蕊・' + str(cast.t), tick, cast.id, cast.t)
            if not first_slash and cast.charges and (not charges or charges[-1] != cast.charges):
                charges.append(cast.charges)
        elif cast and cast.id == 'WR15':
            if cast.t == impact_tick - 1:
                capture('大太刀の直前', tick, cast.id, cast.t)
            if cast.t == impact_tick and not first_slash:
                inside = abs(hero.x - cast.location) <= spec['objects']['flowerRadius']
                assert inside == (route != 'outside')
                assert abs(hero.y - spec['floorY']) < 0.01
                assert cast.charges == (spec['objects']['flowerHits'] if charge_flower else 0)
                if route == 'protected':
                    assert hero.hp == hp
                else:
                    assert hp - hero.hp == spec['moves']['WR15']['damage']
                exact = 'raiden:WR15:protected' if route == 'protected' else 'raiden:WR15:hit'
                assert any(e.kind == exact and e.actor == hero.id for e in state.events.values())
                first_slash = {'charge': cast.charges, 'inside': inside, 'hpLoss': hp - hero.hp, 'event': exact,
                               'moveTick': cast.t, 'elapsedTicks': tick, 'heroX': hero.x, 'flowerX': cast.location}
                capture('大太刀の判定', tick, cast.id, cast.t)
        if slot.stage == 'collapse':
            if not slot.primary.invulnerable:
                defense_frames += 1
                capture('装甲崩壊・攻撃可能', tick, 'WR16', slot.stageTick)
        if slot.stage == 'repair' and slot.stageTick == spec['moves']['WR17']['recovery']:
            capture('装甲修復', tick, 'WR17', slot.stageTick)
    else:
        raise AssertionError(('time budget', slot.stage, slot.primary.hp))

    assert first_slash and repair_end
    assert defense_frames == spec['moves']['WR16']['total'] - spec['moves']['WR16']['recovery']
    assert charges == (list(range(1, spec['objects']['flowerHits'] + 1)) if charge_flower else [])
    upcoming = frames['大太刀の直前']['view']['flower']
    resolved = frames['大太刀の判定']['view']['flower']
    assert upcoming['inside'] == first_slash['inside'] and not upcoming.get('slashResult')
    assert upcoming['slashIn'] == 1
    if route == 'outside':
        direction = 'left' if first_slash['heroX'] > first_slash['flowerX'] else 'right'
        assert upcoming['approach'] == direction
    assert resolved['slashResult'] == ('protected' if route == 'protected' else 'hit')
    assert 'slashIn' not in resolved
    reward = trip.frame().weeklyBoss.reward
    payout = dict(xp=reward.xp, mora=reward.mora, first=reward.first)
    party_hp = [actor.hp for actor in state.actors.values()]
    verify_repeat(trip, before, start, mode, record_key, prior)
    key = 'raiden-' + route
    title = {'protected': '雷電・充填済みの保護域内', 'outside': '雷電・充填済みの保護域外',
             'empty': '雷電・未充填'}[route]
    (output / f'{key}-frames.json').write_text(json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(key, tick, first_slash, 'stages', [row['stage'] for row in stages], flush=True)
    proof = dict(controller='raiden', case=key, label=title, ticks=tick, sourceSha256=trip.source,
                 stages=stages, loadout=loadout, charges=charges, slash=first_slash,
                 downFrames=defense_frames, reward=payout, expertClears=[prior, prior + 1],
                 partyHp=party_hp, returns=0)
    if next_save:
        saved = restore_rematch_equipment(trip, start, loadout, 'inazuma-town')
        assert saved['azhdahaPair'] == start['azhdahaPair']
        assert saved['endgame']['bosses'] == start['endgame']['bosses']
        assert saved['endgame']['weekly'][record_key]['clears'] == prior + 1
        assert saved['weeklyBosses'][spec['id']]['waitTicks'] > 0
        raw = (json.dumps(saved, ensure_ascii=False) + '\n').encode()
        next_save.write_bytes(raw)
        proof.update(savedSha256=sha256(raw).hexdigest(), equipmentRestored=True)
    return proof


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--weapon', default='SW06')
    parser.add_argument('--chain', action='store_true', help='Continue from the previous ranked win')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    source = args.from_save
    for index, route in enumerate(('protected', 'outside', 'empty'), 1):
        filename = f'rematch-{index}-save.json' if index < 3 else 'complete.json'
        next_save = args.output_dir / filename if args.chain else None
        results.append(replay(source, args.output_dir, route, weapon=args.weapon, next_save=next_save))
        if next_save:
            source = next_save
    (args.output_dir / 'weekly-mechanics.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
