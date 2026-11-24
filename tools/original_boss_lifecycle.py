"""Verify the post-report return path using the completed chapter scenario."""

import json

from runtime import ROOT, native
from savegame import validate_save


def check_original_boss_retry(lua, core, state, boss, quest, reenter):
    def save():
        return validate_save(native(core.checkpoint(state)))

    initial = save()
    saved_slot = initial['fieldBosses'][boss]
    assert saved_slot['generation'] == 1 and saved_slot['hp'] == 0
    assert saved_slot['waitTicks'] > 1
    assert initial['endgame']['bosses'][boss]['clears'] == 1
    checkpoint = state.story.node
    quest_count = state.story.quests[quest].count

    reenter(state)
    arena = state.story.node
    assert arena != checkpoint
    slot = state.fieldSlots[boss]
    assert slot.phase == 'respawn' and slot.generation == 1 and slot.enemy.hp == 0
    assert not core.defeatEnemy(state, slot.enemy, 1)

    # Move the simulation clock to the last cooldown tick and step the regular Lua loop.
    idle = lua.table()
    state.t = slot.waitUntil - 1 / 60
    core.step(state, 1 / 60, idle)
    assert slot.generation == 2 and slot.enemy.hp == slot.enemy.maxhp > 0
    assert any(e.fieldBoss == boss and e.hp > 0 for e in state.enemies.values())
    core.step(state, 1 / 60, idle)
    before = state.kills, state.mora, state.progression.killXp, state.progression.questXp
    assert core.defeatEnemy(state, slot.enemy, 1)
    core.action(state, 'story_report:' + quest)
    after = state.kills, state.mora, state.progression.killXp, state.progression.questXp
    rewards = tuple(end - start for start, end in zip(before, after))
    specs = json.loads((ROOT / 'content/field-boss-spawns.json').read_text(encoding='utf8'))
    spec = next(row for row in specs['fieldBosses'] if row['id'] == boss)
    if spec.get('questRewardsOnly'):
        assert rewards == (1, 0, 0, 0), (boss, rewards)
    else:
        assert rewards[0:2] == (1, spec['mora']) and rewards[2] > 0 and rewards[3] == 0
    assert state.story.quests[quest].count == quest_count
    assert state.story.quests[quest].status == 'complete'

    final = save()
    restored = core.restore(lua.table_from(final, recursive=True), 12)
    assert restored.endgame.bosses[boss].clears == 2
    assert restored.story.quests[quest].status == 'complete'
    assert restored.fieldSlots[boss].generation == 2 and restored.fieldSlots[boss].phase == 'respawn'
    result = dict(
        checkpoint=checkpoint, arena=arena, quest=quest, questCount=quest_count,
        savedCooldownTicks=saved_slot['waitTicks'], respawnedAtFullHp=True,
        retryRewards=dict(kills=rewards[0], mora=rewards[1], killXp=rewards[2], questXp=rewards[3]),
        restoredClearCount=restored.endgame.bosses[boss].clears,
        scope='Chapter scenario performs the first fight and report. Follow-up uses real portals at fixture coordinates, a simulated cooldown, and Lua defeat settlement.',
    )
    path = ROOT / 'evidence' / f'{boss}-lifecycle-lua.json'
    path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
