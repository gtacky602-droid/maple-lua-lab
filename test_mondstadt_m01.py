"""Play the first Mondstadt story quest and exercise older checkpoint shapes."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
QUEST = 'amber-join'
s = core.new(12)
core.action(s, 'story_start')
core.action(s, 'companion:beidou')
core.action(s, 'story_accept:' + QUEST)
quest = s.story.quests[QUEST]
assert not core.frame(s).storyJoined.amber
core.action(s, 'story_report:' + QUEST)
assert quest.status == 'active' and s.mora == 0


def step(**inputs):
    core.step(s, 1/60, lua.table_from(inputs))


def walk(x, attack=False):
    for _ in range(720):
        actor = s.actors[s.active]
        if abs(actor.x - x) < 8:
            return
        step(right=actor.x < x, left=actor.x > x, attack=attack)
    raise AssertionError(('could not walk to', x))


def collect(item):
    frame = core.frame(s)
    assert frame.storyNearbyCargo and frame.storyNearbyCargo.id == item
    core.action(s, 'story_collect')
    assert quest.recovered[item]
    # Picking up a box twice cannot count another box.
    recorded = dict(quest.recovered.items())
    core.action(s, 'story_collect')
    assert dict(quest.recovered.items()) == recorded


walk(1330)
core.action(s, 'story_nearby_portal')
assert s.story.node == 'mond-road'
core.action(s, 'story_collect')
assert len(list(quest.recovered.items())) == 0
walk(465, attack=True)
core.action(s, 'skill1')
for x in (500, 835, 1080):
    if quest.count >= 3:
        break
    walk(x, attack=True)
    for _ in range(180):
        if quest.count >= 3:
            break
        step(attack=True)
assert quest.count == 3, native(core.frame(s))
assert s.kills >= 3 and not core.frame(s).storyJoined.amber
core.action(s, 'story_collect')
assert len(list(quest.recovered.items())) == 0
walk(335)
collect('basket')
partial = validate_save(native(core.checkpoint(s)))
restored = core.restore(lua.table_from(partial, recursive=True))
assert restored.story.node == 'mond-town' and restored.story.quests[QUEST].recovered.basket
assert restored.story.quests[QUEST].count == 3

walk(650)
core.action(s, 'story_collect')
assert not quest.recovered.toolbox
core.action(s, 'jump')
for _ in range(90):
    step(jump=True)
    if s.actors[s.active].ground and s.actors[s.active].y == 390:
        break
collect('toolbox')
walk(975)
for _ in range(30):
    step()
collect('crate')
chase = next(enemy for enemy in s.enemies.values() if enemy.spawnId == 'mond-road-1')
assert chase.home == 1210 and chase.x >= 1130
walk(1165, attack=True)
for _ in range(420):
    if quest.count == 4:
        break
    step(attack=True)
assert quest.count == 4
assert not core.frame(s).storyJoined.amber
before = s.mora
core.action(s, 'story_report:' + QUEST)
assert s.mora == before and quest.status == 'active'
walk(110)
core.action(s, 'story_nearby_portal')
assert s.story.node == 'mond-town'
before, xp = s.mora, s.progression.questXp
core.action(s, 'story_report:' + QUEST)
core.action(s, 'story_report:' + QUEST)
assert (s.mora, s.progression.questXp) == (before+100, xp+1000)
assert core.frame(s).storyJoined.amber and core.frame(s).companion.id == 'beidou'
complete = validate_save(native(core.checkpoint(s)))
restored = core.restore(lua.table_from(complete, recursive=True))
assert core.frame(restored).storyJoined.amber
assert restored.story.quests[QUEST].cycles == 1
assert len(list(restored.story.quests[QUEST].recovered.items())) == 3

for state in ({'status':'active','count':3,'cycles':0}, {'status':'complete','count':4,'cycles':1}):
    legacy = deepcopy(complete)
    legacy['story']['quests'][QUEST] = state
    restored = core.restore(lua.table_from(validate_save(legacy), recursive=True))
    previous = restored.mora
    if state['status'] == 'active':
        core.enterStoryNode(restored,'mond-road')
        core.onKill(restored,restored.enemies[2])
        core.action(restored,'story_fast:mond-town')
    core.action(restored,'story_report:' + QUEST)
    assert core.frame(restored).storyJoined.amber
    assert restored.mora - previous == (100 if state['status']=='active' else 0)

for invalid in ({'basket':True}, {'unknown':True}, {'basket':False,'toolbox':True,'crate':True}):
    bad = deepcopy(complete)
    bad['story']['quests'][QUEST]['recovered'] = invalid
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError(f'Accepted invalid cargo: {invalid}')

checks={'regular_combat':True,'three_cargo_items':True,'toolbox_jump':True,'chase':True,
        'early_and_remote_report_rejected':True,'duplicate_reward_rejected':True,
        'restored_partial_and_complete':True,'legacy_active_and_complete':True,
        'selected_companion_unchanged':True}
(ROOT/'evidence/mondstadt-m01-lua.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf8')
print('Mondstadt M01 combat, cargo, join and legacy saves passed')
