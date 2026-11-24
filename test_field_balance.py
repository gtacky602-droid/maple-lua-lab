"""Verify that the draft changes ordinary HP and applies earned weapon ATK on save restore."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


QUEST = 'liyue-market-delivery'
FIELD = 'liyue-field'
TARGET = 'liyue-field-2'
ELITE = 'liyue-field-1'


def prepare(core):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[19]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, 'liyue-harbor')
    core.action(state, 'story_accept:' + QUEST)
    quest = state.story.quests[QUEST]
    quest.count = 3
    quest.delivery.recovered = quest.delivery.guardCleared = True
    for package in ('pot', 'vessel', 'wheel'):
        quest.delivery.delivered[package] = True
    core.action(state, 'story_report:' + QUEST)
    core.action(state, 'weapon_equip:traveler:SW02')
    core.action(state, 'weapon_upgrade:SW02')
    assert state.weapons.upgrades.SW02 == 1
    return validate_save(native(core.checkpoint(state)))


def measure(lua, core, save, draft):
    state = core.restore(lua.table_from(save, recursive=True), 12)
    assert state.mora == 220 and core.equippedWeapon(state, 'traveler') == 'SW02'
    weapon_atk = state.actors[1].atk
    core.enterStoryNode(state, FIELD)
    enemies = {enemy.spawnId: enemy for enemy in state.enemies.values()}
    target = enemies[TARGET]
    elite = enemies[ELITE]
    hp, elite_hp = target.maxhp, elite.maxhp
    assert target.hp == hp and not elite.draftFieldHp
    if draft:
        field = core.frame(state).fieldBalance
        assert target.draftFieldHp and field.minHp <= hp <= field.maxHp
    else:
        assert core.frame(state).fieldBalance is None

    before = state.mora, state.progression.killXp, state.kills
    assert core.defeatEnemy(state, target, 1)
    after = state.mora, state.progression.killXp, state.kills
    reward = tuple(end - start for start, end in zip(before, after))
    target.respawn = 0
    core.step(state, 1/60, lua.table())
    assert target.hp == hp

    core.enterStoryNode(state, 'anemo-field-basin')
    boss = state.fieldSlots['boss-20040201'].enemy
    assert boss.maxhp == boss.hp == 870
    return dict(atk=weapon_atk, ordinaryHp=hp, dailyEliteHp=elite_hp, bossHp=boss.maxhp, reward=reward)


if __name__ == '__main__':
    standard_lua, standard_core = runtime()
    draft_lua, draft_core = runtime(draft_balance=True)
    saved = prepare(standard_core)
    standard = measure(standard_lua, standard_core, saved, False)
    draft = measure(draft_lua, draft_core, saved, True)
    assert (standard['atk'], draft['atk']) == (6, 18)
    assert (standard['ordinaryHp'], draft['ordinaryHp']) == (15, 32)
    for field in ('dailyEliteHp', 'bossHp', 'reward'):
        assert standard[field] == draft[field]
    result = {
        'scope': 'Same prepared Lv20 checkpoint, same Liyue field and enemy spawn; actual defeat settlement and respawn.',
        'standard': standard,
        'draft': draft,
    }
    (ROOT / 'evidence/field-balance-draft-lua.json').write_text(
        json.dumps(result, indent=2) + '\n', encoding='utf8',
    )
    print('Field balance: draft HP, restored weapon ATK, unchanged rewards and boss HP.')
