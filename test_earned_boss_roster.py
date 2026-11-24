"""Drive authored weekly and Stygian gates with actual earned equipment."""

from argparse import ArgumentParser
from hashlib import sha256
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


SAVES = {
    160: 'work/snez-fresh-route-draft/white-pass-save.json',
    165: 'work/cap-fresh-route-draft/lv165-save.json',
    180: 'work/cap-fresh-route-draft/lv180-save.json',
    200: 'work/cap-fresh-route-draft/lv200-save.json',
}
REQUIRED_EVENTS = {
    'game_before_gate': {'gate:WT04:pawn', 'gate:WT09:pair'},
    'narwhal': {'narwhal:WV14:return-loss'},
    'primal_fire': {'primal:WG08:commit', 'primal:WG09:commit'},
    'false_moon': {'false-moon:WM13:confirm', 'false-moon:WM16:loss'},
    'rerir': {'stygian:rerir:fog-done', 'stygian:rerir:act-two'},
}


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def run(levels, only, seconds, write, expect_clear, route):
    lua, core = runtime(draft_balance=True)
    fight = lua.execute((ROOT / 'tools/earned_boss_driver.lua').read_text(encoding='utf8'))
    exits = {node['id']: node['exits'] for node in read('content/story-graph.json')['nodes']}
    edges = {(origin, gate['to']): gate for origin, entries in exits.items() for gate in entries}
    origins = {}
    for origin, destination in edges:
        origins.setdefault(destination, origin)
    weekly = [spec for spec in read('content/weekly-boss-spawns.json')['weeklyBosses']
              if not spec.get('original')]
    stygian = read('content/stygian-matches.json')['matches']
    rows = []
    sources = {}

    def frame(state):
        return core.frame(state, 'sprite', 'legacy')

    def restore(save):
        state = core.restore(lua.table_from(save, recursive=True), 12)
        if state.active != 1:
            core.action(state, 'swap')
        if state.auto:
            core.action(state, 'auto')
        assert state.active == 1 and not state.auto
        return state

    def approach(save, origin, node):
        state = restore(save)
        core.enterStoryNode(state, origin)
        walk = TrailWalk(lua, core, state, edges, exits)
        gate = edges[origin, node]
        walk.approach(gate['x'], gate.get('y', 480), node)
        assert frame(state).storyNearbyPortal.to == node
        return state, walk

    def capture(state, kind, encounter, deck, name, prior):
        mode = deck.id
        equipped = [a.atk for a in state.actors.values()]
        before = state.progression.total, state.mora
        result = native(fight(core, state, encounter, kind, seconds * 60, route))
        for key in ('phases', 'moves', 'events'):
            result[key] = result[key] or []
        delta = (state.progression.total - before[0], state.mora - before[1])
        if result['status'] == 'clear':
            view = frame(state)
            award = view.weeklyBoss.reward if kind == 'weekly' else view.endgameRun.matchReward
            assert award is not None, (name, mode, result)
            assert delta == (award.xp, award.mora)
            assert (award.xp, award.mora) == (
                deck.xp + (0 if prior else deck.firstXp), deck.mora + (0 if prior else deck.firstMora))
            assert bool(award.first) == (prior == 0)
            save = validate_save(native(core.checkpoint(state)))
            key = f'{encounter.primary.weeklyBoss if kind == "weekly" else name}:{mode}'
            assert save['endgame'][kind][key]['clears'] == prior + 1
            result['award'] = native(award)
        else:
            assert delta == (0, 0), (name, mode, delta, result)
        row = dict(level=level, name=name, type=kind, mode=mode, equippedAtk=equipped, **result)
        rows.append(row)
        print(level, kind, name, mode, result['status'], round(result['elapsed'], 1),
              result['hpRemaining'], [x['id'] for x in result['phases']], flush=True)

    for level in levels:
        raw = (ROOT / SAVES[level]).read_bytes()
        save = validate_save(json.loads(raw))
        assert save['progression']['level'] == level
        sources[str(level)] = dict(sha256=sha256(raw).hexdigest(), companion=save['companion'],
                                   travelerWeapon=save['weapons']['equipped']['traveler'])
        for spec in weekly:
            name, node = spec['controller'], spec['node']
            if only and name not in only:
                continue
            state, _ = approach(save, origins[node], node)
            mode = frame(state).weeklyDesk.modes[3 if level < 180 else 4]
            assert mode.available, (name, level, state.storyNotice)
            prior = mode.record.clears if mode.record else 0
            core.action(state, f'weekly_start:{spec["id"]}:{mode.id}')
            assert state.story.node == node
            slot = state.weeklySlots[spec['id']]
            assert slot.primary.maxhp == mode.hp
            capture(state, 'weekly', slot, mode, name, prior)
        for name, spec in stygian.items():
            if only and name not in only:
                continue
            node = spec['node']
            state, walk = approach(save, spec['hub'], node)
            if not frame(state).storyNearbyPortal.available:
                lowest = spec['modes'][0]
                core.action(state, 'story_nearby_portal')
                assert state.story.node == spec['hub'] and state.endgameRun is None and level < lowest['level']
                rows.append(dict(level=level, name=name, type='stygian',
                                 mode=lowest['id'], status='locked', requiredLevel=lowest['level']))
                print(level, 'stygian', name, 'locked', lowest['level'], flush=True)
                continue
            walk.cross(node)
            modes = frame(state).stygianDesk.modes
            mode = next(option for option in reversed(list(modes.values())) if option.available)
            prior = mode.record.clears if mode.record else 0
            core.action(state, f'stygian_start:{name}:{mode.id}:troupe')
            assert state.endgameRun is not None
            assert state.endgameRun.boss.maxhp == mode.hp
            capture(state, 'stygian', state.endgameRun, mode, name, prior)
    if write:
        proof = dict(draftBalance=True, route=route, inputBudgetSeconds=seconds, sources=sources, encounters=rows)
        (ROOT / write).write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    if expect_clear:
        incomplete = [(row['level'], row['name'], row['status']) for row in rows
                      if row['status'] not in ('clear', 'locked')]
        assert rows and not incomplete, incomplete
        for row in rows:
            if row['status'] == 'locked':
                continue
            name = row['name']
            missing = REQUIRED_EVENTS.get(name, set()) - {event['id'] for event in row['events']}
            assert not missing, (row['level'], name, missing)
            if name == 'raiden':
                assert 'armored' in [phase['id'] for phase in row['phases']], row
            if name == 'shouki' and route == 'mechanics':
                counts = {event['id']:event['count'] for event in row['events']}
                assert counts['shouki:WN15:destroyed'] == 4, row
                assert counts['shouki:WN14:core-hit'] == 1 and counts['shouki:WN14:guard-hit'] >= 1, row
                assert 'shouki:WN16' not in counts, row
            if name == 'beidou' and route != 'basic':
                events = {event['id']:event for event in row['events']}
                choice = 'baited' if route == 'bait' else 'waited'
                assert {'stygian:beidou:' + choice, 'stygian:beidou:opening-hit'} <= events.keys(), row
                if row['mode'] == 'extreme':
                    expected = 72 if route == 'bait' else 139
                    assert events['stygian:beidou:recover']['value'] == expected, row


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--level', nargs='+', type=int, choices=SAVES, default=[200])
    parser.add_argument('--only', nargs='+', default=[])
    parser.add_argument('--seconds', type=int, default=180)
    parser.add_argument('--write')
    parser.add_argument('--expect-clear', action='store_true')
    parser.add_argument('--route', choices=['basic', 'mechanics', 'bait'], default='basic')
    args = parser.parse_args()
    run(args.level, set(args.only), args.seconds, args.write, args.expect_clear, args.route)
