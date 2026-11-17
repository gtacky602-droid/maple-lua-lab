import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'sumeru-hub', 'sumeru-entry', 'wenut-field-cavern'
boss_id, quest = 'boss-26130101', 'wenut-commission'
source = 'wenut-field-poses-source-v1.png'
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
    assert move.get('hidden') == card.get('underground')
    assert [[t, move['life']] for t in move.get('fire', [])] == [shot[:2] for shot in card['projectiles']]


def make(fixture=False):
    game = core.new(12)
    core.action(game, 'story_start')
    core.grantExp(game, LEVELS[71]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(game, hub)
    core.action(game, 'story_accept:' + quest)
    assert game.story.quests[quest].status == 'active'
    if fixture:
        (ROOT / 'work').mkdir(exist_ok=True)
        saved = validate_save(native(core.checkpoint(game)))
        (ROOT / 'work/wenut-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    for x, node in ((60, approach), (800, arena)):
        game.actors[1].x = x
        core.action(game, 'story_nearby_portal')
        assert game.story.node == node
    game.actors[2].hp = 0
    return game, game.fieldSlots[boss_id], game.actors[1]


def spot(player, x, y=480):
    player.x, player.y, player.vy, player.inv, player.ground = x, y, 0, 0, y == 480


def until(game, slot, move, tick):
    for _ in range(2000):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(game, 1 / 60, empty)
    raise AssertionError((move, tick, slot.phase))


def hit(game, x, element='physical', **extra):
    attack = dict(id=1, key='fixture:'+element, atk=20, x=x, y=480, dir=1, radial=True, range=125,
                  limit=2, mult=1, color='#fff0ac', gain=0, element=element, critRate=0)
    core.resolveCast(game, lua.table_from(attack | extra))


game, slot, hero = make(fixture=True)
boss = slot.enemy
spot(hero, boss.x-102)
sweep = until(game, slot, 'FWN01', 48)
assert sweep.dir == -1 and math.isclose(480-boss.hitBottom,.3*88)
hp = boss.hp
hit(game, boss.x-45)
assert boss.hp < hp
hp = hero.hp
until(game, slot, 'FWN01', 108)
assert hero.hp == hp-22
hero.inv = 0
until(game, slot, 'FWN01', 126)
assert hero.hp == hp-22

stream = until(game, slot, 'FWN02', 54)
spot(hero, stream.origin+115)
hp = hero.hp
until(game, slot, 'FWN02', 113)
assert stream.dir == -1 and hero.hp == hp
spot(hero, stream.origin-115, y=399)
until(game, slot, 'FWN02', 118)
assert hero.hp == hp
spot(hero, stream.origin-115)
until(game, slot, 'FWN02', 130)
assert hero.hp == hp-21 and stream.source.damageElement == 'anemo'

spot(hero, boss.x-165)
burrow = until(game, slot, 'FWN03', 54)
origin, dest = burrow.origin, burrow.dest
assert math.isclose(origin-dest, 1.4*88)
spot(hero, dest)
hp = hero.hp
until(game, slot, 'FWN03', 77)
assert core.canTargetEnemy(boss)
hit(game, origin, 'dendro')
expiry = boss.aura.expires
until(game, slot, 'FWN03', 78)
assert boss.underground and not core.canTargetEnemy(boss) and boss.hitBottom is None
hidden = core.frame(game, 'sprite')
assert not any(d.source == source for d in hidden.draws.values())
health = boss.hp
hit(game, origin, targetId=boss.id)
assert boss.hp == health
until(game, slot, 'FWN03', 113)
assert boss.underground and boss.aura.expires == expiry and not any(burrow.projectiles.values())
until(game, slot, 'FWN03', 114)
assert not boss.underground and math.isclose(boss.x,dest) and boss.aura.expires == expiry
hit(game, dest, targetId=boss.id)
assert boss.hp < health
until(game, slot, 'FWN03', 143)
assert hero.hp == hp and not any(burrow.projectiles.values())
png = core.frame(game, 'sprite')
standard, light = (core.frame(game, 'rect', profile) for profile in ('legacy', 'h32c16'))
assert png.t == standard.t == light.t and light.commands < standard.commands
spot(hero, dest-110)
for i, fired in enumerate((144,192), 1):
    hero.inv = 0
    until(game, slot, 'FWN03', fired+28)
    assert burrow.shots[i] and hero.hp == hp-18*i and burrow.dir == -1
until(game, slot, 'FWN03', 240)
assert not any(burrow.projectiles.values())
assert until(game, slot, 'FWN01', 0)
assert until(game, slot, 'FWN02', 0)
spot(hero, boss.x-105)
fatal_burrow = until(game, slot, 'FWN03', 29)
hit(game, boss.x, 'dendro')
hit(game, boss.x, 'pyro')
assert boss.burning.remaining == 4
until(game, slot, 'FWN03', 87)
boss.hp = 1
for _ in range(3):
    core.step(game, 1/60, empty)
assert boss.hp == 0 and boss.underground and slot.cast is None and slot.phase == 'respawn'
for _ in range(145):
    core.step(game, 1/60, empty)
assert game.story.quests[quest].count == 1 and not any(fatal_burrow.projectiles.values())
assert not any(d.source == source for d in core.frame(game,'sprite').draws.values())
saved = validate_save(native(core.checkpoint(game)))
assert 0 < saved['fieldBosses'][boss_id]['waitTicks'] <= 3600
reloaded = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = reloaded.progression.questXp, reloaded.mora
for _ in range(2):
    core.action(reloaded, 'story_report:' + quest)
assert (reloaded.progression.questXp-xp, reloaded.mora-mora) == (4400, 320)

exit_game, exit_slot, exit_hero = make()
exit_boss = exit_slot.enemy
spot(exit_hero, exit_boss.x-100)
exit_cast = until(exit_game, exit_slot, 'FWN03', 87)
assert exit_boss.underground
spot(exit_hero, 65)
core.action(exit_game, 'story_nearby_portal')
assert exit_game.story.node == approach and exit_slot.cast is None and not exit_boss.underground
spot(exit_hero, 800)
core.action(exit_game, 'story_nearby_portal')
assert exit_game.story.node == arena and core.canTargetEnemy(exit_boss)
spot(exit_hero, exit_boss.x-100)
until(exit_game, exit_slot, 'FWN01', 10)
assert not any(exit_cast.projectiles.values())


def solo_normal_clear():
    state, fight, player = make()
    enemy = fight.enemy
    start = state.t
    jumps = {'FWN01': (88,), 'FWN02': (88,), 'FWN03': (150, 198)}
    for _ in range(130*60):
        if enemy.hp <= 0:
            return dict(seconds=round(state.t-start,2),hp=player.hp)
        dx = enemy.x-player.x
        turn = dx*player.dir < 0
        cast = fight.cast
        if cast and player.ground and cast.tick in jumps[cast.move.id]:
            core.action(state,'jump')
        core.step(state, 1/60, lua.table_from(dict(
            right=dx>110 or (turn and dx>0), left=dx<-110 or (turn and dx<0),
            attack=abs(dx)<125 and not turn, jump=True)))
        assert state.returns == 0
    raise AssertionError((enemy.hp,player.hp))


result = dict(
    attacks=sorted(cards), designTiming=True, normalHitsSurfaceHead=True, sweptBandOneHit=True,
    fixedDirectionAndJumpableWindLine=True, noUndergroundHurtbox=True, auraSurvivesBurrow=True,
    noDamageOnReemergence=True, twoLockedWindProjectiles=True, groundCastsBetweenBurrows=2,
    burningKillsUnderground=True, noLateProjectilesAfterKill=True, exitCancelsBurrow=True, questReportOnce=True,
    normalAttackSolo=solo_normal_clear(), commands=dict(png=png.commands,standard=standard.commands,light=light.commands),
    killXp=LEVELS[71]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'],
)
(ROOT/'evidence/wenut-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
