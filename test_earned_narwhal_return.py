"""Compare interrupting and missing the kernel on an earned expert save."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import (capture_scene, expert_rematch, read,
                                         restore_rematch_equipment, verify_repeat)


def replay(source, output, interrupt, *, weapon='SW06', next_save=None):
    engine = runtime()
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses'] if b['controller'] == 'narwhal')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(
        source.resolve(), engine, spec, weapon=weapon, trial_flower=next_save is not None)
    state, hero = trip.state, trip.actor
    before = state.progression.total, state.mora
    frames, stages, crossings = {}, [], []
    kernel, returned, exposure, opening_damage = None, None, 0, 0
    trans, rules = spec['transition'], spec['kernel']
    shadow_max = None
    last_scene, last_stage = state.story.node, None
    released = False

    def capture(label, tick, move, phase_tick):
        if label not in frames:
            frames[label] = capture_scene(trip, tick, slot.stage, move, phase_tick)

    for tick in range(1, 60 * 300 + 1):
        stage, cast = slot.stage, slot.cast
        if stage != last_stage:
            stages.append({'stage': stage, 'tick': tick - 1, 'whaleHp': slot.primary.hp})
            if returned and stage == 'outer':
                released = True
            last_stage = stage

        target, attack = slot.primary, False
        if stage == 'outer':
            if slot.special and cast and cast.id == 'WV05' and not slot.special.invulnerable:
                target = slot.special
                attack = True
            elif not slot.primary.invulnerable:
                attack = released or slot.h < 95 and slot.primary.hp > slot.primary.maxhp * .75
        elif stage == 'inner':
            if shadow_max is None:
                shadow_max = slot.shadow.maxhp
            target = slot.shadow
            if cast and cast.id == 'WV11' and slot.special:
                target = slot.special
                attack = interrupt
            elif kernel and not target.invulnerable and (interrupt or '獣の襲来後の隙' in frames):
                attack = True
        elif stage == 'weak' and not slot.primary.invulnerable:
            attack = opening_damage == 0

        dx = target.x - hero.x
        delta = dx + (64 if dx < 0 else -64)
        steer = delta if abs(delta) > 8 else dx if attack and dx * hero.dir < 0 else 0
        controls = trip.lua.table(left=steer < 0, right=steer > 0, attack=attack and abs(dx) < 118 and dx * hero.dir >= 0)
        whale_hp = slot.primary.hp
        player_hp = hero.hp
        trip.tick(1, controls)
        if slot.waitUntil:
            break
        assert state.returns == 0 and hero.hp > 0

        stage, cast = slot.stage, slot.cast
        if state.story.node != last_scene:
            assert hero.hp == player_hp
            crossings.append({'scene': state.story.node, 'tick': tick, 'epoch': slot.epoch})
            capture('腹中へ移動' if stage == 'swallow' else '星海へ帰還', tick,
                    'WV07' if stage == 'swallow' else 'WV14', slot.stageTick)
            last_scene = state.story.node
        if stage in ('outer', 'swallow') and slot.special and cast and cast.id == 'WV05':
            capture('渦の眼・受付中', tick, 'WV05', cast.t)
        if stage == 'inner' and cast and cast.id == 'WV11':
            if cast.t == rules['open']:
                capture('幻形の核・受付開始', tick, 'WV11', cast.t)
            if not kernel and (cast.successUntil or cast.t == rules['close']):
                loss = shadow_max - slot.shadow.hp
                assert slot.primary.hp == whale_hp
                assert loss == (round(shadow_max * rules['lossRatio']) if interrupt else 0)
                kind = 'narwhal:WV13:kernel-loss' if interrupt else 'narwhal:WV11:failed'
                hits = [e.value for e in state.events.values() if e.kind == 'narwhal:WV11:kernel-hit']
                assert hits == (list(range(1, rules['casts'] + 1)) if interrupt else [])
                assert any(e.kind == kind for e in state.events.values())
                kernel = {'tick': tick, 'moveTick': cast.t, 'event': kind, 'hitCounts': hits,
                          'phantomHpBefore': shadow_max, 'phantomHpAfter': slot.shadow.hp}
                capture('幻形の核・判定結果', tick, 'WV11', cast.t)
        if stage == 'inner' and cast and cast.id == 'WV12' and cast.t == 86:
            capture('受付終了後・獣の襲来', tick, 'WV12', cast.t)
        if stage == 'inner' and cast and cast.id == 'WV12' and cast.t == spec['moves']['WV12']['recovery']:
            capture('獣の襲来後の隙', tick, 'WV12', cast.t)
        if stage == 'expel' and slot.stageTick == trans['lossTick'] and not returned:
            loss = whale_hp - slot.primary.hp
            assert loss == round(slot.primary.maxhp * trans['lossRatio'])
            assert (state.progression.total, state.mora) == before
            assert len([e for e in state.events.values() if e.kind == 'narwhal:WV14:return-loss']) == 1
            returned = {'tick': tick, 'whaleHpBefore': whale_hp, 'whaleHpAfter': slot.primary.hp, 'loss': loss}
            capture('帰還時の鯨へのダメージ', tick, 'WV14', slot.stageTick)
        if not released and stage == 'weak' and not slot.primary.invulnerable:
            exposure += 1
            capture('反撃開始', tick, 'WV15', slot.stageTick)
            opening_damage += max(0, whale_hp - slot.primary.hp)
    else:
        raise AssertionError(('time budget', slot.stage, slot.primary.hp))

    assert kernel and returned and exposure == trans['weakClose'] - trans['weakOpen']
    assert opening_damage > 0, (stages, returned, exposure)
    assert [row['scene'] for row in crossings] == [spec['innerNode'], spec['node']], (crossings, stages)
    assert slot.entries == 1 and (('受付終了後・獣の襲来' in frames) != interrupt)
    kernel_view = frames['幻形の核・判定結果']['view']['narwhal']
    if interrupt:
        stagger = kernel_view['kernelStagger']
        assert stagger['loss'] == shadow_max - kernel['phantomHpAfter']
        assert rules['stagger'] - 1 <= stagger['ticks'] <= rules['stagger']
    else:
        assert kernel_view['incoming'] == spec['variants'][0]
    assert not frames['星海へ帰還']['view']['narwhal'].get('returnLoss')
    assert frames['帰還時の鯨へのダメージ']['view']['narwhal']['returnLoss'] == returned['loss']
    assert frames['反撃開始']['view']['narwhal']['exposure'] == exposure
    surviving_hp = [a.hp for a in state.actors.values()]
    verify_repeat(trip, before, start, mode, key, prior)
    checkpoint = None
    if next_save:
        assert not loadout['sold']
        assert surviving_hp[0] > 0
        saved = restore_rematch_equipment(trip, start, loadout, 'fontaine-hub')
        assert saved['story']['quests']['narwhal-weekly-commission']['status'] == 'complete'
        assert len([q for q in saved['story']['quests'].values() if q['status'] == 'complete']) == 116
        for boss, record in start['endgame']['weekly'].items():
            if boss != key:
                assert saved['endgame']['weekly'][boss] == record
        data = json.dumps(saved, ensure_ascii=False, separators=(',', ':')) + '\n'
        next_save.write_bytes(data.encode('utf-8'))
        checkpoint = sha256(data.encode('utf-8')).hexdigest()
    case = 'narwhal-interrupted' if interrupt else 'narwhal-missed'
    label = '呑星の鯨・核の中断に成功' if interrupt else '呑星の鯨・核の受付終了'
    (output / f'{case}-frames.json').write_text(json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(case, tick, kernel, returned, 'exposure', exposure, flush=True)
    return dict(controller='narwhal', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stages=stages, crossings=crossings, kernel=kernel, returned=returned,
                exposureTicks=exposure, openingDamage=opening_damage, expertClears=[prior, prior + 1],
                reward=dict(xp=mode.xp, mora=mode.mora), trialLoadout=loadout,
                survivingHp=surviving_hp, checkpointSha256=checkpoint)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--chain', action='store_true', help='Save each rematch as the source for the next')
    parser.add_argument('--weapon', default='SW06')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    first_save = args.output_dir / 'interrupt-save.json' if args.chain else None
    final_save = args.output_dir / 'complete.json' if args.chain else None
    first = replay(args.from_save, args.output_dir, True, weapon=args.weapon, next_save=first_save)
    second = replay(first_save or args.from_save, args.output_dir, False, weapon=args.weapon, next_save=final_save)
    results = [first, second]
    (args.output_dir / 'weekly-mechanics.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
