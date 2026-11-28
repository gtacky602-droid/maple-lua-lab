"""Exercise the actual field entry, three Anemo casts, and saved encounter lifecycle."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
BOSS = 'boss-20040201'
ENTRY, ARENA = 'anemo-approach', 'anemo-field-basin'
QUEST = 'anemo-commission'
data = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
spec = next(b for b in data['fieldBosses'] if b['id'] == BOSS)
manifest = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_STARTER.json').read_text(encoding='utf8'))
for move in spec['moves']:
    card = next(attack for attack in manifest['attacks'] if attack['id'] == move['id'])
    assert (move['lock'], move['active'], move['recover'], move['total']) == (
        card['lock_tick'], card['active_windows'], card['recovery'][0], card['total_ticks'])
    if move.get('shotTicks'):
        assert (move['shotTicks'], move['shotLife']) == (
            card['projectiles'][0]['spawn_ticks'], card['projectiles'][0]['ttl_ticks'])

FLOOR, HOME = spec['floorY'], spec['home']
reward = LEVELS[15]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
empty = lua.table()


def make():
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[15]['maple_reference_total_exp_to_reach'], 'quest')
    core.action(s, 'story_accept:'+QUEST)
    return s


def enter(s):
    core.enterStoryNode(s, ENTRY)
    s.actors[1].x = 1270
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == ARENA and portal.available
    core.action(s, 'story_nearby_portal')
    assert s.story.node == ARENA
    return s.fieldSlots[BOSS]


def tick(s, **keys):
    core.step(s, 1/60, lua.table_from(keys) if keys else empty)


def at(s, slot, attack, tick_number):
    for _ in range(900):
        cast = slot.cast
        if cast and cast.move.id == attack and cast.tick == tick_number:
            return cast
        tick(s)
    raise AssertionError((attack, tick_number, native(core.frame(s).fieldBoss)))


def spot(a, x, y=FLOOR):
    a.x, a.y, a.vy, a.ground, a.inv = x, y, 0, y == FLOOR, 0


def pulse(s, x, element):
    cast = lua.table_from({'id':1, 'isNormal':element=='physical', 'atk':10, 'x':x, 'y':FLOOR, 'radial':True,
                           'range':125, 'limit':1, 'mult':1, 'element':element, 'color':'#ffffff', 'gain':1})
    core.resolveCast(s, cast)


s = make()
fixture = validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/anemo-hypostasis-field-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
slot = enter(s)
b, a = slot.enemy, s.actors[1]
s.actors[2].hp = 0
spot(a, HOME-104)
a.dir = 1
at(s, slot, 'FA01', 8)
assert core.attack(s, a, 'normal')
at(s, slot, 'FA01', 30)
assert b.hp < b.maxhp and b.hitBottom == FLOOR-18
before = b.hp
pulse(s, a.x, 'anemo')
assert b.hp == before

# Walk away from the locked clap. Walking into the still-active zone can hit once.
clap = at(s, slot, 'FA01', 42)
assert '掌の間合いから離れる' in core.frame(s).fieldBoss.label
center, hp = clap.center, a.hp
for _ in range(41):
    tick(s, left=True)
assert clap.center == center and a.x < center-63 and a.hp == hp
tick(s)
assert a.hp == hp
spot(a, center)
tick(s)
assert a.hp == hp-13
a.inv = 0
at(s, slot, 'FA01', 100)
assert a.hp == hp-13
at(s, slot, 'FA01', 108)
opening = core.frame(s).fieldBoss
assert opening.recovering and '核が静止' in opening.label and '1.5秒' in opening.label

# The low falling ring is jumpable on the normal jump arc.
spot(a, HOME-96)
drop = at(s, slot, 'FA02', 79)
assert '低い衝撃波を跳び越す' in core.frame(s).fieldBoss.label
hp, center = a.hp, drop.center
core.action(s, 'jump')
for _ in range(22):
    tick(s, jump=True)
assert a.y < FLOOR-.6*88 and a.hp == hp and drop.center == center
spot(a, center)
tick(s)
assert a.hp == hp-16
a.inv = 0
at(s, slot, 'FA02', 120)
assert a.hp == hp-16
before = b.hp
pulse(s, a.x, 'physical')
assert b.hp < before

# Direction locks on the first side. Both vortices cross that lane once.
spot(a, HOME-95)
vortices = at(s, slot, 'FA03', 42)
assert '小旋風が通る側から離れる' in core.frame(s).fieldBoss.label
assert vortices.dir == -1
spot(a, HOME+95)
hp = a.hp
at(s, slot, 'FA03', 75)
assert a.hp == hp and vortices.dir == -1
spot(a, HOME-95)
at(s, slot, 'FA03', 94)
assert vortices.vortexHits[1][1] and not vortices.vortexHits[2][1]
assert a.hp == hp-9
a.inv = 0
at(s, slot, 'FA03', 130)
assert vortices.vortexHits[2][1] and a.hp == hp-18
spot(a, HOME-268)
vortices.vortexHits[2][1] = None
at(s, slot, 'FA03', 155)
assert vortices.vortexHits[2][1]
vortices.vortexHits[2][1] = None
a.inv = 0
at(s, slot, 'FA03', 167)
assert not vortices.vortexHits[2][1]
assert core.frame(s).fieldBoss.move == 'FA03'

# A real lethal hit during a cast commits the reward before another hazard can run.
spot(a, HOME-95)
at(s, slot, 'FA01', 80)
b.hp = 1
cash, xp = s.mora, s.progression.killXp
pulse(s, a.x, 'physical')
assert slot.phase == 'respawn' and slot.cast is None and b.hp == 0
assert not core.defeatEnemy(s, b, 1)
assert (s.mora-cash, s.progression.killXp-xp) == (125, reward)
assert s.story.quests[QUEST].count == 1
save = validate_save(native(core.checkpoint(s)))
assert save['fieldBosses'][BOSS] == {'generation':1, 'hp':0, 'waitTicks':3600}
resumed = core.restore(lua.table_from(save, recursive=True), 12)
cash, xp = resumed.mora, resumed.progression.questXp
core.action(resumed, 'story_report:'+QUEST)
core.action(resumed, 'story_report:'+QUEST)
assert (resumed.mora-cash, resumed.progression.questXp-xp) == (300, 1500)
for _ in range(3599):
    tick(resumed)
assert resumed.fieldSlots[BOSS].phase == 'respawn'
tick(resumed)
assert resumed.fieldSlots[BOSS].generation == 2 and resumed.fieldSlots[BOSS].enemy.hp == spec['hp']


def play(amber):
    s = make()
    slot = enter(s)
    b, a = slot.enemy, s.actors[1]
    if not amber:
        s.actors[2].hp = 0
    start = s.t
    for _ in range(120*60):
        if b.hp <= 0:
            return {'seconds':round(s.t-start, 2), 'hp':a.hp, 'damage':s.damage}
        cast = slot.cast
        distance = HOME-a.x
        retreat = cast and cast.move.pattern != 'vortices' and cast.move.lock <= cast.tick < cast.move.active[1][2]
        if cast and cast.move.pattern == 'vortices' and cast.tick in (74, 110) and a.ground:
            core.action(s, 'jump')
        desired = 186 if retreat else 106
        turn = a.dir < 0
        tick(s, left=distance<desired-6 or (turn and distance<desired), right=distance>desired+6 or (turn and distance>=desired),
             jump=True, attack=not turn and not retreat and 0<distance<125)
        assert s.returns == 0
    raise AssertionError(('normal attack time limit', b.hp, a.hp))


solo, party = play(False), play(True)
(ROOT/'evidence/anemo-hypostasis-field-lua.json').write_text(json.dumps({
    'matches_manifest_timing':True, 'ground_normal_during_shell_and_recovery':True, 'anemo_immunity':True,
    'clap_lock_walk_away_and_single_hit':True, 'low_drop_jump_and_single_hit':True,
    'vortex_locked_side_two_independent_hits_and_expiry':True, 'lethal_hit_cancels_cast':True,
    'solo_normal':solo, 'amber_companion':party, 'kill_reward':{'xp':reward, 'mora':125},
    'commission_report_once':{'xp':1500, 'mora':300}, 'respawn_after_reload_ticks':3600,
}, indent=2)+'\n', encoding='utf8')
print('Anemo field route, attack windows, reward, respawn and Lv16 clears passed:', solo, party)
