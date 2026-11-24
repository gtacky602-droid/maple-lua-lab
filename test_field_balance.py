"""Verify that the draft changes ordinary HP and applies earned weapon ATK on save restore."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.ridge_watch_test import earn_ridge_watch_pair
from tools.waypoint_test import TrailWalk


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


def verify_fill_basics(core):
    state = core.new(12)
    core.action(state, 'story_start')
    for slot, level in ((1, 20), (1, 40), (2, 80), (2, 40), (2, 60)):
        assert core.giveArtifact(state, slot, level, 4)
    core.action(state, 'artifact_equip:1')
    core.action(state, 'swap')
    core.action(state, 'artifact_equip:3')
    items = state.inventory['items']
    assert items[1].owner == 1 and items[3].owner == 2
    core.enterStoryNode(state, 'mond-road')
    core.action(state, 'artifact_fill_basics')
    assert items[5].owner == 0
    core.enterStoryNode(state, 'mond-town')
    core.action(state, 'artifact_fill_basics')
    assert items[1].owner == 1 and items[2].owner == 0
    assert items[3].owner == 2 and items[4].owner == 0 and items[5].owner == 1
    core.action(state, 'artifact_fill_basics')
    assert items[1].owner == 1 and items[3].owner == 2 and items[5].owner == 1


def verify_first_artifacts(lua, core, path):
    raw = path.read_bytes()
    save = validate_save(json.loads(raw))
    assert save['progression']['level'] == 20
    assert all(item['owner'] != 1 for item in save['inventory']['items'])
    state = core.restore(lua.table_from(save, recursive=True), 12)
    for _ in range(5):
        core.action(state, 'weapon_upgrade:SW01')
    assert state.weapons.upgrades.SW01 == 5 and state.actors[1].atk == 8
    initial = dict(atk=state.actors[1].atk, hp=state.actors[1].maxhp, moraSpent=save['mora']-state.mora)
    graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
    exits = {node['id']: node['exits'] for node in graph['nodes']}
    edges = {(origin, edge['to']): edge for origin, gates in exits.items() for edge in gates}
    trail = TrailWalk(lua, core, state, edges, exits)
    rewards = earn_ridge_watch_pair(lua, core, trail, 'i')
    checkpoint = validate_save(native(core.checkpoint(state)))
    restored = core.restore(lua.table_from(checkpoint, recursive=True), 12)
    assert restored.actors[1].atk == state.actors[1].atk > initial['atk']
    return dict(saveSha256=sha256(raw).hexdigest(), weapon='SW01', upgrade=5, start=initial,
                set='paleFlame', twoDomainClears=rewards, equippedAtk=restored.actors[1].atk,
                equippedHp=restored.actors[1].maxhp)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--recovery-route', type=Path, help='Optional earned Lv20 save with no traveler artifacts')
    args = parser.parse_args()
    standard_lua, standard_core = runtime()
    draft_lua, draft_core = runtime(draft_balance=True)
    saved = prepare(standard_core)
    standard = measure(standard_lua, standard_core, saved, False)
    draft = measure(draft_lua, draft_core, saved, True)
    verify_fill_basics(standard_core)
    assert (standard['atk'], draft['atk']) == (6, 18)
    assert (standard['ordinaryHp'], draft['ordinaryHp']) == (15, 32)
    for field in ('dailyEliteHp', 'bossHp', 'reward'):
        assert standard[field] == draft[field]
    result = {
        'scope': 'Same prepared Lv20 checkpoint, same Liyue field and enemy spawn; actual defeat settlement and respawn.',
        'standard': standard,
        'draft': draft,
        'fillBasics': {'townOnly': True, 'keptExistingFlower': True, 'keptCompanionFeather': True,
                       'pickedStrongestUnusedFeather': True, 'idempotent': True},
    }
    if args.recovery_route:
        result['artifactRecovery'] = verify_first_artifacts(draft_lua, draft_core, args.recovery_route)
    (ROOT / 'evidence/field-balance-draft-lua.json').write_text(
        json.dumps(result, indent=2) + '\n', encoding='utf8',
    )
    print('Field balance: draft HP, restored weapon ATK, unchanged rewards and boss HP.')
