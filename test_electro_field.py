"""Verify the regional Electro Hypostasis through the real Lua core."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
ID, ENTRY, NODE = 'boss-20040101', 'electro-approach', 'electro-field-shelf'
QUEST = 'electro-commission'
spec = next(b for b in json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
            if b['id'] == ID)
design = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_STARTER.json').read_text(encoding='utf8'))['attacks']
for move in spec['moves']:
    attack = next(a for a in design if a['id'] == move['id'])
    assert (move['lock'], move['active'], move['recover'], move['total']) == (
        attack['lock_tick'], attack['active_windows'], attack['recovery'][0], attack['total_ticks'])
    if move.get('shotTicks'):
        assert (move['shotTicks'], move['shotLife']) == (
            attack['projectiles'][0]['spawn_ticks'], attack['projectiles'][0]['ttl_ticks'])

LEVEL = LEVELS[spec['level']-1]
HOME, FLOOR = spec['home'], spec['floorY']
XP = LEVEL['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
empty = lua.table()


def make():
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.action(s, 'story_accept:'+QUEST)
    return s


def enter(s):
    core.enterStoryNode(s, ENTRY)
    s.actors[1].x = 1270
    portal = core.frame(s).storyNearbyPortal
    assert portal.available and portal.to == NODE
    core.action(s, 'story_nearby_portal')
    assert s.story.node == NODE
    return s.fieldSlots[ID]


def tick(s, **keys):
    core.step(s, 1/60, lua.table_from(keys) if keys else empty)


def at(s, slot, move, t):
    for _ in range(1200):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == t:
            return cast
        tick(s)
    raise AssertionError((move, t, native(core.frame(s).fieldBoss)))


def spot(a, x):
    a.x, a.y, a.vy, a.ground, a.inv = x, FLOOR, 0, True, 0


def pulse(s, x, element='physical'):
    cast = lua.table_from({'id':1, 'isNormal':element=='physical', 'atk':10, 'x':x, 'y':FLOOR, 'radial':True,
                           'range':125, 'limit':1, 'mult':1, 'element':element, 'color':'#ffffff', 'gain':1})
    core.resolveCast(s, cast)


s = make()
fixture = validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/electro-hypostasis-field-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
slot = enter(s)
b, a = slot.enemy, s.actors[1]
s.actors[2].hp = 0
spot(a, HOME-106)
a.dir = 1
at(s, slot, 'FE01', 8)
assert core.attack(s, a, 'normal')
at(s, slot, 'FE01', 42)
assert b.hp < b.maxhp and b.hitBottom == FLOOR-18
hp = b.hp
pulse(s, a.x, 'electro')
assert b.hp == hp

# A fixed side and all three independent hit groups on their live attack windows.
combo = slot.cast
spot(a, HOME+106)
hp = a.hp
at(s, slot, 'FE01', 78)
assert combo.dir == -1 and a.hp == hp
spot(a, HOME-106)
for start, end, damage, name in ((79,84,10,'グー'),(138,144,11,'チョキ'),(204,216,15,'パー')):
    at(s, slot, 'FE01', start)
    assert name in core.frame(s).fieldBoss.label
    hp -= damage
    assert a.hp == hp
    a.inv = 0
    at(s, slot, 'FE01', end)
    assert a.hp == hp
assert all(combo.seen[i][1] for i in (1,2,3))

# The real core and the swept capsule travel together once, toward the locked endpoint.
drill = at(s, slot, 'FE02', 36)
spot(a, HOME+130)
hp = a.hp
at(s, slot, 'FE02', 84)
assert drill.dir == -1 and b.x == HOME and a.hp == hp
spot(a, HOME-108)
at(s, slot, 'FE02', 96)
assert math.isclose(drill.dest, HOME-2.2*88) and drill.dest < b.x < HOME
assert a.hp == hp-15 and drill.seen[1][1]
hp = b.hp
pulse(s, a.x)
assert b.hp < hp
at(s, slot, 'FE02', 121)
field = core.frame(s).fieldBoss
assert b.x == drill.dest and field.recovering and field.label.startswith('反撃の隙')

# Two ordinary jumps across two timed waves. The same path grounded takes exactly two hits.
def wave_trial(jump):
    scene = make()
    state = enter(scene)
    actor = scene.actors[1]
    scene.actors[2].hp = 0
    spot(actor, HOME-105)
    at(scene, state, 'FE02', 37)
    spot(actor, HOME+120)
    at(scene, state, 'FE02', 120)
    spot(actor, state.enemy.x-103)
    wave = at(scene, state, 'FE03', 42)
    assert wave.dir == -1
    initial_hp = actor.hp
    positions = []
    for t in range(43,199):
        if jump and t in (77,149):
            assert actor.ground
            core.action(scene, 'jump')
        tick(scene, jump=jump)
        if t in (96,168):
            positions.append(round(FLOOR-actor.y,2))
    assert actor.hp == initial_hp-(0 if jump else 18), (jump, actor.hp, initial_hp, positions)
    assert all(bool(wave.seen[i][1]) == (not jump) for i in (1,2))
    return positions, initial_hp-actor.hp


jump_positions, jump_damage = wave_trial(True)
_, grounded_damage = wave_trial(False)
assert all(y > .45*88 for y in jump_positions)

spot(a,b.x-104)
at(s, slot, 'FE03', 90)
cash, exp = s.mora, s.progression.killXp
b.hp = 1
pulse(s, a.x)
assert b.hp == 0 and slot.phase == 'respawn' and slot.cast is None
assert not core.defeatEnemy(s,b,1) and s.story.quests[QUEST].count == 1
assert (s.mora-cash,s.progression.killXp-exp) == (spec['mora'],XP)
saved = validate_save(native(core.checkpoint(s)))
assert saved['fieldBosses'][ID] == {'generation':1,'hp':0,'waitTicks':3600}
restored = core.restore(lua.table_from(saved,recursive=True),12)
cash, exp = restored.mora, restored.progression.questXp
core.action(restored,'story_report:'+QUEST)
core.action(restored,'story_report:'+QUEST)
assert (restored.mora-cash,restored.progression.questXp-exp) == (300,1500)
for _ in range(3599):
    tick(restored)
assert restored.fieldSlots[ID].phase == 'respawn'
tick(restored)
assert restored.fieldSlots[ID].generation == 2 and restored.fieldSlots[ID].enemy.x == HOME

# Retreat from a displaced drill does not strand the boss at the end of the lane.
s = make()
slot = enter(s)
b,a = slot.enemy,s.actors[1]
s.actors[2].hp = 0
spot(a, HOME-107)
at(s,slot,'FE02',122)
pulse(s,b.x-70)
assert b.hp < b.maxhp and b.x != HOME
core.enterStoryNode(s,ENTRY)
for _ in range(spec['leashTicks']):
    tick(s)
assert slot.phase == 'leash' and slot.cast is None
for _ in range(90):
    tick(s)
assert slot.phase == 'available' and slot.enemy.x == HOME and slot.enemy.hp == spec['hp'] and slot.generation == 1


def play(with_amber):
    s = make()
    slot = enter(s)
    b,a = slot.enemy,s.actors[1]
    if not with_amber:
        s.actors[2].hp = 0
    start = s.t
    for _ in range(120*60):
        if b.hp <= 0:
            return {'seconds':round(s.t-start,2),'hp':a.hp,'damage':s.damage}
        cast = slot.cast
        if cast and a.ground:
            triggers = {'FE01':(63,123,190),'FE02':(82,),'FE03':(79,151)}
            if cast.tick in triggers[cast.move.id]:
                core.action(s,'jump')
        dx = b.x-a.x
        side = -1 if dx>=0 else 1
        turn = side == a.dir
        desired = 105
        toward = abs(dx)>desired+7 or (turn and abs(dx)>=desired)
        away = abs(dx)<desired-7 or (turn and abs(dx)<desired)
        tick(s,left=(side==1 and toward) or (side==-1 and away),
             right=(side==-1 and toward) or (side==1 and away),
             jump=True,attack=not turn and abs(dx)<125)
        assert s.returns == 0
    raise AssertionError(('physical normal timed out',b.hp,a.hp))


solo,party = play(False),play(True)
(ROOT/'evidence/electro-hypostasis-field-lua.json').write_text(json.dumps({
    'matches_manifest_timing':True, 'low_core_damage_during_shell_and_drill':True, 'electro_immunity':True,
    'all_three_groups_lock_and_hit_once':True, 'drill_single_swept_pass_distance_px':2.2*88,
    'two_wave_jumps':{'height_at_wave_px':jump_positions,'damage':jump_damage,'grounded_damage':grounded_damage},
    'lethal_hit_with_live_wave_cancels_cast':True, 'leash_returns_after_drill':True,
    'solo_normal':solo, 'amber_companion':party, 'field_kill':{'xp':XP,'mora':spec['mora']},
    'report_once':{'xp':1500,'mora':300}, 'restored_respawn_ticks':3600,
},indent=2)+'\n',encoding='utf8')
print('Electro field combo, drill, two jumps, report and Lv18 clears passed:',solo,party)
