"""Reach the whole awakened rotation with ordinary inputs on the earned adventure save."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


cues = {
    ('WA09', 104): 'WA09-予兆', ('WA09', 133): 'WA09-落下と冷気床',
    ('WA10', 45): 'WA10-予兆', ('WA10', 109): 'WA10-一波',
    ('WA10', 139): 'WA10-二波', ('WA10', 169): 'WA10-三波',
    ('WA11', 55): 'WA11-予兆', ('WA11', 81): 'WA11-疾走', ('WA11', 94): 'WA11-接触',
}


def replay(source, output, save_rematch=False, weapon='SW06'):
    engine = runtime()
    driver = engine[0].execute((ROOT / 'tools/earned_boss_driver.lua').read_text(encoding='utf-8'))
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses'] if b['controller'] == 'andrius')
    trip, slot, start, loadout, mode, record_key, prior = expert_rematch(source.resolve(), engine, spec, weapon=weapon)
    state = trip.state
    before = state.progression.total, state.mora
    opening = False
    completed = set()
    frames = {}
    contacts = {}
    last_tell = {'WA09': 335, 'WA10': 251, 'WA11': 179}
    player_hp = trip.actor.hp

    def sample(tick, stage, move, move_tick):
        nonlocal opening, player_hp
        if move == 'WA05':
            opening = True
        if move in last_tell and move_tick == last_tell[move]:
            completed.add(move)
        if move in last_tell and trip.actor.hp < player_hp:
            contacts.setdefault(move, []).append({'tick': move_tick, 'hpLost': player_hp - trip.actor.hp})
        player_hp = trip.actor.hp
        label = cues.get((move, move_tick))
        if label and label not in frames:
            frames[label] = capture_scene(trip, tick, stage, move, move_tick)

    def can_attack():
        if slot.stage == 'P1':
            return opening and slot.primary.hp > slot.primary.maxhp / 2
        return completed == last_tell.keys()

    options = trip.lua.table(sample=sample, canAttack=can_attack)
    outcome = native(driver(trip.core, state, slot, 'weekly', 60 * 300, 'mechanics', options))
    assert outcome['status'] == 'clear' and slot.transitions == 1
    assert {row['id'] for row in outcome['moves']} == spec['moves'].keys()
    assert frames.keys() == set(cues.values()) and completed == last_tell.keys()
    assert all(scene['view']['awakened'] and scene['stage'] == 'P2' for scene in frames.values())
    assert contacts.keys() == last_tell.keys()
    assert len(frames['WA09-落下と冷気床']['view']['hazards']) == 2
    for index, label in enumerate(('WA10-一波', 'WA10-二波', 'WA10-三波'), 1):
        frame = frames[label]
        left = frame['view']['attack']['left'] - frame['camera']
        assert any(d.get('text') == f'北風の咆哮 {index}/3' for d in frame['png'])
        assert any(d.get('x') == left and d.get('color') == '#ffd2a0'
                   and d.get('y') == 390 and d.get('h') == 90 for d in frame['png'])
    phantom = frames['WA11-疾走']
    position = phantom['view']['phantom']['x']
    assert position != frames['WA11-予兆']['view']['attack']['entry']
    assert any(d.get('x') == position - phantom['camera'] - 25 and d.get('w') == 50
               and d.get('y') == 473 and d.get('color') == '#ffd2a0' for d in phantom['png'])
    assert any(d.get('opacity') == 0.6 and d['kind'] == 'boss_sprite' for d in phantom['png'])
    for profile in phantom['profiles'].values():
        draws = profile['packed']['draws']
        assert sum(draw['kind'] == 'rect_runs' for draw in draws) >= 2
    reward = native(trip.frame().weeklyBoss.reward)
    verify_repeat(trip, before, start, mode, record_key, prior)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'andrius-frames.json').write_text(json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    proof = dict(controller='andrius', boss=spec['id'], sourceSha256=trip.source, loadout=loadout,
                 hpLossDuringLateCasts=contacts, expertClears=[prior, prior + 1], **outcome)
    if save_rematch:
        trip.warp('mond-town')
        removed = set(loadout['removed'])
        for item in start['inventory']['items']:
            if item['id'] in removed:
                assert item['owner'] == 1
                trip.act(f"artifact_equip:{item['id']}")
        trip.act('weapon_equip:traveler:' + start['weapons']['equipped']['traveler'])
        saved = trip.snapshot()
        assert saved['weapons'] == start['weapons'] and saved['companion'] == start['companion']
        original_equipped = [i for i in start['inventory']['items'] if i['owner']]
        assert [i for i in saved['inventory']['items'] if i['owner']] == original_equipped
        assert saved['endgame']['bosses'][spec['id']] == start['endgame']['bosses'][spec['id']]
        assert saved['endgame']['weekly'][record_key]['clears'] == prior + 1
        assert saved['weeklyBosses'][spec['id']]['waitTicks'] > 0
        proof.update(repeatReward=reward, equipmentRestored=True)
        (output / 'complete.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', 'utf-8')
    (output / 'weekly-mechanics.json').write_text(json.dumps([proof], ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print('Andrius', outcome['ticks'], 'ticks;', len(outcome['moves']), 'moves;', contacts)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--save-rematch', action='store_true', help='Restore traveler gear and save the ranked rematch')
    parser.add_argument('--weapon', default='SW06', help='Travel weapon already earned in the source save')
    args = parser.parse_args()
    replay(args.from_save, args.output_dir, args.save_rematch, args.weapon)
