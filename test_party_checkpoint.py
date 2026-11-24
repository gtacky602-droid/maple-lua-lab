"""Verify party combat state through the public checkpoint and restore path."""

from copy import deepcopy
import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


def tick(core, state, count):
    for _ in range(count):
        core.step(state, 1/60)


def save(core, state):
    return validate_save(json.loads(json.dumps(native(core.checkpoint(state)))))


def restore(lua, core, saved):
    return core.restore(lua.table_from(saved, recursive=True), 12)


lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
amber = state.actors[2]
amber.hp, amber.cd.skill1 = 68.25, 7
core.action(state, 'companion:beidou')
assert state.companion == 'beidou'
tick(core, state, 90)
core.enterStoryNode(state, 'mond-road')
traveler, partner = state.actors[1], state.actors[2]
traveler.hp, partner.hp = 105.5, 90.25
state.gauge = 63
core.action(state, 'dodge')
core.action(state, 'swap')
core.action(state, 'skill2')
assert state.active == 2 and traveler.cd.dodge == 2 and partner.cd.skill2 == 7
assert len(state.pending) > 0 and partner.lock > 0

saved = save(core, state)
new_lua, new_core = runtime()
loaded = restore(new_lua, new_core, saved)
assert loaded.story.node == 'mond-town'
assert loaded.companion == 'beidou' and loaded.active == 2 and loaded.gauge == 63
assert [a.hp for a in loaded.actors.values()] == [105.5, 90.25]
assert loaded.actors[1].cd.dodge == 2 and loaded.actors[2].cd.skill2 == 7 and loaded.swap == .8
assert len(loaded.pending) == 0 and loaded.actors[2].lock == 0
assert save(new_core, loaded)['partyCombat'] == saved['partyCombat']

new_core.action(loaded, 'swap')
assert loaded.active == 2
tick(new_core, loaded, 60)
new_core.action(loaded, 'swap')
assert loaded.active == 1
assert math.isclose(loaded.actors[1].cd.dodge, 1)
new_core.action(loaded, 'companion:amber')
assert loaded.actors[2].hp == 68.25
assert math.isclose(loaded.actors[2].cd.skill1, 4.5)
new_core.action(loaded, 'companion:beidou')
assert loaded.actors[2].hp == 90.25
assert math.isclose(loaded.actors[2].cd.skill2, 6)
new_core.enterStoryNode(loaded, 'mond-road')
new_core.enterStoryNode(loaded, 'mond-town')
assert all(a.hp == a.maxhp for a in loaded.actors.values())
assert math.isclose(loaded.actors[2].cd.skill2, 6)

legacy = {key: value for key, value in saved.items() if key != 'partyCombat'}
loaded = restore(new_lua, new_core, validate_save(legacy))
assert all(a.hp == a.maxhp for a in loaded.actors.values())
assert all(len(a.cd) == 0 for a in loaded.actors.values())
assert loaded.gauge == 63 and loaded.companion == 'beidou'

downed = deepcopy(saved)
downed['partyCombat']['companion']['hp'] = 0
loaded = restore(new_lua, new_core, validate_save(downed))
assert loaded.actors[2].hp == 0 and loaded.active == 1

trial = core.new(12)
core.action(trial, 'story_start')
core.enterStoryNode(trial, 'natlan-hub')
trial.actors[2].hp, trial.actors[2].cd.dodge = 72, 1.5
core.action(trial, 'swap')
core.enterStoryNode(trial, 'night-trial-atlatl')
assert trial.active == 1 and trial.actors[2].hp == 0 and trial.travelerTrial.allyHp == 72
returned = restore(new_lua, new_core, save(core, trial))
assert returned.story.node == 'natlan-hub' and returned.active == 2
assert returned.actors[2].hp == 72 and returned.actors[2].cd.dodge == 1.5
assert returned.travelerTrial is None

bad_values = [
    ('nan HP', ('traveler', 'hp'), float('nan')),
    ('boolean HP', ('companion', 'hp'), True),
    ('negative HP', ('companion', 'hp'), -1),
    ('unknown skill', ('traveler', 'cooldowns'), {'unknown': 4}),
    ('infinite cooldown', ('traveler', 'cooldowns'), {'dodge': float('inf')}),
    ('negative cooldown', ('traveler', 'cooldowns'), {'dodge': -2}),
    ('illegal reserve', ('reserve',), {'beidou': {'hp': 65, 'cooldowns': {}}}),
    ('unknown reserve', ('reserve',), {'none': {'hp': 65, 'cooldowns': {}}}),
    ('invalid swap time', ('swap',), 2),
]
for label, path, value in bad_values:
    bad = deepcopy(saved)
    record = bad['partyCombat']
    for key in path[:-1]:
        record = record[key]
    record[path[-1]] = value
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError(label)

fixture = core.new(12)
core.action(fixture, 'story_start')
core.grantExp(fixture, LEVELS[15]['maple_reference_total_exp_to_reach'], 'quest')
fp = ROOT / 'work/party-checkpoint-opening.json'
fp.parent.mkdir(exist_ok=True)
fp.write_text(json.dumps(save(core, fixture)), encoding='utf8')

proof = {
    'fieldSaveReturnedToTown': True,
    'restoredParty': saved['partyCombat'],
    'activeActorAndGaugePreserved': True,
    'inFlightAttackCleared': True,
    'reserveCooldownAgesOnlyDuringPlay': True,
    'ordinaryTownVisitRestoresHp': True,
    'legacySaveLoaded': True,
    'downedActorStaysDown': True,
    'suspendedAllyRestoredAfterSoloTrialSave': True,
    'invalidCombatRecordsRejected': [label for label, _, _ in bad_values],
}
(ROOT/'evidence/party-checkpoint-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
print('Field checkpoint preserves effective party HP, cooldowns and reserve state across Lua runtimes.')
