"""Replay all four absorption pairs with the earned save and ordinary Lua inputs."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


pairs = (('pyro', 'cryo'), ('pyro', 'electro'), ('hydro', 'cryo'), ('hydro', 'electro'))
names = {'pyro': '炎', 'hydro': '水', 'cryo': '氷', 'electro': '雷'}
cue_ticks = {'WZ09': 90, 'WZ10': 134, 'WZ11': 94, 'WZ12': 181}


def replay(source, engine, driver, spec, pair, output):
    first, second = pair
    lobby = f'azhdaha_pair:{first}:{second}'
    trip, slot, start, _, mode, record_key, prior = expert_rematch(source, engine, spec, lobby)
    assert list(slot.pair.values()) == list(pair)
    state = trip.state
    before = state.progression.total, state.mora
    phase_two = 'WZ10.hydro' if first == 'hydro' else 'WZ10'
    phase_three = {'WZ04.infused', f'WZ05.{second}', 'WZ14'}
    phase_three.update(('WZ11.cryo', 'WZ12.cryo') if second == 'cryo' else ('WZ11', 'WZ12'))
    completed = set()
    casts = {}
    frames = {}

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

    options = trip.lua.table(sample=sample, canAttack=can_attack)
    result = native(driver(trip.core, state, slot, 'weekly', 60 * 600, 'mechanics', options))
    assert phase_three | {phase_two} <= completed, (pair, completed)
    assert result['status'] == 'clear'
    assert frames.keys() == {'WZ09-1', 'WZ09-2', 'WZ10', 'WZ11', 'WZ12'}, (pair, frames.keys())
    tail = frames['WZ12']['view']
    assert tail['tail'] and tail['damageable']
    assert bool(tail.get('safeLane')) == (second == 'electro')
    events = {r['id']: r['count'] for r in result['events']}
    assert events.get('azhdaha:WZ14:impact', 0) >= 2 and events.get('azhdaha:WZ14:secondary', 0) >= 2
    assert events.get(f'azhdaha:mark:{first}', 0) and events.get(f'azhdaha:mark:{second}', 0)
    for move, element in (('WZ10', first), ('WZ11', second), ('WZ12', second), ('WZ14', second)):
        assert events.get(f'azhdaha:{move}:hit:{element}', 0), (pair, move, element)
    verify_repeat(trip, before, start, mode, record_key, prior)
    key = 'azhdaha-' + '-'.join(pair)
    (output / f'{key}-frames.json').write_text(json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(key, result['ticks'], 'ticks;', len(completed), 'completed variants', flush=True)
    return dict(controller='azhdaha', case=key, label=f'若陀龍王・{names[first]}＋{names[second]}', pair=pair,
                sourceSha256=trip.source, completeVariants=sorted(completed), variantStarts=casts,
                expertClears=[prior, prior + 1], **result)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    engine = runtime()
    driver = engine[0].execute((ROOT / 'tools/earned_boss_driver.lua').read_text(encoding='utf-8'))
    spec = next(r for r in read('content/weekly-boss-spawns.json')['weeklyBosses'] if r['controller'] == 'azhdaha')
    results = [replay(args.from_save.resolve(), engine, driver, spec, pair, args.output_dir) for pair in pairs]
    (args.output_dir / 'weekly-mechanics.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
