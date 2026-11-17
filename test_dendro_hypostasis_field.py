import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, arena = 'sumeru-hub', 'dendro-hypostasis-field-den'
boss_id, quest = 'boss-20040701', 'dendro-hypostasis-commission'
empty = lua.table()
runtime_specs = json.loads((ROOT / 'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
plant_spec = next(spec for spec in runtime_specs if spec['id'] == boss_id)
design = json.loads((ROOT / 'docs/field-boss-v1/MANIFEST_SUMERU_FIELD.json').read_text(encoding='utf8'))['attacks']
cards = {row['id']: row for row in design if row['owner'] == boss_id}
assert set(cards) == {move['id'] for move in plant_spec['moves']}
for move in plant_spec['moves']:
    card = cards[move['id']]
    assert (move['lock'], move['total']) == (card['lock'], card['total'])
    assert move['active'] == [window[:2] for window in card['windows']]
    assert [move['recover'], move['total']] == card['recovery']
    assert move.get('air') == card.get('airborne')
    assert [[t, move['life']] for t in move.get('fire', [])] == [shot[:2] for shot in card['projectiles']]


def make(fixture=False):
    game = core.new(12)
    core.action(game, 'story_start')
    core.grantExp(game, LEVELS[67]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(game, hub)
    core.action(game, 'story_accept:' + quest)
    assert game.story.quests[quest].status == 'active'
    if fixture:
        (ROOT / 'work').mkdir(exist_ok=True)
        saved = validate_save(native(core.checkpoint(game)))
        (ROOT / 'work/dendro-hypostasis-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    for x, node in ((1380, 'sumeru-field'), (900, arena)):
        game.actors[1].x = x
        core.action(game, 'story_nearby_portal')
        assert game.story.node == node
    game.actors[2].hp = 0
    return game, game.fieldSlots[boss_id], game.actors[1]


def spot(player, x):
    player.x, player.y, player.vy, player.inv, player.ground = x, 480, 0, 0, True


def until(game, slot, move, tick):
    for _ in range(1750):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(game, 1 / 60, empty)
    raise AssertionError((move, tick, slot.phase))


def hit(game, x, **extra):
    attack = dict(id=1, atk=20, x=x, y=480, dir=1, radial=True, range=125, limit=2,
                  mult=1, color='#fff0ac', gain=0, element='physical', critRate=0)
    core.resolveCast(game, lua.table_from(attack | extra))


game, slot, hero = make(fixture=True)
boss = slot.enemy
spot(hero, boss.x - 105)
hp = boss.hp
hit(game, hero.x, element='dendro')
assert boss.hp == hp
hit(game, hero.x)
assert boss.hp == hp - 19 and math.isclose(480 - boss.hitBottom, .4 * 88)
vine = until(game, slot, 'FHD01', 48)
assert vine.dir == -1
hp = hero.hp
until(game, slot, 'FHD01', 101)
assert hero.hp == hp - 20 and vine.seen[1][1]
spot(hero, boss.x + 107)
until(game, slot, 'FHD01', 150)
assert hero.hp == hp - 20 and not vine.seen[2][1]
spot(hero, boss.x - 109)
until(game, slot, 'FHD01', 155)
assert hero.hp == hp - 40 and vine.seen[2][1] and vine.dir == -1

spot(hero, boss.x - 135)
flight = until(game, slot, 'FHD02', 54)
origin, dest = boss.x, flight.dest
assert 0 < origin - dest <= 1.5 * 88
spot(hero, boss.x + 105)
until(game, slot, 'FHD02', 96)
assert boss.y == 408 and boss.flying and flight.dest == dest
hp = boss.hp
hit(game, boss.x - 45)
assert boss.hp == hp
hit(game, boss.x - 45, y=boss.y)
assert boss.hp == hp - 19
spot(hero, dest)
hp = hero.hp
until(game, slot, 'FHD02', 125)
assert boss.x == dest and boss.y == 480 and hero.hp == hp - 24
until(game, slot, 'FHD02', 144)
assert hero.hp == hp - 24
standard, light = (core.frame(game, 'rect', profile) for profile in ('legacy', 'h32c16'))
assert standard.t == light.t and light.commands < standard.commands

spot(hero, boss.x - 108)
seeds = until(game, slot, 'FHD03', 48)
assert seeds.dir == -1
spot(hero, boss.x + 108)
until(game, slot, 'FHD03', 93)
assert seeds.dir == -1
spot(hero, boss.x - 108)
hp = hero.hp
for i, fired in enumerate((96, 132, 168), 1):
    hero.inv = 0
    until(game, slot, 'FHD03', fired + 20)
    assert seeds.shots[i] and hero.hp == hp - 14 * i
until(game, slot, 'FHD03', 216)
assert not any(seeds.projectiles.values()) and len(game.enemies) == 1
boss.hp = 1
hit(game, boss.x - 42)
assert slot.cast is None and slot.phase == 'respawn'
assert game.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(game)))
assert saved['fieldBosses'][boss_id]['waitTicks'] == 3600
reloaded = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = reloaded.progression.questXp, reloaded.mora
for _ in range(2):
    core.action(reloaded, 'story_report:' + quest)
assert (reloaded.progression.questXp - xp, reloaded.mora - mora) == (4000, 300)


def solo_normal_clear():
    state, fight, player = make()
    enemy = fight.enemy
    start = state.t
    jumps = {'FHD01': (75, 137), 'FHD02': (95,), 'FHD03': (84, 148)}
    for _ in range(140 * 60):
        if enemy.hp <= 0:
            return dict(seconds=round(state.t - start, 2), hp=player.hp)
        cast = fight.cast
        if cast and player.ground and cast.tick in jumps[cast.move.id]:
            core.action(state, 'jump')
        dx = enemy.x - player.x
        turn = dx * player.dir < 0
        core.step(state, 1 / 60, lua.table_from(dict(
            right=dx > 112 or (turn and dx > 0), left=dx < -112 or (turn and dx < 0),
            attack=abs(dx) < 125 and not turn, jump=True)))
        assert state.returns == 0
    raise AssertionError((enemy.hp, player.hp))


solo = solo_normal_clear()
result = dict(
    attacks=['FHD01', 'FHD02', 'FHD03'], physicalReachesCore=True, dendroImmunity=True,
    matchesDesignTiming=True, bothVineSwingsOnLockedSide=True, lockedAirborneBall=True, oneLandingHit=True,
    threeStraightSeeds=True, normalAttackSolo=solo, questReportOnce=True,
    commands=dict(standard=standard.commands, light=light.commands),
    killXp=LEVELS[67]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'])
(ROOT / 'evidence/dendro-hypostasis-field-lua.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
