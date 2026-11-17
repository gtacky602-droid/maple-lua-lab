import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, LEVELS[45]['maple_reference_total_exp_to_reach'], 'quest')
hub, arena = 'enkanomiya-camp', 'bathysmal-field-sanctum'
encounter, quest = 'bathysmal-herd', 'bathysmal-commission'
core.enterStoryNode(state, hub)
core.action(state, 'story_accept:' + quest)
assert state.story.quests[quest].status == 'active'
(ROOT / 'work').mkdir(exist_ok=True)
(ROOT / 'work/bathysmal-field-fixture.json').write_text(
    json.dumps(validate_save(native(core.checkpoint(state)))), encoding='utf8')
player = state.actors[1]
for position, node in ((1380, 'enkanomiya-depth'), (1375, arena)):
    player.x = position
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node

state.actors[2].hp = 0
slot = state.fieldSlots[encounter]
ice, lightning = slot.enemy, slot.enemy.fieldPartner
empty = lua.table()
initial_hp = ice.hp
assert len(state.enemies) == 2 and lightning.hp == initial_hp == 1120


def spot(position):
    player.x, player.y, player.inv, player.vy, player.ground = position, 480, 0, 0, True


def wait(move, tick):
    for _ in range(2200):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(state, 1 / 60, empty)
    raise AssertionError((move, tick))


def cast(element, **adjustments):
    params = dict(id=1, key='test:' + element, atk=20, x=ice.x, y=480, dir=1,
                  range=330, radial=True, limit=4, mult=1, element=element,
                  color='#fff0ac', gain=0, critRate=0)
    return lua.table_from(params | adjustments)


def hit(element, **adjustments):
    core.resolveCast(state, cast(element, **adjustments))


hit('dendro', targetId=lightning.id)
assert ice.hp == lightning.hp == initial_hp - 19
assert ice.aura is None and lightning.aura.element == 'dendro'
before = ice.hp
wide = cast('pyro', x=lightning.x-15, limit=1)
core.resolveCast(state, wide)
core.resolveCast(state, wide)
assert ice.hp == lightning.hp == before - 38
assert ice.aura.element == 'pyro' and lightning.aura.element == 'dendro'
assert not lightning.burning

# With the lower-ID body behind the other in the sweep, the intersected
# body takes the single hit and its own elemental application.
origin_ice, origin_lightning = ice.x, lightning.x
ice.x, lightning.x = 800, 750
before = ice.hp
hit('hydro', x=790, range=90, travelSpeed=320, lastPulseX=610)
assert ice.hp == lightning.hp == before - 19
assert ice.aura.element == 'pyro' and lightning.aura.element == 'hydro'
before = ice.hp
hit('physical', x=740, chain=100)
assert ice.hp == lightning.hp == before - 19
contact = cast('physical', targetId=ice.id, contactBudget=1)
core.resolveCast(state, contact)
contact.targetId = lightning.id
core.resolveCast(state, contact)
assert ice.hp == lightning.hp == before - 38
ice.x, lightning.x = origin_ice, origin_lightning

spot(ice.x - 88)
tail = wait('FBH01', 42)
assert tail.chosen == 1
spot(lightning.x)
hp = player.hp
wait('FBH01', 90)
assert player.hp == hp and not tail.seen[1][1]
spot(ice.x + 60)
wait('FBH01', 91)
assert player.hp == hp - 19
wait('FBH01', 108)
assert player.hp == hp - 19
spot(ice.x - 98)
volley = wait('FBH02', 48)
assert volley.starts[1] == ice.x and volley.starts[2] == lightning.x
assert (player.x - ice.x)*volley.dir > 0 and (player.x - lightning.x)*volley.dir > 0
hp = player.hp
wait('FBH02', 137)
assert volley.shots[1] and not volley.projectiles[2] and player.hp == hp - 14
wait('FBH02', 138)
assert volley.projectiles[1] is None
wait('FBH02', 209)
assert volley.shots[2] and player.hp == hp - 28
wait('FBH02', 210)
assert volley.projectiles[2] is None

relay = wait('FBH03', 54)
landings = [relay.landings[i] for i in (1, 2)]
assert math.isclose(abs(landings[1] - landings[0]), 1.3*88)
assert all(abs(relay.starts[i]-landings[i-1]) <= 1.4*88 for i in (1, 2))
spot(landings[1])
wait('FBH03', 96)
assert ice.y == 400 and lightning.y == 480
before = ice.hp
hit('physical', targetId=ice.id)
assert ice.hp == before
hit('physical', targetId=lightning.id, x=lightning.x)
assert ice.hp == lightning.hp == before - 19
spot(landings[0])
hp = player.hp
wait('FBH03', 113)
assert player.hp == hp
wait('FBH03', 114)
assert player.hp == hp - 21 and ice.x == landings[0] and ice.y == 480
spot(landings[1])
wait('FBH03', 216)
assert ice.y == 480 and lightning.y == 400
wait('FBH03', 234)
assert player.hp == hp - 42 and lightning.x == landings[1] and lightning.y == 480
wait('FBH03', 270)
frame = core.frame(state, 'sprite', 'legacy')
assert len(frame.fieldBoss.bodies) == 2 and frame.fieldBoss.hp == ice.hp
legacy, light = (core.frame(state, 'rect', profile) for profile in ('legacy', 'h32c16'))
assert legacy.t == light.t and legacy.commands > light.commands
spot(lightning.x + 50)
tail = wait('FBH01', 42)
assert tail.chosen == 2

before = ice.hp
core.enterStoryNode(state, hub)
assert slot.cast is None and ice.hp == lightning.hp == before
core.enterStoryNode(state, arena)
assert len(state.enemies) == 2 and ice.hp == lightning.hp == before
ice.hp = 1
mora, kills = state.mora, state.kills
hit('physical', targetId=lightning.id, x=lightning.x)
hit('physical', targetId=ice.id)
assert ice.hp == lightning.hp == 0 and slot.phase == 'respawn' and slot.cast is None
assert (state.mora - mora, state.kills - kills) == (195, 1)
assert state.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][encounter]['waitTicks'] == 3600
restored = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:' + quest)
assert (restored.progression.questXp - xp, restored.mora - mora) == (4000, 300)
state.t = slot.waitUntil - 1 / 60
core.step(state, 1 / 60, empty)
assert slot.generation == 2 and len(state.enemies) == 2
assert slot.enemy.hp == slot.enemy.fieldPartner.hp == initial_hp
result = dict(
    attacks=['FBH01', 'FBH02', 'FBH03'],
    fixedSharedHp=initial_hp, separateAuras=True, simultaneousHitCountedOnce=True,
    successivePulsesCounted=True, directedSweptContact=True, noExtraChainHit=True,
    sharedContactBudget=True, independentAttackWindows=True, alternatingAirborne=True,
    escapeCancelsCast=True, bothRespawnTogether=True, oneKillAndReport=True,
    commands=dict(standard=legacy.commands, light=light.commands),
    killXp=LEVELS[45]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'])
(ROOT / 'evidence/bathysmal-field-lua.json').write_text(
    json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
