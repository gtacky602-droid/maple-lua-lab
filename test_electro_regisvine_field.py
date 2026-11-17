import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, arena = 'sumeru-hub', 'electro-regisvine-field-cave'
boss_id, quest = 'boss-26020301', 'electro-regisvine-commission'
empty = lua.table()


def make(save_fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[61]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    core.action(state, 'story_accept:' + quest)
    assert state.story.quests[quest].status == 'active'
    if save_fixture:
        (ROOT / 'work').mkdir(exist_ok=True)
        fixture = validate_save(native(core.checkpoint(state)))
        (ROOT / 'work/electro-regisvine-field-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
    for x, node in ((1380, 'sumeru-field'), (1240, arena)):
        state.actors[1].x = x
        core.action(state, 'story_nearby_portal')
        assert state.story.node == node
    return state, state.fieldSlots[boss_id], state.actors[1]


state, slot, actor = make(save_fixture=True)
boss = slot.enemy
state.actors[2].hp = 0


def spot(x):
    actor.x, actor.y, actor.vy, actor.inv, actor.ground = x, 480, 0, 0, True


def wait(move, tick):
    for _ in range(2400):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(state, 1 / 60, empty)
    raise AssertionError((move, tick))


def normal(x, **props):
    return lua.table_from(dict(id=1, atk=20, x=x, y=480, dir=1, range=125, limit=1,
                               mult=1, element='physical', color='#fff0ac', gain=0, critRate=0) | props)


def hit(x, **props):
    core.resolveCast(state, normal(x, **props))


spot(boss.x - 108)
hp = boss.hp
hit(actor.x)
assert boss.hp == hp - 19 and boss.coreHits == 3
assert math.isclose(boss.hitBottom, 480 - .35 * 88)
slam = wait('FER01', 48)
assert slam.dir == -1
spot(boss.x + 130)
wait('FER01', 94)
assert slam.dir == -1
spot(boss.x - 130)
hp = actor.hp
wait('FER01', 96)
assert actor.hp == hp - 23 and slam.seen[1][1]
actor.inv = 0
wait('FER01', 155)
assert actor.hp == hp - 23
wait('FER01', 180)

spot(boss.x - 110)
bolts = wait('FER02', 42)
assert bolts.dir == -1
hp = actor.hp
for i, fired in enumerate((84, 132), 1):
    actor.inv = 0
    wait('FER02', fired + 20)
    assert bolts.shots[i] and actor.hp == hp - 14 * i
wait('FER02', 180)
assert not any(bolts.projectiles.values())

rain = wait('FER03', 48)
landings = [rain.landings[i] for i in (1, 2, 3)]
assert all(abs(a-b) >= .8 * 88 for a, b in zip(landings, landings[1:]))
for i, tick in enumerate((108, 150, 192), 1):
    spot(landings[i - 1])
    hp = actor.hp
    wait('FER03', tick - 1)
    assert actor.hp == hp
    wait('FER03', tick + 5)
    assert actor.hp == hp - 19 and rain.seen[i][1]
assert [rain.landings[i] for i in (1, 2, 3)] == landings
wait('FER03', 210)
standard, light = (core.frame(state, 'rect', profile) for profile in ('legacy', 'h32c16'))
assert standard.t == light.t and light.commands < standard.commands

spot(boss.x - 185)
wave = wait('FER01', 107)
hp = actor.hp
wait('FER01', 130)
assert wave.seen[1][1] and actor.hp == hp - 16
# Three distinct close physical casts cancel a live wave on the following
# field tick, while multiple pulses from one cast only count once.
near = normal(boss.x - 40)
for _ in range(4):
    core.resolveCast(state, near)
assert boss.coreHits == 2
hit(boss.x - 41)
hit(boss.x - 42)
assert boss.coreHits == 0 and slot.cast
core.step(state, 1 / 60, empty)
assert slot.cast is None and boss.down == 240
for _ in range(239):
    core.step(state, 1 / 60, empty)
assert boss.down == 1 and actor.hp == hp - 16
core.step(state, 1 / 60, empty)
assert boss.down == 0 and boss.rearm == 1200
actor.hp = actor.maxhp
for _ in range(1199):
    core.step(state, 1 / 60, empty)
assert boss.coreHits == 0 and boss.rearm == 1
core.step(state, 1 / 60, empty)
assert boss.coreHits == 3

spot(boss.x - 108)
wait('FER01', 107)
hit(boss.x - 40)
hit(boss.x - 40)
assert boss.coreHits == 1
boss.hp = 1
hit(boss.x - 40)
assert slot.phase == 'respawn' and slot.cast is None and boss.down == 0
assert state.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:' + quest)
assert (restored.progression.questXp - xp, restored.mora - mora) == (4000, 300)


def solo_normal():
    solo, encounter, player = make()
    solo.actors[2].hp = 0
    enemy = encounter.enemy
    start = solo.t
    jump = {'FER01': (74,), 'FER02': (73, 133), 'FER03': ()}
    for _ in range(120 * 60):
        if enemy.hp <= 0:
            return dict(seconds=round(solo.t - start, 2), hp=player.hp, coreHitsLeft=enemy.coreHits)
        cast = encounter.cast
        if cast and player.ground and cast.tick in jump[cast.move.id]:
            core.action(solo, 'jump')
        dx = enemy.x - player.x
        turn = player.dir < 0
        if cast and cast.move.id == 'FER03' and 132 <= cast.tick < 156:
            gap = cast.landings[2] - .475 * 88
            inputs = dict(right=player.x < gap - 3, left=player.x > gap + 3)
        else:
            inputs = dict(right=dx > 113 or (turn and dx >= 109), left=dx < 102 or (turn and dx < 109),
                          jump=True, attack=0 < dx < 125 and not turn)
        core.step(solo, 1 / 60, lua.table_from(inputs))
        assert solo.returns == 0
    raise AssertionError((enemy.hp, player.hp))


solo = solo_normal()
assert solo['coreHitsLeft'] == 3
result = dict(
    attacks=['FER01', 'FER02', 'FER03'], slamAndWaveSharedHit=True, waveHitsOutsideImpact=True,
    distinctBolts=True, fixedThreeColumns=True, distinctCastsToBreakCore=3,
    interruptCancelsLiveWave=True, downTicks=240, rearmTicks=1200, lethalHitTakesPriority=True,
    normalAttackSolo=solo, questReportOnce=True,
    commands=dict(standard=standard.commands, light=light.commands),
    killXp=LEVELS[61]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'])
(ROOT / 'evidence/electro-regisvine-field-lua.json').write_text(
    json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
