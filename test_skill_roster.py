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
combat_profiles = {}
trace_casts = lua.execute("""
return function(C, record)
 local onCastBuilt=C.onCastBuilt
 local profile
 function C.onCastBuilt(s,a,cast,delay,lock,definition)
  onCastBuilt(s,a,cast,delay,lock,definition)
  profile={pct=cast.mult*100,hits=cast.contactBudget or cast.remaining,
   targets=cast.limit,delay=delay,interval=cast.interval}
 end
 local attack=C.attack
 function C.attack(s,a,key)
  profile=nil
  local pendingBefore=#s.pending
  local accepted=attack(s,a,key)
  if accepted then
   if not profile then
    local cast
    if a.id==2 and key=='skill1' and s.companion=='beidou' then cast=a.counterCast
    elseif #s.pending>pendingBefore then cast=s.pending[#s.pending] end
    if cast then
     profile={pct=cast.mult*100,hits=cast.remaining,targets=cast.limit,
      delay=cast.next-s.t,interval=cast.interval}
    end
   end
   record(a.id,key,a.cd[key],a.lock,profile)
  end
  return accepted
 end
end
""")


def record(actor, key, cooldown, lock, profile):
    events.append((actor, key))
    data = {field: round(value, 6) for field, value in profile.items()} if profile else {}
    combat_profiles[actor, key] = dict(cooldown=cooldown, lock=lock, **data)


trace_casts(core, record)
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


def targets(state, node='mond-road'):
    core.enterStoryNode(state, node)
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
    targets(state, 'white-pass-woods' if id == 'SK46' else 'mond-road')
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
    profile = combat_profiles[1, key]
    assert profile['cooldown'] == row['cooldown_seconds'], (id, profile)
    if 'hits' in profile and id != 'SK59':
        segment = row['damage_segments'][0]
        assert profile['pct'] == segment['pct_per_hit'], (id, profile)
        assert profile['hits'] == segment['hit_count'], (id, profile)
        assert profile['targets'] == row['max_enemy_targets'], (id, profile)
    if int(id[2:]) <= 53:
        if row['unlock_level'] > 1:
            low = story(row['unlock_level']-1)
            assert core.growthSkillCondition(low, id)[0] is False, id
        missing = next((element for element in row['elements'] if element != '風'), None)
        if missing:
            early = story(200, except_element=missing)
            blocked, reason = core.growthSkillCondition(early, id)
            assert not blocked and missing in reason, (id, reason)
    return dict(input=key, level=row['unlock_level'], acceptedInBattle=True, profile=profile)


def companion(owner, rows):
    tried = {}
    timings = {}
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
        profile = combat_profiles[2, key]
        expected = dict(cooldown=row['cooldown_s'], lock=row['action_lock_s'])
        if row['hit_count']:
            expected.update(pct=row['pct_per_hit'], hits=row['hit_count'], targets=row['max_targets'],
                            delay=row['first_hit_s'], interval=row['hit_interval_s'])
        assert all(profile.get(field) == value for field, value in expected.items()), (
            row['id'], expected, profile,
        )
        timings[row['id']] = profile

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
    return dict(inputs=tried, profiles=timings, reloadedOwner=True, autonomousInput=True)


if __name__ == '__main__':
    travelers = {row['id']: traveler(row) for row in catalog if row['owner'] == 'traveler'}
    companions = {
        owner: companion(owner, [row for row in catalog if row['owner'] == owner])
        for owner in dict.fromkeys(row['owner'] for row in catalog if row['owner'] != 'traveler')
    }
    assert len(travelers) == 60 and sum(len(row['inputs']) for row in companions.values()) == 40
    fixed_profiles = sum(id != 'SK59' and 'hits' in row['profile'] for id, row in travelers.items())
    companion_strikes = sum(
        'hits' in profile for row in companions.values() for profile in row['profiles'].values()
    )
    assert fixed_profiles == 48 and companion_strikes == 34
    proof = dict(traveler=travelers, companions=companions,
                 scope='Prepared regional visits, levels and combat targets. Includes cooldown at activation, configured cast profiles and one autonomous action per companion. The cast profile does not count actual hits or apply damage modifiers; conditional followups have separate tests.')
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
    print('60 Traveler and 40 companion cooldowns matched. Cast profiles matched for 48 Traveler and 34 companion attacks.')
