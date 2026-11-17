import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'sumeru-hub', 'sumeru-entry', 'asimon-field-ruins'
boss_id, quest = 'boss-24050101', 'asimon-commission'
empty = lua.table()
specs = json.loads((ROOT / 'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
spec = next(row for row in specs if row['id'] == boss_id)
design = json.loads((ROOT / 'docs/field-boss-v1/MANIFEST_SUMERU_FIELD.json').read_text(encoding='utf8'))
cards = {row['id']: row for row in design['attacks'] if row['owner'] == boss_id}
assert set(cards) == {move['id'] for move in spec['moves']}
for move in spec['moves']:
    card = cards[move['id']]
    assert (move['lock'], move['total'], move['active']) == (
        card['lock'], card['total'], [window[:2] for window in card['windows']])
    assert [move['recover'], move['total']] == card['recovery']
    assert move.get('travel') == card.get('visible_move')


def make(fixture=False):
    game = core.new(12)
    core.action(game, 'story_start')
    core.grantExp(game, LEVELS[69]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(game, hub)
    core.action(game, 'story_accept:' + quest)
    assert game.story.quests[quest].status == 'active'
    if fixture:
        (ROOT / 'work').mkdir(exist_ok=True)
        saved = validate_save(native(core.checkpoint(game)))
        (ROOT / 'work/asimon-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    for x, node in ((60, approach), (1210, arena)):
        game.actors[1].x = x
        core.action(game, 'story_nearby_portal')
        assert game.story.node == node
    game.actors[2].hp = 0
    return game, game.fieldSlots[boss_id], game.actors[1]


def spot(player, x, y=480):
    player.x, player.y, player.vy, player.inv, player.ground = x, y, 0, 0, y == 480


def until(game, slot, move, tick):
    for _ in range(1750):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(game, 1 / 60, empty)
    raise AssertionError((move, tick, slot.phase))


def hit(game, x, element='physical', **extra):
    attack = dict(id=1, atk=20, x=x, y=480, dir=1, radial=True, range=125, limit=2,
                  mult=1, color='#fff0ac', gain=0, element=element, critRate=0)
    core.resolveCast(game, lua.table_from(attack | extra))


game, slot, hero = make(fixture=True)
boss = slot.enemy
spot(hero, boss.x - 109)
ray = until(game, slot, 'FMT01', 48)
assert ray.dir == -1 and math.isclose(480 - boss.hitBottom, .4 * 88)
hp = hero.hp
until(game, slot, 'FMT01', 95)
spot(hero, ray.origin - 109, y=400)
until(game, slot, 'FMT01', 98)
assert hero.hp == hp and not ray.seen[1][1]
spot(hero, ray.origin - 109)
until(game, slot, 'FMT01', 99)
assert hero.hp == hp - 20 and ray.seen[1][1]
hero.inv = 0
until(game, slot, 'FMT01', 107)
assert hero.hp == hp - 20 and ray.seen[1][1]
spot(hero, ray.origin + 109)
until(game, slot, 'FMT01', 160)
assert hero.hp == hp - 20 and ray.dir == -1 and not ray.seen[2][1]
spot(hero, ray.origin - 109)
until(game, slot, 'FMT01', 167)
assert hero.hp == hp - 40 and ray.seen[2][1] and hero.aura is None

spot(hero, boss.x - 110)
pillars = until(game, slot, 'FMT02', 48)
points = list(pillars.points.values())
assert min(b-a for a, b in zip(points, points[1:])) >= 88
hp = hero.hp
for i, (x, start, finish) in enumerate(zip(points, (108, 150, 192), (114, 156, 198)), 1):
    until(game, slot, 'FMT02', start-1)
    spot(hero, x + 38)
    until(game, slot, 'FMT02', start)
    assert not pillars.seen[i][1]
    spot(hero, x)
    until(game, slot, 'FMT02', finish)
    assert pillars.seen[i][1] and hero.hp == hp - 21*i
assert list(pillars.points.values()) == points

spot(hero, boss.x - 175)
cloak = until(game, slot, 'FMT03', 54)
origin, dest = cloak.origin, cloak.dest
assert math.isclose(origin-dest, 1.6*88)
spot(hero, origin + 135)
until(game, slot, 'FMT03', 71)
hit(game, boss.x - 40, element='dendro')
expiry = boss.aura.expires
until(game, slot, 'FMT03', 90)
assert boss.aura.expires == expiry and boss.aura.element == 'dendro'
assert math.isclose(boss.x, (origin+dest)/2) and not boss.invulnerable and core.canTargetEnemy(boss)
hp = boss.hp
hit(game, origin, range=25, targetId=boss.id)
assert boss.hp == hp
hit(game, boss.x, range=25, targetId=boss.id)
assert boss.hp < hp
hit(game, boss.x, element='pyro', key='fixture:pyro', range=25, targetId=boss.id)
assert boss.burning.remaining == 4 and len(game.enemies) == 1
boss.burning.next = game.t + 2/60
hp = boss.hp
until(game, slot, 'FMT03', 92)
assert boss.hp < hp and boss.burning.remaining == 3 and boss.x < origin
picture = core.frame(game, 'sprite')
standard, light = (core.frame(game, 'rect', profile) for profile in ('legacy', 'h32c16'))
body = [d for d in picture.draws.values() if d.source == 'asimon-field-poses-source-v1.png']
assert len(body) == 1 and body[0].opacity == .45
assert all(d.opacity == .45 for d in light.draws.values() if d.opacity is not None)
assert any(d.color == '#fff5d2' and d.opacity is None for d in light.draws.values())
assert math.isclose(body[0].x + game.camera, boss.x) and standard.t == light.t and light.commands < standard.commands
spot(hero, dest)
hp = hero.hp
until(game, slot, 'FMT03', 108)
assert math.isclose(boss.x, dest) and boss.burning.remaining == 3
assert not any(d.opacity is not None for d in core.frame(game, 'sprite').draws.values())
until(game, slot, 'FMT03', 143)
assert hero.hp == hp
until(game, slot, 'FMT03', 180)
assert hero.hp == hp-24 and cloak.seen[1][1] and math.isclose(boss.x, dest)
boss.hp = 1
hit(game, boss.x)
assert slot.cast is None and slot.phase == 'respawn' and game.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(game)))
assert saved['fieldBosses'][boss_id]['waitTicks'] == 3600
reloaded = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = reloaded.progression.questXp, reloaded.mora
for _ in range(2):
    core.action(reloaded, 'story_report:' + quest)
assert (reloaded.progression.questXp-xp, reloaded.mora-mora) == (4200, 310)


def solo_normal_clear():
    state, fight, player = make()
    enemy = fight.enemy
    start = state.t
    for _ in range(130*60):
        if enemy.hp <= 0:
            return dict(seconds=round(state.t-start, 2), hp=player.hp)
        dx = enemy.x-player.x
        turn = dx*player.dir < 0
        cast = fight.cast
        dodge = bool(cast and player.ground and
                     cast.tick in {'FMT01': (75, 135), 'FMT02': (), 'FMT03': (122,)}[cast.move.id])
        if dodge:
            core.action(state, 'jump')
        core.step(state, 1/60, lua.table_from(dict(
            right=dx > 109 or (turn and dx > 0), left=dx < -109 or (turn and dx < 0),
            attack=abs(dx) < 125 and not turn, jump=True)))
        assert state.returns == 0
    raise AssertionError((enemy.hp, player.hp))


result = dict(
    attacks=sorted(cards), designTiming=True, lockedBeamDirection=True, lowBeamJump=True, threeFixedPillars=True,
    movingHurtbox=True, noOriginHurtbox=True, oneDischargeHit=True, fadeAlpha=.45,
    normalHitWhileFaded=True, auraExpiryPreserved=True, burningTicksWhileFaded=True,
    sharedHp=True, questReportOnce=True, normalAttackSolo=solo_normal_clear(),
    commands=dict(png=picture.commands, standard=standard.commands, light=light.commands),
    killXp=LEVELS[69]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'],
)
(ROOT / 'evidence/asimon-field-lua.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(result)
