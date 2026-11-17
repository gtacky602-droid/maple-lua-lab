import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
has_cached_pose = lua.eval("function(poses, name) return rawget(poses, name) ~= nil end")
assert not has_cached_pose(core.ruinSerpentFieldArt, 'idle')
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, LEVELS[23]['maple_reference_total_exp_to_reach'], 'quest')
hub = 'chasm-camp'
quest = 'ruin-serpent-commission'
boss_id = 'boss-24010401'
arena = 'ruin-serpent-field-pit'
core.enterStoryNode(state, hub)
core.action(state, 'story_accept:' + quest)
assert state.story.quests[quest].status == 'active'
(ROOT / 'work').mkdir(exist_ok=True)
(ROOT / 'work/ruin-serpent-field-fixture.json').write_text(
    json.dumps(validate_save(native(core.checkpoint(state)))), encoding='utf8')
actor = state.actors[1]
for x, node in ((1220, 'chasm-depth'), (890, 'chasm-wp-25264'), (1360, arena)):
    actor.x = x
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node

slot = state.fieldSlots[boss_id]
boss = slot.enemy
state.actors[2].hp = 0
empty = lua.table()
source = 'ruin-serpent-field-poses-source-v1.png'


def spot(x):
    actor.x, actor.y, actor.inv, actor.vy, actor.ground = x, 480, 0, 0, True


def wait(move, tick, limit=1800):
    for _ in range(limit):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(state, 1 / 60, empty)
    raise AssertionError((move, tick))


def hit(element='physical', y=480):
    core.resolveCast(state, lua.table_from(dict(
        id=1, key='test:' + element, atk=20, x=boss.x-40, y=y, dir=1,
        range=125, limit=1, mult=1, element=element, color='#fff0ac', gain=1)))


def pose_visible():
    return any(draw.source == source for draw in core.frame(state, 'sprite', 'legacy').draws.values())


spot(boss.x - 100)
core.step(state, 1 / 60, empty)
assert pose_visible() and has_cached_pose(core.ruinSerpentFieldArt, 'idle')
assert not has_cached_pose(core.wolflordFieldArt, 'idle')
hp = boss.hp
hit()
assert boss.hp == hp - 19 and math.isclose(480 - boss.hitBottom, .3 * 88)
roll = wait('FRS01', 48)
assert roll.dir == -1
spot(boss.x + 90)
hp = actor.hp
wait('FRS01', 108)
assert actor.hp == hp and not roll.seen[1][1]
spot(boss.x - 90)
wait('FRS01', 109)
assert actor.hp == hp - 14 and roll.seen[1][1]
wait('FRS01', 132)
assert actor.hp == hp - 14

spot(boss.x - 99)
burrow = wait('FRS02', 54)
origin, target = boss.x, burrow.dest
assert 0 < origin - target <= 1.6 * 88
hit('hydro')
spot(origin + 100)
wait('FRS02', 77)
assert boss.x == origin and not boss.underground and pose_visible()
wait('FRS02', 78)
assert boss.underground and not pose_visible() and not core.canTargetEnemy(boss)
frame = core.frame(state, 'sprite', 'legacy')
assert frame.fieldBoss.underground and frame.actors[1].hp == actor.hp
hp = boss.hp
hit()
hit('cryo', y=435)
assert boss.hp == hp and boss.aura.element == 'hydro'
for tick in range(79, 114):
    wait('FRS02', tick)
    assert boss.x == origin and burrow.dest == target and boss.underground and not pose_visible()
wait('FRS02', 114)
assert boss.x == target and pose_visible() and core.canTargetEnemy(boss)
spot(target)
hp = actor.hp
wait('FRS02', 137)
assert actor.hp == hp
wait('FRS02', 138)
assert actor.hp == hp - 18
wait('FRS02', 150)
assert actor.hp == hp - 18
wait('FRS02', 168)
hp = boss.hp
hit()
assert boss.hp == hp - 19

spot(boss.x - 94)
bombs = wait('FRS03', 48)
landings = list(bombs.landings.values())
assert len(landings) == 3
assert all(abs(a-b) >= .8 * 88 for a, b in zip(landings, landings[1:]))
for i, tick in enumerate((108, 150, 192), 1):
    spot(landings[i-1])
    hp = actor.hp
    wait('FRS03', tick - 1)
    assert actor.hp == hp
    wait('FRS03', tick + 5)
    assert actor.hp == hp - 11 and bombs.seen[i][1]
assert list(bombs.landings.values()) == landings
wait('FRS03', 210)
standard = core.frame(state, 'rect', 'legacy')
light = core.frame(state, 'rect', 'h32c16')
assert standard.t == light.t and light.commands < standard.commands

# The non-burrow moves wrap in between the two burrows. An existing
# Burning application can kill while the boss has no targetable body.
spot(boss.x + 90)
wait('FRS01', 156)
spot(boss.x + 90)
wait('FRS02', 30)
hit('dendro')
hit('pyro')
assert boss.burning and boss.burning.remaining == 4
wait('FRS02', 78)
assert boss.underground and boss.burning
boss.hp = 1
for _ in range(36):
    core.step(state, 1 / 60, empty)
    if slot.phase == 'respawn':
        break
assert slot.phase == 'respawn' and slot.cast is None and boss.underground
assert state.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert 3599 <= saved['fieldBosses'][boss_id]['waitTicks'] <= 3600
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == hub
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:' + quest)
assert (restored.progression.questXp - xp, restored.mora - mora) == (4000, 300)
result = {
    'attacks': ['FRS01', 'FRS02', 'FRS03'],
    'hiddenTicks': 36, 'visibleBeforeImpactTicks': 24,
    'lockedEmergence': True, 'threeIndependentFixedLandings': True,
    'burningCanKillUnderground': True, 'physicalReachesHeadAtRest': True,
    'unrelatedFieldArtStaysUnloaded': True,
    'commands': {'standard': standard.commands, 'light': light.commands},
    'questReportOnce': True,
    'killXp': LEVELS[23]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'],
}
(ROOT / 'evidence/ruin-serpent-field-lua.json').write_text(
    json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
