"""Compare the locked royal charge on two expert rematches from an earned save."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import (capture_scene, expert_rematch, read,
                                         restore_rematch_equipment, verify_repeat)


def replay(source, output, lure, *, weapon='SW06', next_save=None):
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if b['controller'] == 'game_before_gate')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(
        source.resolve(), runtime(), spec, weapon=weapon, trial_flower=next_save is not None,
        keep_pending_loot=next_save is not None)
    state, hero = trip.state, trip.actor
    before = state.progression.total, state.mora
    moves, board = spec['moves'], spec['board']
    trial = moves['WT17']
    threshold = board['left'] + trial['lure_min_x_U'] * board['unit']
    frames, stages, pawns, freezes, locks, misses, tsunami, transfers = {}, [], [], [], [], [], [], []
    collision = None
    exposure = exposure_damage = 0
    released = False

    def sample(label, tick, cast):
        frames[label] = capture_scene(trip, tick, slot.stage, cast.key, cast.t)

    for tick in range(1, 60 * 400 + 1):
        cast = slot.cast
        card = cast.key if cast else None
        if not stages or slot.stage != stages[-1]:
            stages.append(slot.stage)
        first_trial = slot.stage == 'royal' and card == 'WT17' and not released
        goal, target, jump, interact = hero.x, None, False, False
        if card == 'WT03':
            goal = board['left'] + 8 * board['unit']
        elif card == 'WT09':
            goal = 84
        elif first_trial:
            if cast.freeze < 100:
                goal = 84
                interact = abs(goal - hero.x) <= 9 and cast.t >= cast.ready
            elif cast.run:
                goal = threshold + 74 if lure else threshold - 175
                age = cast.t - cast.run.start
                jump = trial['charge_window_offset'][0] - 23 <= age < trial['charge_window_offset'][1]
        elif slot.stage != 'royal':
            target = slot.queen if slot.stage == 'queen' else slot.king
        elif collision and not released and card == 'WT18' and slot.phase == 'exposure' and not exposure_damage:
            target = slot.king
        elif released and card != 'WT19':
            living = [e for e in (slot.king, slot.queen) if e.hp > 0 and not e.invulnerable]
            if living:
                target = slot.king if slot.reviveLeft > 0 else min(living, key=lambda e: e.hp)
                if target.hp <= 0:
                    target = living[0]

        dx = target.x - hero.x if target else 0
        if target:
            offset = 104 if slot.stage == 'royal' and slot.reviveLeft > 0 else 70
            goal = max(board['left'] + 18, target.x - offset)
            if abs(goal - hero.x) <= 9 and dx * hero.dir < 0:
                goal = hero.x + (24 if dx > 0 else -24)
        attack = bool(target) and target.hp > 0 and not target.invulnerable and abs(dx) < 113 and dx * hero.dir > 0
        if slot.stage == 'royal' and target and slot.reviveLeft > 0:
            attack = attack and hero.x < target.x - 87 and slot.queen.x > hero.x + 146
        controls = trip.lua.table(left=goal < hero.x - 9, right=goal > hero.x + 9,
                                  jump=jump, interact=interact, attack=attack)
        revives = slot.reviveLeft
        hp_before = [slot.king.hp, slot.queen.hp]
        seq_before = state.events[len(state.events)].seq if len(state.events) else 0
        trip.tick(1, controls)
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp > 0

        move = slot.cast
        if collision and not released and card == 'WT18':
            exposure_damage += max(0, hp_before[0]-slot.king.hp)
        if first_trial and cast.run and not cast.run.goal and move and move.key == 'WT17':
            if hero.x >= threshold and '誘導位置に到達' not in frames:
                sample('誘導位置に到達', tick, move)
                assert frames['誘導位置に到達']['view']['gate']['run']['ready']
        watch = card in ('WT03', 'WT19') or first_trial
        fresh = [e for e in state.events.values() if e.seq > seq_before] if watch else []
        if card == 'WT03':
            pawns.extend(e.value for e in fresh if e.kind == 'gate:WT04:pawn')
        if first_trial:
            for event in fresh:
                if event.kind == 'gate:WT20:complete':
                    freezes.append(dict(tick=cast.t, meter=event.value))
                    sample('霜印 50 / 100' if event.value == 50 else '凍結完了', tick, move)
                elif event.kind == 'gate:WT17:lock':
                    assert (event.value >= threshold) == lure
                    locks.append(dict(tick=cast.t, goal=event.value, queen=slot.queen.x))
                    if len(locks) == 1:
                        sample('走路固定', tick, move)
                elif event.kind == 'gate:WT17:collision':
                    assert lure and move.key == 'WT18'
                    collision = dict(tick=cast.t, king=slot.king.x, queen=slot.queen.x)
                    sample('クイーンに突進が命中', tick, move)
                elif event.kind == 'gate:WT17:miss':
                    misses.append(cast.t)
                    if len(misses) == 1:
                        sample('突進がクイーンを外れる', tick, move)
                elif event.kind == 'gate:WT17:hurt' and event.actor == hero.id:
                    if trial['failure_window'][0] <= cast.t < trial['failure_window'][1]:
                        tsunami.append(dict(tick=cast.t, loss=event.value))
                        sample('津波が命中', tick, move)
            if not move:
                assert not lure and cast.t == trial['total']
                released = True
        if collision and not released and move and move.key == 'WT18':
            if not slot.king.invulnerable and not slot.queen.invulnerable:
                exposure += 1
                if exposure == 1:
                    sample('反撃開始', tick, move)
            elif exposure:
                sample('反撃終了', tick, move)
                released = True
        if move and move.key == 'WT19' and move.t == 0 and not transfers:
            sample('HP譲渡を開始', tick, move)
        if slot.reviveLeft < revives:
            event = next(e for e in fresh if e.kind == 'gate:WT19:transfer')
            hp_after = [slot.king.hp, slot.queen.hp]
            assert sum(hp_before) == sum(hp_after)
            receiver = hp_before.index(0)
            donor = 1 - receiver
            assert event.value == hp_after[receiver] == hp_before[donor] - hp_after[donor]
            assert event.value == int(hp_before[donor] * moves['WT19']['donor_fraction'])
            transfers.append(dict(tick=tick, hpBefore=hp_before, hpAfter=hp_after, remaining=slot.reviveLeft))
            sample(f'HP譲渡・{len(transfers)}回目', tick, cast)
    else:
        raise AssertionError(('time budget', slot.stage, slot.cast and slot.cast.key, slot.king.hp, slot.queen.hp))

    assert pawns == [2, 1, 0] and stages == ['king', 'queen', 'finish', 'royal']
    assert [entry['meter'] for entry in freezes] == [50, 100] and locks and transfers and released
    assert freezes[-1]['tick'] <= trial['freeze_completed_by']
    for index, report in enumerate(transfers, 1):
        display = frames[f'HP譲渡・{index}回目']['view']['gate']['transferResult']
        assert display['to'] == 'king' and display['amount'] == report['hpAfter'][0]
    if lure:
        opens, closes = moves['WT18']['exposure']
        assert collision and not tsunami and not misses and exposure == closes - opens
        assert exposure_damage > 0
        assert frames['反撃開始']['view']['gate']['lureCollision']
        assert frames['反撃開始']['view']['gate']['exposure'] == exposure
    else:
        assert not collision and not exposure and misses and tsunami == [
            dict(tick=trial['failure_window'][0], loss=spec['damage']['catastrophe'])]
        assert frames['津波が命中']['view']['gate']['tsunamiDamage'] == tsunami[0]['loss']
    hp_at_clear = [actor.hp for actor in state.actors.values()]
    verify_repeat(trip, before, start, mode, key, prior)
    checkpoint = None
    if next_save:
        assert not loadout['sold']
        saved = restore_rematch_equipment(trip, start, loadout, 'mond-town')
        assert saved['story']['quests']['gate-weekly-commission']['status'] == 'complete'
        assert len([q for q in saved['story']['quests'].values() if q['status']=='complete']) == 118
        before_ids = {entry['item']['id'] for entry in start['inventory']['ground']}
        assert before_ids <= {entry['item']['id'] for entry in saved['inventory']['ground']}
        for boss, record in start['endgame']['weekly'].items():
            if boss != key:
                assert saved['endgame']['weekly'][boss] == record
        data = (json.dumps(saved, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        next_save.write_bytes(data)
        checkpoint = sha256(data).hexdigest()
    case = 'gate-collision' if lure else 'gate-missed'
    label = 'クイーンへの誘導に成功' if lure else 'クイーンへの誘導に失敗'
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, freezes, collision, misses, tsunami, exposure, transfers, flush=True)
    return dict(controller='game_before_gate', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stages=stages, remainingPawns=pawns, freezeCompletions=freezes, locks=locks,
                collision=collision, misses=misses, tsunami=tsunami, exposureTicks=exposure,
                transfers=transfers, exposureDamage=exposure_damage, expertClears=[prior, prior + 1],
                reward=dict(xp=mode.xp, mora=mode.mora), trialLoadout=loadout,
                survivingHp=hp_at_clear, checkpointSha256=checkpoint)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--chain', action='store_true', help='Save each rematch as the source for the next')
    parser.add_argument('--weapon', default='SW06')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    first_save = args.output_dir/'collision-save.json' if args.chain else None
    final_save = args.output_dir/'complete.json' if args.chain else None
    first = replay(args.from_save, args.output_dir, True, weapon=args.weapon, next_save=first_save)
    second = replay(first_save or args.from_save, args.output_dir, False, weapon=args.weapon, next_save=final_save)
    results = [first, second]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf8')
