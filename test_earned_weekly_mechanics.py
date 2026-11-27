"""Replay the weekly fights that ended too quickly to expose their mechanics."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from test_coop_local import expand_rectangles
from test_earned_survey_itineraries import SurveyJourney, nodes, quests


def read(path):
    return json.loads((ROOT / path).read_bytes())


# Let the opening sequence play before dealing damage, including Raiden's armored slash.
openings = {
    'andrius': 'WA05', 'azhdaha': 'WZ08', 'raiden': 'WR15',
    'narwhal': 'WV01', 'primal_fire': 'WG04', 'false_moon': 'WM08',
}
samples = {
    'andrius': {'P1', 'INTERLUDE', 'P2', 'WA04'},
    'azhdaha': {'1', '2', '3', 'WZ09', 'WZ14'},
    'raiden': {'normal', 'armored', 'WR12', 'WR15'},
    'narwhal': {'outer', 'inner', 'weak', 'WV12'},
    'primal_fire': {'1', '2', 'WG08', 'WG09', 'WG17'},
    'false_moon': {'outer', 'inner', 'returning', 'WM13', 'WM15'},
}
expected = {
    'andrius': {'P1', 'INTERLUDE', 'P2'},
    'azhdaha': {'1', '2', '3'},
    'raiden': {'normal', 'armored', 'WR14', 'WR15', 'raiden:WR15:hit'},
    'narwhal': {'outer', 'inner', 'weak', 'narwhal:WV14:return-loss'},
    'primal_fire': {'1', '2', 'primal:WG08:commit', 'primal:WG09:commit'},
    'false_moon': {'outer', 'inner', 'returning', 'false-moon:WM13:confirm', 'false-moon:WM16:loss'},
}
cue_ticks = {
    'WA04': 74, 'WZ09': 90, 'WZ14': 126, 'WR12': 125, 'WR15': 60, 'WV12': 85,
    'WG08': 92, 'WG09': 184, 'WG17': 90, 'WM13': 180, 'WM15': 90,
}


def equipment(trip):
    bag = trip.state.inventory
    items = list(bag['items'].values())
    slots = max(0, len(items) + len(bag.ground) - 80)
    spares = sorted((i for i in items if i.owner == 0 and not i.locked),
                    key=lambda i: (i.rarity, i.itemLv, i.id))
    assert len(spares) >= slots
    for item in spares[:slots]:
        trip.act(f'artifact_sell:{item.id}')
    trip.act('artifact_recover')
    assert not len(bag.ground)
    removed = [i.id for i in items if i.owner and i.slot != 1]
    for item in removed:
        trip.act(f'artifact_remove:{item}')
    trip.act('weapon_equip:traveler:SW06')
    trip.act('hold_ally_fire')
    assert trip.core.equippedWeapon(trip.state, 'traveler') == 'SW06'
    return dict(sold=[i.id for i in spares[:slots]], removed=removed,
                attack=[a.atk for a in trip.state.actors.values()],
                maxHp=[a.maxhp for a in trip.state.actors.values()])


def replay(source, engine, driver, spec, output):
    trip = SurveyJourney(source, engine, select_traveler=True)
    start = trip.snapshot()
    key, node, controller = (spec[k] for k in ('id', 'node', 'controller'))
    hub = next(q['hub'] for q in quests.values() if q.get('target') == spec['storyChallenge'])
    trip.warp(hub)
    loadout = equipment(trip)
    origin, gate = next((n['id'], g) for n in nodes.values() for g in n['exits'] if g['to'] == node)
    trip.travel(origin)
    trip.approach(gate['x'], gate.get('y', 480), node)
    desk = trip.frame().weeklyDesk
    if desk.remaining > 0:
        trip.tick(round(desk.remaining * 60) + 1)
        desk = trip.frame().weeklyDesk
    mode = next(row for row in desk.modes.values() if row.id == 'expert')
    assert mode.available and mode.record.clears > 0
    record_key = key + ':expert'
    prior = mode.record.clears
    trip.act(f'weekly_start:{record_key}')
    state = trip.state
    slot, _ = trip.core.currentWeeklyBoss(state)
    assert slot.mode.id == 'expert' and slot.primary.maxhp == mode.hp and trip.core.canAttack(state)
    before = state.progression.total, state.mora
    seen = set()
    frames = {}
    ready_at = None

    def sample(tick, stage, move, move_tick):
        nonlocal ready_at
        ids = {str(stage), str(move)} - seen
        seen.update(ids)
        if ready_at is None and openings[controller] in seen:
            ready_at = tick
        phases = ids - cue_ticks.keys()
        candidates = phases | ({move} if move in cue_ticks and move_tick == cue_ticks[move] else set())
        for name in sorted((candidates & samples[controller]) - frames.keys()):
            sprite = trip.core.frame(state, 'sprite', 'legacy')
            compressed = trip.core.frame(state, 'rect', 'h32c16')
            state.packRectArt = True
            try:
                packed = trip.core.frame(state, 'rect', 'h32c16')
            finally:
                state.packRectArt = None
            rect = native(compressed.draws)
            batch = dict(draws=native(packed.draws), rectBatches=native(packed.rectBatches))
            assert list(expand_rectangles(batch)) == rect, (controller, name)
            unpacked = dict(draws=rect, rectBatches=[])
            view = native(sprite.weeklyBoss)
            frames[name] = dict(tick=tick, node=state.story.node, camera=sprite.camera,
                                platforms=native(sprite.platforms), stage=str(stage), move=move, moveTick=move_tick,
                                view=view, png=native(sprite.draws), packed=batch,
                                unpackedCount=len(rect),
                                unpackedBytes=len(json.dumps(unpacked, ensure_ascii=False, separators=(',', ':')).encode()),
                                packedBytes=len(json.dumps(batch, ensure_ascii=False, separators=(',', ':')).encode()))

    options = trip.lua.table(sample=sample, canAttack=lambda: ready_at is not None)
    result = native(driver(trip.core, state, slot, 'weekly', 60 * 600, 'mechanics', options))
    assert result['status'] == 'clear', (controller, result)
    assert ready_at and result['ticks'] > ready_at >= 30
    for category in ('phases', 'moves', 'events'):
        result[category] = result[category] or []
    observed = {str(row['id']) for category in ('phases', 'moves', 'events') for row in result[category]}
    assert expected[controller] <= observed, (controller, expected[controller] - observed, result)
    award = trip.frame().weeklyBoss.reward
    assert award and not award.first
    assert (state.progression.total - before[0], state.mora - before[1]) == (mode.xp, mode.mora)
    trip.restore()
    saved = trip.snapshot()
    assert saved['endgame']['weekly'][record_key]['clears'] == prior + 1
    assert saved['story']['quests'] == start['story']['quests']
    assert saved['story']['visited'] == start['story']['visited']
    assert trip.state.returns == 0
    assert frames.keys() == samples[controller], (controller, samples[controller] - frames.keys())
    assert all(row['png'] and row['packed']['draws'] for row in frames.values())
    (output / f'{controller}-frames.json').write_text(
        json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(controller, result['ticks'], 'ticks;', len(frames), 'frames', flush=True)
    return dict(controller=controller, boss=key, sourceSha256=trip.source, loadout=loadout,
                attackFromTick=ready_at, previousExpertClears=prior, restoredExpertClears=prior + 1,
                sampled={name: {'tick': frame['tick'], 'stage': frame['stage'], 'node': frame['node']}
                         for name, frame in frames.items()}, **result)


def main(source, output, only):
    output.mkdir(parents=True, exist_ok=True)
    engine = runtime()
    driver = engine[0].execute((ROOT / 'tools/earned_boss_driver.lua').read_text(encoding='utf-8'))
    ids = {row['boss'] for row in read('evidence/standard-adventure-campaign-20261127.json')['firstClearsWithinOneSecond']}
    roster = [b for b in read('content/weekly-boss-spawns.json')['weeklyBosses'] if b['id'] in ids]
    assert {b['controller'] for b in roster} == openings.keys()
    results = [replay(source.resolve(), engine, driver, spec, output)
               for spec in roster if not only or spec['controller'] in only]
    (output / 'weekly-mechanics.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--only', nargs='+', choices=openings)
    args = parser.parse_args()
    main(args.from_save, args.output_dir, args.only)
