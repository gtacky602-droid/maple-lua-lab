import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, arena = 'sumeru-hub', 'aeonblight-field-chamber'
boss_id, quest = 'boss-24030301', 'aeonblight-commission'
empty = lua.table()


def make(browser_fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[65]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    core.action(state, 'story_accept:' + quest)
    assert state.story.quests[quest].status == 'active'
    if browser_fixture:
        (ROOT / 'work').mkdir(exist_ok=True)
        snapshot = validate_save(native(core.checkpoint(state)))
        (ROOT / 'work/aeonblight-field-fixture.json').write_text(json.dumps(snapshot), encoding='utf8')
    for x, node in ((1380, 'sumeru-field'), (480, arena)):
        state.actors[1].x = x
        core.action(state, 'story_nearby_portal')
        assert state.story.node == node
    return state, state.fieldSlots[boss_id], state.actors[1]


state, slot, actor = make(browser_fixture=True)
boss = slot.enemy
state.actors[2].hp = 0


def spot(x):
    actor.x, actor.y, actor.inv, actor.vy, actor.ground = x, 480, 0, 0, True


def wait(move, tick, limit=2500):
    for _ in range(limit):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        core.step(state, 1 / 60, empty)
    raise AssertionError((move, tick))


def strike(x, **values):
    return lua.table_from(dict(id=1, atk=20, x=x, y=480, dir=1, range=125, limit=1,
                               mult=1, element='physical', color='#fff0ac', gain=0, critRate=0) | values)


spot(boss.x - 106)
old = boss.hp
core.resolveCast(state, strike(actor.x))
assert math.isclose(480 - boss.hitBottom, .4 * 88)
assert boss.hp == old - 19
wings = wait('FAD01', 48)
assert wings.dir == -1
spot(boss.x + 100)
hp = actor.hp
wait('FAD01', 96)
assert actor.hp == hp
spot(boss.x - 95)
wait('FAD01', 97)
assert actor.hp == hp - 20 and wings.seen[1][1]
actor.inv = 0
wait('FAD01', 161)
assert actor.hp == hp - 40 and wings.seen[2][1]

spot(boss.x - 115)
wait('FAD02', 47)
assert boss.weakpoint is None
cannon = wait('FAD02', 48)
point = boss.weakpoint
assert cannon.dir == -1
assert math.isclose(480 - point.y, .6 * 88) and math.isclose(point.radius, .18 * 88)
misses_core = strike(boss.x + 120, dir=-1)
before = boss.hp
assert not core.hitFieldWeakpoint(misses_core, boss)
core.resolveCast(state, misses_core)
assert boss.hp == before - 19 and boss.weakpoint and boss.stagger == 0
hp = actor.hp
for i, fire in enumerate((90, 126, 162), 1):
    actor.inv = 0
    wait('FAD02', fire + 20)
    assert cannon.shots[i] and actor.hp == hp - 14 * i
assert boss.weakpoint is None
wait('FAD02', 210)
assert not any(cannon.projectiles.values())

spot(boss.x - 145)
charge = wait('FAD03', 60)
dest, origin = charge.dest, boss.x
assert 0 < origin - dest <= 2.2 * 88
spot(boss.x + 108)
wait('FAD03', 102)
assert boss.y == 408 and boss.x == origin and charge.dest == dest
before = boss.hp
core.resolveCast(state, strike(boss.x - 95))
assert boss.hp == before
core.resolveCast(state, strike(boss.x - 95, y=boss.y))
assert boss.hp == before - 19
spot(dest)
hp = actor.hp
wait('FAD03', 143)
assert boss.x == dest and boss.y == 480 and actor.hp == hp - 25
wait('FAD03', 168)
assert actor.hp == hp - 25
standard, light = (core.frame(state, 'rect', profile) for profile in ('legacy', 'h32c16'))
assert light.t == standard.t and light.commands < standard.commands

actor.hp = actor.maxhp
spot(boss.x - 118)
wait('FAD01', 180)
spot(boss.x - 178)
live = wait('FAD02', 94)
assert live.projectiles[1] and not live.shots[1]
grounded = strike(boss.x - 104)
before = boss.hp
assert core.hitFieldWeakpoint(grounded, boss)
core.resolveCast(state, grounded)
assert boss.hp == before - 19
assert boss.stagger == 150 and slot.cast is None and boss.weakpoint is None
core.resolveCast(state, grounded)
assert boss.hp == before - 38 and boss.stagger == 150
for _ in range(149):
    core.step(state, 1 / 60, empty)
assert (boss.stagger, boss.rise, slot.cast) == (1, 0, None)
core.step(state, 1 / 60, empty)
assert (boss.stagger, boss.rise, boss.coreRearm) == (0, 24, 1200)
for _ in range(24):
    core.step(state, 1 / 60, empty)
assert boss.rise == 0 and boss.coreRearm == 1176
wait('FAD03', 60)
spot(boss.x + 108)
wait('FAD03', 168)
spot(boss.x + 105)
wait('FAD02', 48)
assert boss.coreRearm > 0 and boss.weakpoint is None
actor.hp = actor.maxhp

later = wait('FAD02', 92)
if not boss.weakpoint:
    later = wait('FAD02', 48)
    later = wait('FAD02', 92)
assert boss.weakpoint and later.projectiles[1]
direction = later.dir
edge = strike(boss.x + direction*200, dir=-direction, range=180)
assert core.hitFieldWeakpoint(edge, boss)
boss.hp = 1
core.resolveCast(state, edge)
assert slot.phase == 'respawn' and slot.cast is None and boss.stagger == 0
assert boss.weakpoint is None and state.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:' + quest)
assert (restored.progression.questXp - xp, restored.mora - mora) == (4000, 300)


def normal_only_clear():
    game, fight, player = make()
    game.actors[2].hp = 0
    enemy = fight.enemy
    start = game.t
    jumps = {'FAD01': (75, 137), 'FAD02': (), 'FAD03': (99,)}
    visited = set()
    for _ in range(145 * 60):
        if enemy.hp <= 0:
            assert visited == set(jumps)
            return dict(seconds=round(game.t - start, 2), hp=player.hp)
        cast = fight.cast
        strategy = {'jump': True}
        x = enemy.x - 110 if player.x <= enemy.x else enemy.x + 110
        allow_attack = True
        if cast:
            move, t = cast.move.id, cast.tick
            visited.add(move)
            if player.ground and t in jumps[move]:
                core.action(game, 'jump')
            if move == 'FAD02' and 37 <= t < 163:
                allow_attack = False
                if t >= 48:
                    x = enemy.x - cast.dir * 119
                    allow_attack = (player.x - enemy.x) * cast.dir < -116
        dx = enemy.x - player.x
        turn = dx * player.dir < 0
        strategy.update(right=player.x < x - 4 or (turn and dx > 0 and player.x < x + 3),
                        left=player.x > x + 4 or (turn and dx < 0 and player.x > x - 3),
                        attack=allow_attack and 94 < abs(dx) < 125 and not turn)
        core.step(game, 1 / 60, lua.table_from(strategy))
        assert not game.returns and enemy.stagger == 0
    raise AssertionError((enemy.hp, player.hp))


solo = normal_only_clear()
result = dict(
    attacks=['FAD01', 'FAD02', 'FAD03'], twoLockedWingHits=True, allThreeShotsWithoutInterrupt=True,
    bodyOnlyMissesCore=True, bodyAndCoreLoseHpOnce=True, coreOnlyHitIsValid=True,
    lungingBodyAndArtRiseTogether=True, frozenChargeEndpoint=True, interruptCancelsShots=True,
    downTicks=150, riseTicks=24, rearmTicks=1200, lethalHitBeatsStagger=True,
    normalAttackSoloWithoutInterrupt=solo, questReportOnce=True,
    commands=dict(standard=standard.commands, light=light.commands),
    killXp=LEVELS[65]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'])
(ROOT / 'evidence/aeonblight-field-lua.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
