"""Replay ward protection and the three first-rift choices on earned expert saves."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import (capture_scene, expert_rematch, read,
                                         restore_rematch_equipment, verify_repeat)


def replay(source, output, take_cover, shadow_goal, *, weapon='SW06', next_save=None):
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if b['controller'] == 'false_moon')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(
        source.resolve(), runtime(), spec, weapon=weapon, trial_flower=next_save is not None,
        keep_pending_loot=next_save is not None)
    state, hero = trip.state, trip.actor
    before = state.progression.total, state.mora
    rift = spec['rift']
    moves = spec['moves']
    shock_at = moves['WM08']['windows'][1][0]
    settlement_at = moves['WM16']['settlement_tick']
    frames, scenes, pulse_hits = {}, [], []
    ward, settlement, declined = None, None, None
    exposure, exposure_damage, cycle, released = 0, 0, 0, False
    initial_hp = slot.primary.hp
    last_scene = state.story.node

    def sample(label, tick, cast):
        frames[label] = capture_scene(trip, tick, slot.stage, cast.key, cast.t)

    for tick in range(1, 60 * 360 + 1):
        cast = slot.cast
        card = cast.key if cast else None
        goal, target = hero.x, None
        if card == 'WM08' and not ward:
            goal = 160 if take_cover else 330
        elif card == 'WM13' and not released:
            goal = rift['x']
            if (shadow_goal is not None and not cast.confirm and cast.t >= rift['enterTick']
                    and abs(goal - hero.x) < rift['radius'] - 10):
                trip.act('encounter_interact')
                sample('裂け目・入場確認', tick - 1, cast)
        elif card == 'WM15' and slot.innerCount < shadow_goal:
            target = next(e for e in slot.shadows.values() if e.hp > 0)
        elif card == 'WM15':
            goal = rift['exitX']
            if abs(goal - hero.x) < rift['radius'] - 10:
                trip.act('encounter_interact')
                sample('右端の出口から帰還', tick - 1, cast)
        elif card == 'WM16' and exposure and not released and not exposure_damage and not slot.primary.invulnerable:
            target = slot.primary
        elif released and card not in ('WM09', 'WM10') and not slot.primary.invulnerable:
            target = slot.primary
        dx = target.x - hero.x if target else 0
        if target:
            goal = target.x - 70 if target.x > 150 else target.x + 70
            if abs(goal - hero.x) <= 9 and dx * hero.dir < 0:
                goal = hero.x + (24 if dx > 0 else -24)
        controls = trip.lua.table(left=goal < hero.x - 9, right=goal > hero.x + 9,
                                  attack=bool(target) and abs(dx) < 115 and dx * hero.dir > 0)
        hp_before = hero.hp
        boss_before = slot.primary.hp
        seq_before = state.events[len(state.events)].seq if len(state.events) else 0
        trip.tick(1, controls)
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp > 0

        move = slot.cast
        if move and move.key == 'WM08' and move.t == shock_at - 60 and not ward:
            sample('柱と衝撃の予告', tick, move)
        if move and move.key == 'WM08' and move.t == shock_at and not ward:
            event = 'false-moon:WM08:ward' if take_cover else 'false-moon:WM08:hit'
            current = next(e for e in state.events.values()
                           if e.seq > seq_before and e.actor == hero.id and e.kind == event)
            assert hp_before - hero.hp == (0 if take_cover else current.value)
            ward = dict(tick=tick, moveTick=move.t, x=hero.x, hpLoss=hp_before - hero.hp, event=event)
            sample('青い枠で衝撃を防ぐ' if take_cover else '保護の外で衝撃が命中', tick, move)
        if move and move.key == 'WM13' and not released:
            if move.t == rift['enterTick']:
                sample('中央に裂け目が開く', tick, move)
            if hero.hp < hp_before:
                assert any(e.seq > seq_before and e.actor == hero.id and e.kind == 'false-moon:WM13:hit'
                           for e in state.events.values())
                pulse_hits.append(dict(moveTick=move.t, loss=hp_before - hero.hp))
            if shadow_goal is None and move.t == moves['WM13']['total'] - moves['WM13']['confirmation_ticks']:
                sample('裂け目・受付終了', tick, move)
        if shadow_goal is None and not released and card == 'WM13' and not move:
            declined = dict(tick=tick, bossHp=slot.primary.hp, scene=state.story.node)
            assert slot.primary.hp == initial_hp and slot.epoch == 0
            released = True
        if state.story.node != last_scene:
            scenes.append(dict(tick=tick, node=state.story.node, epoch=slot.epoch))
            sample('異界へ移動' if state.story.node == spec['innerNode'] else '外界へ帰還', tick, move)
            last_scene = state.story.node
        if move and move.key == 'WM15' and move.t == 1:
            sample('異界の三擬影', tick, move)
        if move and move.key == 'WM16':
            if not released and exposure:
                exposure_damage += max(0, boss_before-slot.primary.hp)
            if move.t == settlement_at:
                losses = [e.value for e in state.events.values() if e.kind == 'false-moon:WM16:loss']
                expected = shadow_goal * int(slot.primary.maxhp * moves['WM15']['per_kill_main_maxhp_fraction'])
                assert losses == [expected] and boss_before - slot.primary.hp == expected
                settlement = dict(tick=tick, defeated=slot.innerCount, bossHpBefore=boss_before,
                                  bossHpAfter=slot.primary.hp, loss=expected)
                cycle = slot.cycle
            if not released and not slot.primary.invulnerable:
                exposure += 1
                if exposure == 1:
                    sample('帰還後の反撃・開始', tick, move)
            elif exposure and not released:
                sample('帰還後の反撃・終了', tick, move)
                released = True
    else:
        raise AssertionError(('time budget', slot.stage, slot.primary.hp, slot.innerCount, slot.cast and slot.cast.key))

    assert released and ward
    ward_label = '青い枠で衝撃を防ぐ' if take_cover else '保護の外で衝撃が命中'
    assert frames[ward_label]['view']['falseMoon']['wardResult'] == {
        'protected': take_cover, 'damage': ward['hpLoss'],
    }
    if shadow_goal is None:
        assert declined and not scenes and not settlement and not exposure
        assert slot.epoch == 0 and pulse_hits
        assert frames['裂け目・受付終了']['view']['falseMoon']['riftRemaining'] == 0
        case, label = 'false-moon-missed', '裂け目を見送る'
    else:
        assert [s['node'] for s in scenes] == [spec['innerNode'], spec['node']]
        assert settlement and settlement['defeated'] == shadow_goal and cycle == slot.cycle == 1
        opens, closes = moves['WM16']['exposure']
        assert exposure == closes - opens and exposure_damage > 0
        returned = frames['帰還後の反撃・開始']['view']['falseMoon']
        assert returned['exposure'] == exposure and returned['returnLoss'] == settlement['loss']
        assert frames['帰還後の反撃・終了']['view']['falseMoon']['exposureEnded']
        case = 'false-moon-full' if shadow_goal == 3 else 'false-moon-early'
        label = '擬影を3体倒して帰還' if shadow_goal == 3 else '擬影を1体倒して早期帰還'
    hp_at_clear = [actor.hp for actor in state.actors.values()]
    verify_repeat(trip, before, start, mode, key, prior)
    checkpoint = None
    if next_save:
        assert not loadout['sold']
        saved = restore_rematch_equipment(trip, start, loadout, 'nod-town')
        assert saved['story']['quests']['false-moon-weekly-commission']['status'] == 'complete'
        assert len([q for q in saved['story']['quests'].values() if q['status']=='complete']) == 119
        for boss, record in start['endgame']['weekly'].items():
            if boss != key:
                assert saved['endgame']['weekly'][boss] == record
        before_ids = {entry['item']['id'] for entry in start['inventory']['ground']}
        assert before_ids <= {entry['item']['id'] for entry in saved['inventory']['ground']}
        data = (json.dumps(saved, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        next_save.write_bytes(data)
        checkpoint = sha256(data).hexdigest()
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, ward, settlement, declined, 'exposure', exposure, flush=True)
    return dict(controller='false_moon', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                ward=ward, scenes=scenes, pulses=pulse_hits, settlement=settlement, missedRift=declined,
                exposureTicks=exposure, exposureDamage=exposure_damage, expertClears=[prior, prior + 1],
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
    results = []
    source = args.from_save
    for covered, count, name in ((True, 3, 'full-save.json'), (False, 1, 'early-save.json'),
                                  (False, None, 'complete.json')):
        checkpoint = args.output_dir/name if args.chain else None
        results.append(replay(source, args.output_dir, covered, count, weapon=args.weapon, next_save=checkpoint))
        source = checkpoint or source
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf8')
