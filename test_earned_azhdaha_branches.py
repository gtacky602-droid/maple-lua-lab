"""Replay all four absorption pairs with the earned save and ordinary Lua inputs."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from test_earned_weekly_mechanics import (capture_scene, expert_rematch, read,
                                         restore_rematch_equipment, verify_repeat)


pairs = (('pyro', 'cryo'), ('pyro', 'electro'), ('hydro', 'cryo'), ('hydro', 'electro'))
names = {'pyro': '炎', 'hydro': '水', 'cryo': '氷', 'electro': '雷'}
cue_ticks = {'WZ09': 90, 'WZ10': 134, 'WZ11': 94, 'WZ12': 181}


def replay(source, engine, driver, spec, pair, output, *, weapon='SW06', next_save=None):
    first, second = pair
    lobby = f'azhdaha_pair:{first}:{second}'
    trip, slot, start, loadout, mode, record_key, prior = expert_rematch(
        source, engine, spec, lobby, weapon=weapon, trial_flower=next_save is not None)
    assert list(slot.pair.values()) == list(pair)
    state = trip.state
    before = state.progression.total, state.mora
    phase_two = 'WZ10.hydro' if first == 'hydro' else 'WZ10'
    phase_three = {'WZ04.infused', f'WZ05.{second}', 'WZ14'}
    phase_three.update(('WZ11.cryo', 'WZ12.cryo') if second == 'cryo' else ('WZ11', 'WZ12'))
    completed = set()
    casts = {}
    frames = {}
    lead = {}
    safe_waves = {}
    dodge_trials = next_save is not None and second == 'electro'

    def sample(tick, stage, move, move_tick):
        cast = slot.cast
        if not cast:
            return
        variant = cast.variant
        element = cast.infusion or cast.element
        if move_tick == 0:
            casts.setdefault(f'{stage}:{variant}:{element}', tick)
        if move_tick == cast.move.total - 1:
            completed.add(variant)
        if variant == 'WZ12' and dodge_trials:
            width = spec['width'] / 3
            cue = trip.core.azhdahaSafeLaneCue(cast)
            if move_tick in (60, 192, 312):
                assert cue is not None and cue.ticks >= 108
                lead[cue.wave] = native(cue)
                if move_tick == 60 and 'WZ12-予兆' not in frames:
                    scene = capture_scene(trip, tick, stage, move, move_tick)
                    assert scene['view'].get('safeLane') is None
                    assert any(draw.get('text') == '次の安全帯' for draw in scene['png'])
                    frames['WZ12-予兆'] = scene
            if move_tick in (180, 300, 420):
                assert cue.ticks == 0 and cue.lane == cue.wave
                assert (cue.lane - 1) * width + 25 < trip.actor.x < cue.lane * width - 25
                safe_waves[cue.wave] = {'tick': move_tick, 'lane': cue.lane, 'x': trip.actor.x}
            assert not any(e.kind == 'azhdaha:WZ12:hit:electro' and e.actor == trip.actor.id
                           for e in state.events.values())
        if cue_ticks.get(move) == move_tick:
            identifier = f'{move}-{slot.form}' if move == 'WZ09' else move
            if identifier not in frames:
                scene = capture_scene(trip, tick, stage, move, move_tick)
                assert scene['view']['elementSlots'] == list(pair)
                assert scene['view']['moveslot'] == variant
                frames[identifier] = scene

    def can_attack():
        if slot.form == 1:
            return True
        if slot.form == 2:
            return phase_two in completed
        return phase_three <= completed

    options = trip.lua.table(sample=sample, canAttack=can_attack, followAzhdahaSafeLane=dodge_trials)
    result = native(driver(trip.core, state, slot, 'weekly', 60 * 600, 'mechanics', options))
    assert result['status'] == 'clear', (pair, loadout, completed, result)
    assert phase_three | {phase_two} <= completed, (pair, completed)
    expected_frames = {'WZ09-1', 'WZ09-2', 'WZ10', 'WZ11', 'WZ12'}
    if dodge_trials:
        expected_frames.add('WZ12-予兆')
    assert frames.keys() == expected_frames, (pair, frames.keys())
    tail = frames['WZ12']['view']
    assert tail['tail'] and tail['damageable']
    assert bool(tail.get('safeLane')) == (second == 'electro')
    assert bool(tail.get('safeLaneCue')) == (second == 'electro')
    if dodge_trials:
        assert set(safe_waves) == set(lead) == {1, 2, 3}
    events = {r['id']: r['count'] for r in result['events']}
    assert events.get('azhdaha:WZ14:impact', 0) >= 2 and events.get('azhdaha:WZ14:secondary', 0) >= 2
    assert events.get(f'azhdaha:mark:{first}', 0) and events.get(f'azhdaha:mark:{second}', 0)
    for move, element in (('WZ10', first), ('WZ11', second), ('WZ12', second), ('WZ14', second)):
        if next_save is not None and move in ('WZ11', 'WZ12', 'WZ14'):
            # A chained replay proves that the moves resolve and can be avoided.
            # Independent mechanics runs still check their actual hit events.
            continue
        assert events.get(f'azhdaha:{move}:hit:{element}', 0), (pair, move, element)
    reward = native(trip.frame().weeklyBoss.reward)
    verify_repeat(trip, before, start, mode, record_key, prior)
    key = 'azhdaha-' + '-'.join(pair)
    (output / f'{key}-frames.json').write_text(json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(key, result['ticks'], 'ticks;', len(completed), 'completed variants', flush=True)
    proof = dict(controller='azhdaha', case=key, label=f'若陀龍王・{names[first]}＋{names[second]}', pair=pair,
                 sourceSha256=trip.source, completeVariants=sorted(completed), variantStarts=casts,
                 loadout=loadout, expertClears=[prior, prior + 1], repeatReward=reward, **result)
    if dodge_trials:
        proof.update(safeLaneLead=lead, safeWaves=safe_waves, travelerTailFieldHits=0)
    if next_save:
        saved = restore_rematch_equipment(trip, start, loadout, 'liyue-harbor')
        assert saved['azhdahaPair'] == list(pair)
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
    parser.add_argument('--chain', action='store_true', help='Restore gear and continue from the previous ranked win')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    engine = runtime()
    driver = engine[0].execute((ROOT / 'tools/earned_boss_driver.lua').read_text(encoding='utf-8'))
    spec = next(r for r in read('content/weekly-boss-spawns.json')['weeklyBosses'] if r['controller'] == 'azhdaha')
    results = []
    source = args.from_save.resolve()
    for index, pair in enumerate(pairs, 1):
        filename = f'rematch-{index}-save.json' if index < len(pairs) else 'complete.json'
        next_save = (args.output_dir / filename).resolve() if args.chain else None
        results.append(replay(source, engine, driver, spec, pair, args.output_dir, weapon=args.weapon, next_save=next_save))
        if next_save:
            source = next_save
    (args.output_dir / 'weekly-mechanics.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
