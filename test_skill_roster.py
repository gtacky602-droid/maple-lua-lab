"""Exercise the approved skill roster through the actual loadout and companion inputs."""

import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
catalog = json.loads((ROOT / 'content/skill-catalog.json').read_text(encoding='utf8'))['skills']
hubs = dict(風='mond-town', 岩='liyue-harbor', 雷='inazuma-town', 草='sumeru-hub',
            水='fontaine-hub', 炎='natlan-hub', 氷='snezhnaya-hub')
partners = {'SK54': 'columbina', 'SK55': 'columbina', 'SK56': 'wanderer', 'SK57': 'beidou'}
inputs = ('normal', 'skill1', 'skill2', 'skill3', 'skill4')
amber_inputs = ('normal', 'skill1', 'skill3', 'skill4', 'skill2')
aliases = {'SK01': 'skill1', 'SK02': 'skill2'}
events = []
lua.execute("""
return function(C, record)
 local attack=C.attack
 function C.attack(s,a,key)
  local accepted=attack(s,a,key)
  if accepted then record(a.id,key) end
  return accepted
 end
end
""")(core, lambda actor, key: events.append((actor, key)))
idle = lua.table()


def step(state, ticks=1):
    for _ in range(ticks):
        core.step(state, 1/60, idle)


def story(level, *, except_element=None):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level-1]['maple_reference_total_exp_to_reach'], 'quest')
    for element, hub in hubs.items():
        if element != except_element:
            core.enterStoryNode(state, hub)
    core.enterStoryNode(state, 'nod-town')
    core.enterStoryNode(state, 'mond-town')
    return state


def targets(state):
    core.enterStoryNode(state, 'mond-road')
    for actor in state.actors.values():
        actor.x, actor.inv, actor.dir = 230, 1000, 1
    state.enemies = lua.table_from([
        {'id': i, 'x': x, 'home': x, 'y': 480, 'kind': 1, 'hp': 100000,
         'maxhp': 100000, 'custom': True, 'noRewards': True, 'respawn': 0, 'cd': 999}
        for i, x in enumerate((265, 300, 340), 1)
    ], recursive=True)


def configure(state, *sequences):
    slots = [list(seq) for seq in sequences]
    slots.extend([] for _ in range(8-len(slots)))
    accepted, reason = core.configure(state, lua.table_from(slots, recursive=True))
    assert accepted, reason


def traveler(row):
    id = row['id']
    state = story(row['unlock_level'])
    assert core.growthSkillCondition(state, id) is True
    if id in partners:
        core.action(state, 'companion:' + partners[id])
    configure(state, [id], ['SK58', 'SK09'] if id == 'SK59' else [])
    targets(state)
    state.actors[2].lock = 999
    state.gauge = 100
    if id == 'SK34':
        core.action(state, 'jump')
        step(state, 4)
        assert not state.actors[1].ground
    elif id == 'SK45':
        state.actors[1].hp -= 20
        state.enemies[1].burning = lua.table(owner=1, atk=10, next=state.t+1, remaining=4)
    if id == 'SK59':
        core.action(state, 'slot2')
        step(state, 65)
        assert state.echoSource and state.actors[1].light > 0
    events.clear()
    core.action(state, 'slot1')
    step(state)
    key = aliases.get(id, id)
    if id in ('SK58', 'SK59', 'SK60'):
        assert (state.actors[1].cd[id] or 0) > 0, id
    else:
        assert (1, key) in events, (id, state.skillNotice)
    assert state.macro is None, id
    if int(id[2:]) <= 53:
        if row['unlock_level'] > 1:
            low = story(row['unlock_level']-1)
            assert core.growthSkillCondition(low, id)[0] is False, id
        missing = next((element for element in row['elements'] if element != '風'), None)
        if missing:
            early = story(200, except_element=missing)
            blocked, reason = core.growthSkillCondition(early, id)
            assert not blocked and missing in reason, (id, reason)
    return dict(input=key, level=row['unlock_level'], acceptedInBattle=True)


def companion(owner, rows):
    tried = {}
    for row, key in zip(rows, amber_inputs if owner == 'amber' else inputs, strict=True):
        state = story(200)
        core.action(state, 'companion:' + owner)
        targets(state)
        core.action(state, 'swap')
        assert state.active == 2
        state.actors[1].lock = 999
        if owner == 'wanderer' and key == 'skill2':
            core.action(state, 'skill1')
            step(state, 30)
            assert state.actors[2].floatUntil > state.t
        if owner == 'emilie' and key == 'skill3':
            state.enemies[1].burning = lua.table(owner=1, atk=10, next=state.t+1, remaining=4)
        events.clear()
        core.action(state, key)
        assert (2, key) in events, (owner, key, state.skillNotice)
        tried[row['id']] = key

    state = story(200)
    core.action(state, 'companion:' + owner)
    snapshot = validate_save(native(core.checkpoint(state)))
    state = core.restore(lua.table_from(snapshot, recursive=True), 12)
    assert state.companion == owner
    targets(state)
    events.clear()
    for _ in range(120):
        if any(actor == 2 for actor, _ in events):
            break
        step(state)
    assert any(actor == 2 for actor, _ in events), owner
    return dict(inputs=tried, reloadedOwner=True, autonomousInput=True)


if __name__ == '__main__':
    travelers = {row['id']: traveler(row) for row in catalog if row['owner'] == 'traveler'}
    companions = {
        owner: companion(owner, [row for row in catalog if row['owner'] == owner])
        for owner in dict.fromkeys(row['owner'] for row in catalog if row['owner'] != 'traveler')
    }
    assert len(travelers) == 60 and sum(len(row['inputs']) for row in companions.values()) == 40
    proof = dict(traveler=travelers, companions=companions,
                 scope='Prepared regional visits, levels and combat targets. Records accepted player casts and one autonomous action per companion. Damage balance and all fight matchups are outside this probe.')
    (ROOT/'evidence/skill-roster-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8',
    )
    opening = core.new(12)
    core.action(opening, 'story_start')
    core.grantExp(opening, LEVELS[19]['maple_reference_total_exp_to_reach'], 'quest')
    configure(opening, ['SK05'], ['SK01', 'SK02'])
    (ROOT/'work/skill-unlock-lv20-ready.json').write_text(
        json.dumps(validate_save(native(core.checkpoint(opening)))), encoding='utf8',
    )
    print('60 Traveler and 40 companion skills accepted in combat; eight companions acted autonomously after save restore.')
