"""Compare the first barrier and all three floor cuts on earned expert rematches."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import (capture_scene, expert_rematch, read,
                                         restore_rematch_equipment, verify_repeat)


def replay(source, output, break_barrier, *, weapon='SW06', next_save=None):
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if b['controller'] == 'primal_fire')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(
        source.resolve(), runtime(), spec, weapon=weapon, trial_flower=next_save is not None)
    state, hero = trip.state, trip.actor
    before = state.progression.total, state.mora
    arena, gate = spec['arena'], spec['gate']
    first_trial = spec['moves']['WG05']
    expiry = first_trial['accept'][1]
    frames, cuts, hits, contacts, orb_hits = {}, [], [], [], []
    broken_pillars = set()
    result = None
    held = False
    exposure = exposure_damage = 0
    first_hp = slot.primary.hp

    def sample(label, tick, move):
        frames[label] = capture_scene(trip, tick, slot.form, move.key, move.t)

    for tick in range(1, 60 * 420 + 1):
        cast = slot.cast
        card = cast.key if cast else None
        first_gate = card == 'WG05' and not result
        objects = [o for o in slot.objects.values() if o.hp > 0]
        target = objects[0] if objects else slot.primary
        goal = max(slot.left + 30, target.x - 70)
        dx = target.x - hero.x
        if abs(goal - hero.x) <= 9 and dx * hero.dir < 0:
            goal = hero.x + (24 if dx > 0 else -24)
        if card == 'WG09' and cast.t < arena['cutTick']:
            goal = max(goal, slot.left + arena['cutStep'] + 51)
        thresholds = arena['cutThresholds']
        limit = thresholds[slot.cuts] - .025 if slot.cuts < len(thresholds) else 0
        damage_boss = held and not target.invulnerable and target.hp > target.maxhp * limit
        attack = (break_barrier and bool(objects)) if first_gate else (
            held and (bool(objects) or damage_boss))
        if not held and exposure and not exposure_damage and not slot.primary.invulnerable:
            attack = True
        controls = trip.lua.table(left=goal < hero.x - 9, right=goal > hero.x + 9,
                                  attack=attack and abs(dx) < 115 and dx * hero.dir > 0)
        traveler_hp, boss_hp, seq = hero.hp, slot.primary.hp, state.seq
        units = objects[0].hp if first_gate and objects else 0
        trip.tick(1, controls)
        if slot.waitUntil:
            break
        assert hero.hp > 0 and state.returns == 0

        move = slot.cast
        for event in state.events.values():
            if event.seq <= seq:
                continue
            if event.kind == 'primal:WG14:broken':
                broken_pillars.add(event.value)
            elif (not break_barrier and result and event.kind == 'primal:WG05:hit'
                  and event.actor == hero.id and event.value == spec['damage']['orb']):
                orb_hits.append({'moveTick': move.t, 'loss': event.value})
                sample('障壁・時間切れの大玉', tick, move)
        if not held and exposure and card == 'WG17':
            exposure_damage += max(0, boss_hp-slot.primary.hp)
        if move and move.key == 'WG14' and move.t == gate['opens'] and '左・中央・右の三柱' not in frames:
            sample('左・中央・右の三柱', tick, move)
        if move and move.key == 'WG09' and move.t == arena['cutTick']-60:
            sample(f'白線の予告 {slot.cuts+1}回目', tick, move)
        if first_gate:
            assert slot.primary.hp == first_hp
            gate_tick = cast.t if move.key == 'WG05' else cast.t + 1
            if gate_tick == gate['opens']:
                sample('障壁・受付開始', tick, move)
            if units and objects[0].hp < units:
                contacts.append({'moveTick': gate_tick, 'units': objects[0].hp})
            if hero.hp < traveler_hp and any(lo <= gate_tick < hi for lo, hi in first_trial['windows']):
                assert any(e.kind == 'primal:WG05:hit' and e.actor == hero.id and e.value == traveler_hp - hero.hp
                           for e in state.events.values())
                hits.append({'moveTick': gate_tick, 'loss': traveler_hp - hero.hp})
                if '障壁・地を這う衝撃波' not in frames:
                    sample('障壁・地を這う衝撃波', tick, move)
            if cast.success or gate_tick == expiry:
                event = 'primal:WG05:broken' if break_barrier else 'primal:WG05:failed'
                assert any(e.kind == event for e in state.events.values())
                assert bool(cast.success) == break_barrier
                result = dict(tick=tick, moveTick=gate_tick, event=event, contacts=contacts,
                              hits=hits, bossHp=first_hp)
                sample('障壁破壊' if break_barrier else '障壁・時間切れ', tick, move)
        if result and not held:
            if break_barrier and move and move.key == 'WG17':
                if not slot.primary.invulnerable:
                    exposure += 1
                    if exposure == 1:
                        sample('最初の反撃・開始', tick, move)
                elif exposure:
                    sample('最初の反撃・終了', tick, move)
                    held = True
            elif not break_barrier:
                assert not move or move.key == 'WG05'
                held = move is None
        if slot.cuts > len(cuts):
            floor = state.platforms[1]
            left = arena['left'] + slot.cuts * arena['cutStep']
            assert move.key == 'WG09' and move.t == arena['cutTick'] and slot.form == 2
            assert (slot.left, floor.x, floor.w) == (left, left, arena['right'] - left)
            cuts.append(dict(tick=tick, hp=slot.primary.hp, left=left, width=floor.w))
            sample(f'足場切断 {slot.cuts}回目', tick, move)
    else:
        raise AssertionError(('time budget', slot.cast and slot.cast.key, slot.primary.hp, slot.cuts, hero.hp))

    assert held and result and len(cuts) == len(arena['cutThresholds'])
    assert len(broken_pillars) == spec['moves']['WG14']['targets'], broken_pillars
    outcome = frames['障壁破壊' if break_barrier else '障壁・時間切れ']['view']['primal']
    assert outcome['trial'] == {'card': 'WG05', 'outcome': 'broken' if break_barrier else 'expired'}
    assert outcome['cuts'] == 0 and not outcome.get('exposure')
    if break_barrier:
        opening, closing = spec['moves']['WG17']['exposure']
        assert outcome['exposureOpensIn'] == opening
        assert exposure == closing - opening and exposure_damage > 0
        assert frames['最初の反撃・開始']['view']['primal']['exposure'] == exposure
        assert [row['units'] for row in contacts] == list(range(first_trial['units'] - 1, -1, -1))
        assert len(hits) < len(first_trial['windows']), hits
    else:
        assert not contacts and exposure == 0 and result['moveTick'] == expiry
        assert len(hits) == len(first_trial['windows']), hits
    hp_at_clear = [actor.hp for actor in state.actors.values()]
    verify_repeat(trip, before, start, mode, key, prior)
    checkpoint = None
    if next_save:
        assert not loadout['sold']
        saved = restore_rematch_equipment(trip, start, loadout, 'natlan-hub')
        assert saved['story']['quests']['primal-fire-weekly-commission']['status'] == 'complete'
        assert len([q for q in saved['story']['quests'].values() if q['status']=='complete']) == 117
        for boss, record in start['endgame']['weekly'].items():
            if boss != key:
                assert saved['endgame']['weekly'][boss] == record
        data = (json.dumps(saved, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        next_save.write_bytes(data)
        checkpoint = sha256(data).hexdigest()
    case = 'primal-barrier-broken' if break_barrier else 'primal-barrier-expired'
    label = '蝕まれし源焔の主・障壁破壊' if break_barrier else '蝕まれし源焔の主・時間切れ'
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, 'ticks', tick, 'hits', hits, 'exposure', exposure, 'cuts', cuts, flush=True)
    return dict(controller='primal_fire', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                barrier=result, orbHits=orb_hits, exposureTicks=exposure, exposureDamage=exposure_damage,
                floors=cuts, brokenPillars=sorted(broken_pillars), expertClears=[prior, prior + 1],
                reward=dict(xp=mode.xp,mora=mode.mora), trialLoadout=loadout,
                survivingHp=hp_at_clear, checkpointSha256=checkpoint)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--chain', action='store_true', help='Save each rematch as the source for the next')
    parser.add_argument('--weapon', default='SW06')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    first_save = args.output_dir/'broken-save.json' if args.chain else None
    final_save = args.output_dir/'complete.json' if args.chain else None
    first = replay(args.from_save, args.output_dir, True, weapon=args.weapon, next_save=first_save)
    second = replay(first_save or args.from_save, args.output_dir, False, weapon=args.weapon, next_save=final_save)
    results = [first, second]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf8')
