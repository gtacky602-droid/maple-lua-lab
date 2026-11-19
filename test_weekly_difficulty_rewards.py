"""Exercise each ranked portal and settle a test victory in all 56 combinations."""
from copy import deepcopy
import json

from experience import CAP, LEVELS, WEEKLY_MODE_IDS
from runtime import ROOT, native, runtime
from savegame import validate_save


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


specs = read('content/weekly-boss-spawns.json')['weeklyBosses']
official = {id for row in read('content/encounter-roster-review.json')['weekly'] for id in row['rows']}
graph = read('content/story-graph.json')['nodes']
entrances = {edge['to']: (node['id'], edge) for node in graph for edge in node['exits']}
lua, core = runtime()
empty = lua.table()


def state_at(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    return state


def at_gate(state, spec):
    node, edge = entrances[spec['node']]
    core.enterStoryNode(state, node)
    actor = state.actors[state.active]
    actor.x, actor.y = edge['x'], edge.get('y', 480)


def start(state, spec, rank):
    core.action(state, f'weekly_start:{spec["id"]}:{rank}')
    assert state.story.node == spec['node'], (spec['id'], rank, state.storyNotice)
    slot = state.weeklySlots[spec['id']]
    assert slot.mode.id == rank
    return slot


def snapshot(state):
    return validate_save(native(core.checkpoint(state)))


def reopen(state):
    return core.restore(lua.table_from(snapshot(state), recursive=True), 12)


def reward_totals(state):
    p = state.progression
    return (p.killXp, p.baseXp, p.overflowXp, state.mora, state.kills)


def assert_reward(state, before, xp, mora):
    assert reward_totals(state) == (
        before[0] + xp, before[1] + xp, before[2] + xp, before[3] + mora, before[4] + 1,
    )


def reset_cooldown(state, spec):
    slot = state.weeklySlots[spec['id']]
    slot.waitUntil = state.t
    core.step(state, 1 / 60, empty)
    assert slot.waitUntil is None


work = ROOT / 'work'
work.mkdir(exist_ok=True)
(work / 'andrius-weekly-ranked-fixture.json').write_text(
    json.dumps(snapshot(state_at(40)), ensure_ascii=False) + '\n', encoding='utf8')
probe = lua.table(atk=100, id=1)
target = lua.table(defense=0)
tiers = list(zip(WEEKLY_MODE_IDS, (40, 100, 160, 180), (130, 100, 80, 62), strict=True))
results = {}
for spec in specs:
    id = spec['id']
    state = state_at(CAP)
    at_gate(state, spec)
    desk = core.frame(state).weeklyDesk
    if id not in official:
        assert spec['original'] and desk is None
        continue
    assert desk.id == id and [mode.id for mode in desk.modes.values()] == list(WEEKLY_MODE_IDS)
    for index, (mode, minimum, attack) in reversed(list(enumerate(tiers))):
        at_gate(state, spec)
        choice = core.frame(state).weeklyDesk.modes[index + 1]
        assert choice.level == max(spec['level'], minimum) and choice.available
        assert choice.record is None
        before = reward_totals(state)
        slot = start(state, spec, mode)
        assert core.frame(state).weeklyBoss.difficulty == choice.name
        assert core.enemyHitDamage(state, probe, target, 1, 'physical')[0] == attack
        assert slot.primary.hp == slot.primary.maxhp == spec['hp']
        assert core.defeatEnemy(state, slot.primary, 1)
        xp, mora = choice.xp + choice.firstXp, choice.mora + choice.firstMora
        assert_reward(state, before, xp, mora)
        assert not core.defeatEnemy(state, slot.primary, 1)
        assert_reward(state, before, xp, mora)
        reward = core.frame(state).weeklyBoss.reward
        assert (reward.xp, reward.mora, reward.first) == (xp, mora, True)
        assert state.endgame.weekly[f'{id}:{mode}'].clears == 1
        assert state.endgame.bosses[id] is None
        assert not any(state.endgame.weekly[f'{id}:{lower}'] for lower in WEEKLY_MODE_IDS[:index])

        state = reopen(state)
        at_gate(state, spec)
        assert_reward(state, before, xp, mora)
        desk = core.frame(state).weeklyDesk
        assert desk.remaining > 0 and not desk.modes[index + 1].available
        core.action(state, f'weekly_start:{id}:{mode}')
        assert state.story.node == entrances[spec['node']][0]
        reset_cooldown(state, spec)
        before = reward_totals(state)
        slot = start(state, spec, mode)
        assert core.defeatEnemy(state, slot.primary, 1)
        assert_reward(state, before, choice.xp, choice.mora)
        assert core.frame(state).weeklyBoss.reward.first is False
        assert state.endgame.weekly[f'{id}:{mode}'].clears == 2
        reset_cooldown(state, spec)
        results[f'{id}:{mode}'] = dict(level=choice.level, damagePercent=attack,
                                      xp=choice.xp, firstXp=choice.firstXp,
                                      mora=choice.mora, firstMora=choice.firstMora)

assert len(results) == 56

andrius = next(row for row in specs if row['controller'] == 'andrius')
id = andrius['id']
low = state_at(39)
at_gate(low, andrius)
assert not core.frame(low).weeklyDesk.modes[1].available
core.action(low, f'weekly_start:{id}:entry')
assert low.story.node == entrances[andrius['node']][0]
core.action(low, 'story_portal:' + andrius['node'])
assert low.story.node == andrius['node']
assert low.weeklySlots[id].mode is None
assert core.defeatEnemy(low, low.weeklySlots[id].primary, 1)
assert snapshot(low)['endgame']['bosses'][id]['clears'] == 1
assert low.endgame.weekly is None

high = state_at(CAP)
core.action(high, f'weekly_start:{id}:expert')
assert high.story.node == 'mond-town' and not high.weeklySlots
at_gate(high, andrius)
attempt = start(high, andrius, 'entry')
before = reward_totals(high)
core.enterStoryNode(high, 'mond-road')
assert reward_totals(high) == before and not high.endgame
assert attempt.mode is None and attempt.primary.fixedKillXp is None
at_gate(high, andrius)
assert core.defeatEnemy(high, start(high, andrius, 'entry').primary, 1)
saved = snapshot(high)
for invalid in (f'{id}:bogus', 'original-tide-surveyor:entry'):
    corrupted = deepcopy(saved)
    corrupted['endgame']['weekly'][invalid] = corrupted['endgame']['weekly'][f'{id}:entry']
    try:
        validate_save(corrupted)
    except ValueError:
        pass
    else:
        raise AssertionError(invalid)

(ROOT / 'evidence/weekly-difficulty-rewards-lua.json').write_text(json.dumps(
    dict(modes=results, rankedPortalVerified=True, sameHpAndDistinctDamage=True,
         lockedLevelAndRemoteRejected=True, firstAndRepeatWithRestore=True, preservesLegacyRecords=True,
         cooldownBeforeRankedReentry=True, leaveWithoutReward=True), ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'{len(results)} ranked weekly portals and first/repeat reward pairs passed')
