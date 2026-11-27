"""Compare breaking the anchors and chant, partial success, and leaving the first trial alone."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


def replay(source, output, break_anchor, interrupt):
    spec = next(b for b in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if b['controller'] == 'heretic')
    trip, slot, start, _, mode, key, prior = expert_rematch(source.resolve(), runtime(), spec)
    state, hero = trip.state, trip.actor
    before = state.progression.total, state.mora
    moves = spec['moves']
    trial = moves['WH13']
    frames, pushes, anchors, chant, failure_hits, phases = {}, [], [], [], [], []
    opened, stopped, expired = None, None, None
    exposure = 0
    released = False

    def sample(label, tick, cast):
        frames[label] = capture_scene(trip, tick, slot.stage, cast.key, cast.t)

    for tick in range(1, 60 * 360 + 1):
        cast = slot.cast
        card = cast.key if cast else None
        if not phases or phases[-1] != slot.stage:
            phases.append(slot.stage)
        first_trial = slot.trialId == 1 and card == 'WH13'
        goal, target = hero.x, None
        if card == 'WH13':
            if released or break_anchor and '最初の押し壁' in frames:
                if cast.brokenAt and (released or interrupt):
                    target = slot.primary
                elif not cast.brokenAt and len(slot.anchors):
                    target = slot.anchors[len(slot.anchors)]
            else:
                goal = 475
        elif slot.form == 1 or released:
            if not slot.primary.invulnerable and slot.primary.y > 399:
                target = slot.primary
        elif card in ('WH10', 'WH11'):
            goal = 475

        dx = target.x - hero.x if target else 0
        if target:
            offset = 74 if target.x >= 140 else -74
            goal = max(65, min(895, target.x - offset))
            if abs(goal - hero.x) <= 9 and dx * hero.dir < 0:
                goal = hero.x + (23 if dx > 0 else -23)
        controls = trip.lua.table(left=goal < hero.x - 9, right=goal > hero.x + 9,
                                  attack=bool(target) and abs(dx) < 117 and dx * hero.dir > 0 and hero.y > 399)
        hp_before = hero.hp
        seq_before = state.events[len(state.events)].seq if len(state.events) else 0
        trip.tick(1, controls)
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp > 0

        move = slot.cast
        if first_trial:
            assert slot.primary.hp == spec['p2Hp']
            if cast.t == trial['spawn_tick']:
                assert len(slot.anchors) == trial['anchor_count']
                sample('左右の結合点', tick, move)
            if cast.child and cast.child.key == 'WH14' and cast.child.wall:
                if '最初の押し壁' not in frames:
                    sample('最初の押し壁', tick, move)
                if cast.child.gap.upper and '穴が上段に移った押し壁' not in frames:
                    sample('穴が上段に移った押し壁', tick, move)
            for event in state.events.values():
                if event.seq <= seq_before:
                    continue
                if event.kind == 'heretic:WH14:push' and event.actor == hero.id:
                    assert hero.hp == hp_before
                    pushes.append(dict(tick=cast.t, distance=event.value))
                    if len(pushes) == 1:
                        sample('押し壁で旅人が後退', tick, move)
                elif event.kind == 'heretic:WH13:anchor':
                    anchors.append(event.value)
                elif event.kind == 'heretic:WH13:open':
                    assert not len(slot.anchors) and not cast.child
                    opened = dict(tick=cast.t, remaining=trial['total'] - cast.t, chant=cast.chant)
                    sample('結合点が壊れ、押し壁が消える', tick, move)
                elif event.kind == 'heretic:WH13:chant':
                    chant.append(event.value)
            if move.key == 'WH19':
                assert interrupt and cast.chant == 0 and not cast.child and not len(slot.anchors)
                stopped = dict(tick=cast.t, hp=slot.primary.hp)
                sample('詠唱中断', tick, move)
            elif move.key == 'WH18':
                assert not interrupt and cast.t == trial['total'] and not len(slot.anchors) and not cast.child
                assert not slot.primary.invulnerable
                expired = dict(tick=cast.t, hp=slot.primary.hp, chant=cast.chant)
                sample('詠唱の期限切れ', tick, move)
        if stopped and not released and move and move.key == 'WH19':
            if not slot.primary.invulnerable:
                exposure += 1
                if exposure == 1:
                    sample('反撃開始', tick, move)
            elif exposure:
                sample('反撃終了', tick, move)
                released = True
        if expired and not released and card == 'WH18':
            if hero.hp < hp_before:
                assert any(e.seq > seq_before and e.kind == 'heretic:WH18:hit' and e.actor == hero.id
                           for e in state.events.values())
                failure_hits.append(dict(tick=cast.t, loss=hp_before - hero.hp))
                sample('腐敗の衝撃が命中', tick, move)
            released = move is None
    else:
        raise AssertionError(('time budget', slot.stage, slot.cast and slot.cast.key, slot.primary.hp, slot.trialId))

    assert released and '最初の押し壁' in frames and phases[:4] == ['p1', 'changing', 'p2', 'trial']
    if break_anchor:
        assert anchors == list(range(trial['anchor_count_hp'] - 1, -1, -1)) and opened
        assert opened['chant'] == trial['chant_count'] and opened['remaining'] > 0
    else:
        assert not opened and not anchors and pushes, pushes
    if interrupt:
        opens, closes = moves['WH19']['exposure']
        assert stopped and not expired and not failure_hits and exposure == closes - opens
        assert chant == list(range(trial['chant_count'] - 1, -1, -1))
        counter = frames['反撃開始']['view']['heretic']
        assert counter['trialResult'] == {'anchorsBroken': True, 'remainingChant': 0}
        assert counter['exposure'] == exposure
        case, label = 'heretic-stopped', '結合点を壊して詠唱を中断'
    else:
        assert not stopped and not exposure and not chant and expired['chant'] == trial['chant_count']
        assert failure_hits == [dict(tick=moves['WH18']['windows'][0][0], loss=spec['damage']['failure'])]
        result = frames['腐敗の衝撃が命中']['view']['heretic']
        assert result['trialResult'] == {'anchorsBroken': break_anchor, 'remainingChant': trial['chant_count']}
        assert result['failureDamage'] == spec['damage']['failure']
        case = 'heretic-open-expired' if break_anchor else 'heretic-closed-expired'
        label = '結合点を壊して時間切れ' if break_anchor else '結合点を残して時間切れ'
    verify_repeat(trip, before, start, mode, key, prior)
    (output / f'{case}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, opened, stopped, expired, 'pushes', pushes, 'shock', failure_hits, 'exposure', exposure, flush=True)
    return dict(controller='heretic', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                phases=phases, anchorHits=anchors, opened=opened, chantHits=chant, stopped=stopped,
                expired=expired, pushes=pushes, shockHits=failure_hits, exposureTicks=exposure,
                expertClears=[prior, prior + 1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = [replay(args.from_save, args.output_dir, opened, interrupted)
               for opened, interrupted in ((True, True), (True, False), (False, False))]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf8')
