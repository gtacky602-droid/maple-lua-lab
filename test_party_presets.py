"""Exercise party presets through the same Lua commands as the browser."""

from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')


def action(command):
    core.action(state, command)


def slots(*rows):
    data = [list(row) for row in rows] + [[] for _ in range(8-len(rows))]
    assert core.configure(state, lua.table_from(data, recursive=True))[0]


def equip(actor, item):
    state.active = actor
    action(f'artifact_equip:{item}')


def checkpoint():
    return validate_save(native(core.checkpoint(state)))


for part in (1, 1, 2, 1, 2):
    assert core.giveArtifact(state, part, 30, 3)
equip(1, 1)
equip(2, 2)
slots(['SK01', 'SK02'], ['SK03'])
state.actors[1].hp = 100.25
state.actors[1].cd.dodge = 1
assert state.actors[2].maxhp > 155.5
state.actors[2].hp = 155.5
state.actors[2].cd.skill1 = 6
state.gauge = 73
action('party_preset_store:1')
stored = checkpoint().get('partyPresets', {})
assert set(stored) == {'1'}, 'Party preset was not stored'
assert stored['1']['traveler'] == [1, 0, 0, 0, 0]
assert stored['1']['partner'] == [2, 0, 0, 0, 0]
assert stored['1']['loadout'][0] == ['SK01', 'SK02']

action('companion:beidou')
equip(2, 2)
equip(2, 5)
equip(1, 4)
slots(['SK02'])
state.actors[2].hp = 59.75
state.actors[2].cd.skill4 = 5
action('party_preset_store:3')
assert set(checkpoint()['partyPresets']) == {'1', '3'}

state.actors[1].hp = 100.75
action('party_preset_apply:1')
assert state.companion == 'amber' and checkpoint()['loadout'][0] == ['SK01', 'SK02']
bag = {item.id: item for item in state.inventory['items'].values()}
assert (bag[1].owner, bag[2].owner, bag[2].companionId, bag[4].owner) == (1, 2, 'amber', 0)
assert bag[5].owner == 2 and bag[5].companionId == 'beidou'
assert state.actors[1].hp == 100.75 and state.actors[1].cd.dodge == 1
assert state.actors[2].hp == 155.5 and state.actors[2].cd.skill1 == 6
assert state.gauge == 73 and len(bag) == 5

action('party_preset_apply:3')
assert state.companion == 'beidou' and bag[2].companionId == 'beidou'
assert (state.actors[2].hp, state.actors[2].cd.skill4) == (59.75, 5)
before = json.dumps(checkpoint(), sort_keys=True)
action('party_preset_apply:3')
assert json.dumps(checkpoint(), sort_keys=True) == before
assert checkpoint()['loadout'][0] == ['SK02']

action('artifact_sell:1')
assert not any(item.id == 1 for item in state.inventory['items'].values())
before = json.dumps(checkpoint(), sort_keys=True)
action('party_preset_apply:1')
assert json.dumps(checkpoint(), sort_keys=True) == before
assert '見つかりません' in core.frame(state).partyPresetMessage

action('party_preset_store:2')
assert set(checkpoint()['partyPresets']) == {'1', '2', '3'}
slots()
action('party_preset_store:2')
assert all(not row for row in checkpoint()['partyPresets']['2']['loadout'])
action('party_preset_apply:3')
assert checkpoint()['loadout'][0] == ['SK02']
core.enterStoryNode(state, 'mond-road')
before = json.dumps(checkpoint(), sort_keys=True)
action('party_preset_apply:2')
action('party_preset_store:3')
assert json.dumps(checkpoint(), sort_keys=True) == before

saved = checkpoint()
new_lua, new_core = runtime()
reloaded = new_core.restore(new_lua.table_from(json.loads(json.dumps(saved)), recursive=True), 12)
assert native(new_core.checkpoint(reloaded))['partyPresets'] == saved['partyPresets']
new_core.action(reloaded, 'party_preset_apply:2')
assert all(not row for row in native(new_core.checkpoint(reloaded))['loadout'])
legacy = {key: value for key, value in saved.items() if key != 'partyPresets'}
old = new_core.restore(new_lua.table_from(validate_save(legacy), recursive=True), 12)
assert 'partyPresets' not in native(new_core.checkpoint(old))

bad_edits = {
    'unknown companion': lambda p: p['1'].update(companion='invalid'),
    'invalid slot': lambda p: p.update({'4': p['1']}),
    'duplicate item': lambda p: p['1']['partner'].__setitem__(0, p['1']['traveler'][0]),
    'invalid macro': lambda p: p['1']['loadout'][0].append('slot2'),
    'invalid gear id': lambda p: p['1']['traveler'].__setitem__(0, -1),
}
for label, edit in bad_edits.items():
    damaged = deepcopy(saved)
    edit(damaged['partyPresets'])
    try:
        validate_save(damaged)
    except ValueError:
        pass
    else:
        raise AssertionError(label)

fixture = core.new(12)
core.action(fixture, 'story_start')
for _ in range(2):
    assert core.giveArtifact(fixture, 1, 30, 3)
core.action(fixture, 'artifact_equip:1')
fixture_path = ROOT/'work/party-presets-opening.json'
fixture_path.parent.mkdir(exist_ok=True)
fixture_path.write_text(json.dumps(validate_save(native(core.checkpoint(fixture)))), encoding='utf8')

proof = dict(threeSlots=True, sparseSlotsRoundTrip=True, stableItemIds=True,
             preservedHpCooldownsAndGauge=True, noRepeatedApplySideEffects=True,
             staleItemApplyLeftLivePartyUnchanged=True, townOnly=True,
             legacySaveLoaded=True, invalidRecordsRejected=list(bad_edits))
(ROOT/'evidence/party-presets-lua.json').write_text(json.dumps(proof, indent=2)+'\n',encoding='utf8')
print('Party presets preserve equipment identity and combat state, and reject incomplete changes.')
