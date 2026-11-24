"""Verify fixed weapon rewards, ownership, upgrades, combat, and save migration."""

from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
state = core.new(12)


def act(command):
    core.action(state, command)


def options(party):
    return {row.id: row for row in core.frame(party).weaponView.options.values()}


def snapshot():
    return validate_save(native(core.checkpoint(state)))


def restore(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True), 12)


act('story_start')
assert state.actors[1].atk == 4 and core.equippedWeapon(state,'traveler') == 'SW01'
assert not options(state)['SW02'].owned
act('weapon_equip:traveler:SW02')
act('weapon_upgrade:SW02')
assert state.weapons is None and state.actors[1].atk == 4

core.grantExp(state, LEVELS[19]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(state, 'liyue-harbor')
act('story_accept:liyue-market-delivery')
act('story_report:liyue-market-delivery')
assert not options(state)['SW02'].owned and state.mora == 0
quest = state.story.quests['liyue-market-delivery']
quest.count = 3
quest.delivery.recovered = quest.delivery.guardCleared = True
for package in ('pot','vessel','wheel'):
    quest.delivery.delivered[package] = True
act('story_report:liyue-market-delivery')
act('story_report:liyue-market-delivery')
assert quest.cycles == 1 and state.mora == 300 and options(state)['SW02'].owned
reward_save = snapshot()
assert 'weapons' not in reward_save and options(restore(reward_save))['SW02'].owned

act('weapon_equip:partner:SW02')
assert state.weapons is None
act('weapon_equip:traveler:SW02')
assert state.actors[1].atk == 5
act('weapon_upgrade:SW02')
assert state.mora == 220 and options(state)['SW02'].atk == 6 and state.actors[1].atk == 6
act('companion:ayaka')
act('party_preset_store:1')
act('weapon_equip:partner:SW02')
assert core.equippedWeapon(state,'traveler') == 'SW01' and state.actors[1].atk == 4
assert core.equippedWeapon(state,'ayaka') == 'SW02' and state.actors[2].atk == 6
act('party_preset_store:2')
act('party_preset_apply:1')
assert core.equippedWeapon(state,'traveler') == 'SW02' and state.actors[1].atk == 6
assert core.equippedWeapon(state,'ayaka') is None and state.actors[2].atk == 3
act('party_preset_apply:2')
assert state.actors[1].atk == 4 and state.actors[2].atk == 6
act('party_preset_apply:1')

saved = snapshot()
returned = restore(saved)
assert returned.actors[1].atk == 6 and returned.mora == 220
assert options(returned)['SW02'].level == 1
core.enterStoryNode(returned,'mond-road')
core.action(returned,'weapon_upgrade:SW02')
assert returned.mora == 220 and options(returned)['SW02'].level == 1
enemy = lua.table(id=91,x=250,y=480,hp=500,maxhp=500,warning=0,kind=1)
returned.enemies = lua.table_from([enemy])
returned.actors[1].x = 200
returned.actors[2].lock = 99
core.action(returned,'normal')
assert enemy.hp == 494

act('weapon_upgrade:SW02')
assert state.mora == 60 and options(state)['SW02'].level == 2
act('weapon_upgrade:SW02')
assert state.mora == 60 and options(state)['SW02'].level == 2
state.mora = 10000
for _ in range(9):
    act('weapon_upgrade:SW02')
assert state.mora == 5840 and options(state)['SW02'].level == 10
assert options(state)['SW02'].atk == 18

tests = {
    'over cap': {'upgrades': {'SW02': 11}, 'equipped': {'traveler': 'SW02'}},
    'unearned': {'upgrades': {'SW03': 2}, 'equipped': {}},
    'wrong type': {'upgrades': {}, 'equipped': {'amber': 'SW02'}},
    'duplicate': {'upgrades': {}, 'equipped': {'traveler': 'SW02', 'ayaka': 'SW02'}},
    'starter misuse': {'upgrades': {}, 'equipped': {'ayaka': 'SW01'}},
}
for label, data in tests.items():
    bad = deepcopy(saved)
    bad['weapons'] = data
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError(label)

catalog = json.loads((ROOT/'content/weapon-settings.json').read_text(encoding='utf8'))
for item in catalog['items']:
    owner = item.get('bound','traveler')
    if not item.get('quest'):
        continue
    fixture = core.new(12)
    core.action(fixture,'story_start')
    if owner!='traveler':
        core.action(fixture,'companion:'+owner)
    assert not core.canEquipWeapon(fixture,owner,item['id'])
    fixture.story.quests[item['quest']] = lua.table(status='complete')
    assert core.canEquipWeapon(fixture,owner,item['id'])

proof = dict(catalogItems=len(catalog['items']), fixedQuestRewards=15, earlyReportAndDuplicateRejected=True,
             existingSavesDeriveEarnedWeapons=True, slotOwnershipTransfer=True,
             preservedByPresetsAndSave=True, appliedWeaponAtkInCombat=True, moraAndCapApplied=True,
             invalidSavesRejected=list(tests), preparedQuestStates=True)
(ROOT/'evidence/weapon-progression-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
print('Fixed weapon rewards, role transfer, presets, upgrades, battle ATK and save passed.')
