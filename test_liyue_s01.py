"""Play the Crux recovery quest and verify legacy kill contracts and joins."""
import json
from copy import deepcopy

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
q_id, delivery = 'beidou-join', 'liyue-market-delivery'
port, wharf, field = 'liyue-harbor', 'liyue-crux-wharf', 'liyue-field'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(i) for i in range(1, 20)), 'quest')
core.enterStoryNode(s, port)
seed = validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-s01-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def step(**keys):
    core.step(s, 1/60, lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(700):
        a = s.actors[s.active]
        if abs(a.x-x) < 8:
            return
        step(right=a.x < x, left=a.x > x, attack=attack)
    raise AssertionError(('walk', s.story.node, x))


def gate(dest):
    portal = core.frame(s).storyNearbyPortal
    assert portal and portal.to == dest and portal.available, native(portal)
    core.action(s, 'story_nearby_portal')
    assert s.story.node == dest


def fight(spawn):
    for _ in range(600):
        if not any(e.hp > 0 and e.spawnId == spawn for e in s.enemies.values()):
            return
        step(attack=True)
    raise AssertionError(('fight', spawn))


def load(checkpoint):
    return core.restore(lua.table_from(validate_save(checkpoint), recursive=True))


def save():
    return validate_save(native(core.checkpoint(s)))


def collect(id):
    nearby = core.frame(s).storyNearbyCargo
    assert nearby and nearby.id == id and not nearby.guarded, native(nearby)
    core.action(s, 'story_collect')
    assert s.story.quests[q_id].recovered[id]


core.action(s, 'story_accept:'+q_id)
core.action(s, 'story_select_joined:'+q_id)
assert not s.story.quests[q_id] and s.companion != 'beidou'
walk(570)
assert not core.frame(s).storyNearbyPortal.available
core.action(s, 'story_accept:'+delivery)
core.action(s, 'story_accept:'+q_id)
q = s.story.quests[q_id]
assert q.recovered is not None and q.count == s.story.quests[delivery].count == 0
legacy_seed = save()
gate(wharf)
walk(315)
assert core.frame(s).storyNearbyCargo.guarded
core.action(s, 'story_collect')
assert q.count == 0 and q.recovered.pier is None
fight('liyue-crux-pier')
for _ in range(380):
    step()
collect('pier')
assert q.count == 1
core.action(s, 'story_collect')
assert q.count == 1

partial = save()
bad = deepcopy(partial)
bad['story']['quests'][q_id]['recovered']['ledge'] = True
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('Count and recovered checkpoints disagreed')
s = load(partial)
walk(570)
gate(wharf)
assert not any(e.spawnId == 'liyue-crux-pier' for e in s.enemies.values())
q = s.story.quests[q_id]
walk(975, attack=True)
assert not core.frame(s).storyNearbyCargo
core.action(s, 'jump')
for _ in range(120):
    step(jump=True)
    if s.actors[s.active].ground and s.actors[s.active].y == 382:
        break
fight('liyue-crux-ledge')
collect('ledge')
core.action(s, 'drop')
for _ in range(60):
    step()
walk(690, attack=True)
fight('liyue-crux-rocks')
collect('rocks')
assert q.count == 3
assert len(s.actors) == 2 and s.companion != 'beidou'
assert any(d.text == '北斗' for d in core.frame(s, 'sprite').draws.values())
assert {e.spawnId for e in s.enemies.values()} == {'liyue-crux-return'}
s = load(save())
walk(570)
gate(wharf)
q = s.story.quests[q_id]
assert q.count == 3 and len(s.enemies) == 1
walk(260, attack=True)
fight('liyue-crux-return')
assert q.count == 4 and q.status == 'active'
core.action(s, 'story_report:'+q_id)
assert q.status == 'active'
walk(70)
gate(port)
before, xp = s.mora, s.progression.questXp
core.action(s, 'story_report:'+q_id)
core.action(s, 'story_report:'+q_id)
assert (q.status, q.cycles, s.mora, s.progression.questXp) == ('complete', 1, before+150, xp+3825)
assert core.frame(s).storyJoined.beidou and s.companion != 'beidou'
core.action(s, 'story_select_joined:'+q_id)
assert core.frame(s).companion.id == 'beidou' and len(s.actors) == 2
s = load(save())
assert core.frame(s).companion.id == 'beidou'
walk(570)
gate(wharf)
assert len(s.enemies) == 0

for initial in (2, 4):
    legacy = deepcopy(legacy_seed)
    legacy['story']['quests'][q_id] = {
        'status': 'active' if initial == 2 else 'complete',
        'count': initial, 'cycles': 0 if initial == 2 else 1,
    }
    s = load(legacy)
    q = s.story.quests[q_id]
    assert q.count == initial and q.recovered is None
    if initial == 2:
        walk(570)
        assert not core.frame(s).storyNearbyPortal.available
        walk(1380)
        gate(field)
        walk(510, attack=True)
        fight('liyue-field-2')
        walk(740, attack=True)
        fight('liyue-field-1')
        assert q.count == 4
        walk(60)
        gate(port)
        core.action(s,'story_report:'+q_id)
    assert core.frame(s).storyJoined.beidou
    save()

(ROOT/'evidence/liyue-s01-lua.json').write_text(json.dumps({
    'available_before_m01_report': True, 'three_guarded_items_and_elevation': True,
    'partial_recovery_and_return_enemy_restore': True, 'beidou_story_npc': True,
    'report_does_not_replace_current_companion': True,
    'story_join_selection_persists': True, 'safe_revisit': True,
    'legacy_active_and_complete': True, 'reward_once': {'xp': 3825, 'mora': 150},
}, indent=2)+'\n', encoding='utf8')
print('Crux recovery, return fight, join and legacy checkpoints passed')
