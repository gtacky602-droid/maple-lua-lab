"""Check the shared victory settlement across all seven fights and four difficulties."""
import json

from experience import CAP, LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


specs = json.loads((ROOT / 'content/stygian-matches.json').read_text(encoding='utf8'))['matches']
lua, core = runtime()
empty = lua.table()


def new_state(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    return state


def checkpoint(state):
    return validate_save(native(core.checkpoint(state)))


def restore(saved):
    return core.restore(lua.table_from(saved, recursive=True), 12)


def start(state, match, mode, reward_set='troupe'):
    core.enterStoryNode(state, specs[match]['hub'])
    core.enterStoryNode(state, specs[match]['node'])
    core.action(state, f'stygian_start:{match}:{mode}:{reward_set}')
    return state.endgameRun


def totals(state):
    p = state.progression
    return (p.total, p.killXp, p.baseXp, p.overflowXp, p.questXp, state.mora)


def settle(state, run):
    # Each controller's fight has its own test. Supply its terminal state here
    # to exercise the actual settlement for all 28 mode combinations.
    run.boss.hp = 0
    core.step(state, 1 / 60, empty)
    assert run.status == 'clear'
    return native(core.frame(state).endgameRun.matchReward)


def assert_award(state, before, xp, mora):
    assert totals(state) == (
        before[0] + xp, before[1] + xp, before[2] + xp,
        before[3] + xp, before[4], before[5] + mora,
    )


checked = {}
for match, spec in specs.items():
    normal = spec['modes'][0]
    below = new_state(normal['level'] - 1)
    baseline = totals(below)
    assert start(below, match, normal['id']) is None
    assert totals(below) == baseline

    state = new_state(CAP)
    for index, mode in reversed(list(enumerate(spec['modes']))):
        id = mode['id']
        key = f'{match}:{id}'
        level = mode['level']
        core.enterStoryNode(state, spec['node'])
        available = core.frame(state).stygianDesk.modes[index + 1]
        assert available.id == id and available.record is None
        pace = 50 if level < 100 else 55 if level < 140 else 60
        base_exp = LEVELS[level - 1]['normal_enemy_base_exp']
        repeat_xp = (base_exp * pace * (index + 3) * 9 + 5) // 10
        next_exp = LEVELS[min(level, CAP - 1) - 1]['required_exp_to_next']
        first_xp = (next_exp * (index + 3) + 50) // 100
        assert (available.xp, available.firstXp) == (repeat_xp, first_xp)
        assert first_xp > 0 and repeat_xp > 0

        before = totals(state)
        bag = len(state.inventory['items'])
        run = start(state, match, id)
        assert run is not None
        first = settle(state, run)
        assert first['first'] and first['xp'] == repeat_xp + first_xp
        assert first['mora'] == mode['mora'] + mode['firstMora']
        assert_award(state, before, first['xp'], first['mora'])
        assert not any(state.endgame.stygian[f'{match}:{earlier["id"]}']
                       for earlier in spec['modes'][:index])
        assert len(state.inventory['items']) == bag + 1
        assert state.inventory['items'][bag + 1].setId == 'troupe'
        for _ in range(8):
            core.step(state, 1 / 60, empty)
        assert_award(state, before, first['xp'], first['mora'])
        saved = checkpoint(state)
        assert saved['endgame']['stygian'][key]['clears'] == 1
        state = restore(saved)
        assert state.story.node == spec['hub'] and not state.endgameRun
        assert_award(state, before, first['xp'], first['mora'])

        before = totals(state)
        run = start(state, match, id, 'gladiator')
        repeat = settle(state, run)
        assert not repeat['first'] and repeat['xp'] == repeat_xp and repeat['mora'] == mode['mora']
        assert_award(state, before, repeat_xp, mode['mora'])
        assert state.endgame.stygian[key].clears == 2
        assert len(state.inventory['items']) == bag + 2
        assert state.inventory['items'][bag + 2].setId == 'gladiator'
        state = restore(checkpoint(state))
        checked[key] = dict(level=level, repeatXp=repeat_xp, firstXp=first_xp,
                            repeatMora=mode['mora'], firstMora=mode['firstMora'])

    baseline = totals(state)
    assert start(state, match, normal['id']) is not None
    core.action(state, 'endgame_exit')
    assert not state.endgameRun and totals(state) == baseline

past = checkpoint(new_state(CAP))
past['endgame'] = {'abyss': {}, 'bosses': {}, 'stygian': {
    'farka:normal': {'clears': 1, 'bestTicks': 30, 'companion': 'amber', 'mainSkill': 'normal'},
}}
old_save = restore(validate_save(past))
before = totals(old_save)
run = start(old_save, 'farka', 'normal')
repeat = settle(old_save, run)
assert not repeat['first'] and repeat['xp'] == checked['farka:normal']['repeatXp']
assert_award(old_save, before, repeat['xp'], repeat['mora'])

full = new_state(CAP)
run = start(full, 'beidou', 'normal')
for _ in range(80):
    assert core.giveArtifact(full, 1, 30, 3)
before = totals(full)
held = settle(full, run)
assert not held['bag']
assert_award(full, before, held['xp'], held['mora'])
assert full.inventory.ground[1].item.setId == 'troupe'
assert restore(checkpoint(full)).inventory.ground[1].zone == 'town'

timeout = new_state(CAP)
before = totals(timeout)
run = start(timeout, 'beidou', 'normal')
run.start = timeout.t - run.rules.limit
core.step(timeout, 1 / 60, empty)
assert run.status == 'failed' and totals(timeout) == before and timeout.endgame is None

result = dict(modes=checked, firstAndRepeatAfterReload=True, oldWinRetainsFirstClear=True,
              showRewardsBeforeEntry=True, appliesBaseExpAtCap=True, keepsExpAndArtifactWhenBagIsFull=True,
              noPayoutOnExitOrTimeout=True)
(ROOT / 'evidence/stygian-clear-rewards-lua.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'{len(checked)} Stygian match/difficulty settlements passed, including repeat, import and capped EXP')
