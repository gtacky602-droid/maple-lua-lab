"""Verify the Primo field encounter through real Lua damage, saves and inputs."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
ID, ENTRY, NODE = 'boss-26050101', 'primo-approach', 'primo-field-vault'
HUB, QUEST = 'liyue-harbor', 'primo-commission'
config = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
spec = next(b for b in config['fieldBosses'] if b['id'] == ID)
manifest = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_LIYUE_FIELD.json').read_text(encoding='utf8'))
moves = {move['id']: move for move in spec['moves']}
for key, move in moves.items():
    card = next(a for a in manifest['attacks'] if a['id'] == key)
    assert (move['lock'], move['active'], move['recover'], move['total']) == (
        card['lock_tick'], card['active_windows'], card['recovery'][0], card['total_ticks'])
    if move.get('bonusTicks'):
        assert move['bonusTicks'] == card['shield_bonus']['bonus_ticks']
        assert move['total'] + move['bonusTicks'] == card['shield_bonus']['extended_total_ticks']

LEVEL = LEVELS[spec['level']-1]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
empty = lua.table()


def prepare(shield=False):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, HUB)
    core.action(s, 'story_accept:'+QUEST)
    if shield:
        core.configure(s, lua.table_from([['SK20']]+[[] for _ in range(7)], recursive=True))
    return s


def enter(s):
    core.enterStoryNode(s, ENTRY)
    s.actors[1].x = 1270
    portal = core.frame(s).storyNearbyPortal
    assert portal.available and portal.to == NODE
    core.action(s, 'story_nearby_portal')
    assert s.story.node == NODE
    return s.fieldSlots[ID]


def step(s, **keys):
    core.step(s, 1/60, lua.table_from(keys) if keys else empty)


def at(s, slot, move, tick):
    for _ in range(1400):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        step(s)
    raise AssertionError((move, tick, native(core.frame(s).fieldBoss)))


def spot(a, b, dx):
    a.x, a.y, a.vy, a.ground, a.inv = b.x+dx, b.y, 0, True, 0


def training(companion=None):
    s = prepare(True)
    if companion:
        core.action(s, 'town')
        core.action(s, 'companion:'+companion)
        assert s.companion == companion
    slot = enter(s)
    a, b = s.actors[1], slot.enemy
    if not companion:
        s.actors[2].hp = 0
    spot(a, b, -106)
    a.dir = 1
    return s, slot, a, b


(ROOT/'work').mkdir(exist_ok=True)
fixture = validate_save(native(core.checkpoint(prepare(True))))
(ROOT/'work/primo-geovishap-field-fixture.json').write_text(json.dumps(fixture), encoding='utf8')

s, slot, a, b = training()
assert math.isclose(b.y-b.hitBottom, .3*88)
claw = at(s, slot, 'FV01', 42)
assert claw.dir == -1
hp = b.hp
assert core.attack(s, a, 'normal')
at(s, slot, 'FV01', 83)
assert b.hp < hp
hp = a.hp
step(s)
assert a.hp == hp-13 and claw.groups[1][1]
spot(a, b, 106)
at(s, slot, 'FV01', 144)
assert a.hp == hp-13 and claw.dir == -1 and not claw.groups[2][1]
spot(a, b, -106)
step(s)
assert a.hp == hp-26 and claw.groups[2][1]
spot(a, b, 106)
tail = at(s, slot, 'FV02', 95)
assert tail.dir == -1
spot(a, b, -106)
step(s)
assert a.hp == hp-26
spot(a, b, 106)
step(s)
assert a.hp == hp-43 and tail.groups[1][1]
a.inv = 0
at(s, slot, 'FV02', 113)
assert a.hp == hp-43

# A normal jump crosses the low band without a shield. Standing yields one elemental hit.
s, slot, a, b = training()
cast = at(s, slot, 'FV03', 112)
hp = a.hp
assert a.ground
core.action(s, 'jump')
for _ in range(32):
    step(s, jump=True)
assert cast.tick == 144 and a.hp == hp and not cast.groups[1][1] and cast.total == 288

s, slot, a, b = training()
cast = at(s, slot, 'FV03', 131)
hp = a.hp
step(s)
assert a.hp == hp-22 and cast.total == 288 and cast.groups[1][1]
assert any(event.element == 'hydro' for event in core.frame(s).events.values())
a.inv = 0
at(s, slot, 'FV03', 143)
assert a.hp == hp-22

# A shield that absorbs part of a hit still works. Invulnerability must consume nothing.
s, slot, a, b = training()
cast = at(s, slot, 'FV03', 131)
assert core.attack(s, a, 'SK20')
shield = a.waterShield
shield.hp, shield.counters = 5, 3
hp, boss_hp = a.hp, b.hp
step(s)
assert a.waterShield is None and a.hp == hp-17
assert cast.guardTick == 132 and cast.total == 348 and b.hp == boss_hp
assert core.frame(s).fieldBoss.label == '盾で受けた・隙＋1秒'
at(s, slot, 'FV03', 347)
step(s)
assert slot.cast is None

s, slot, a, b = training()
cast = at(s, slot, 'FV03', 131)
assert core.attack(s, a, 'SK20')
a.inv = 1
hp, shield_hp = a.hp, a.waterShield.hp
step(s)
assert a.hp == hp and a.waterShield.hp == shield_hp and cast.guardTick is None and cast.total == 288

# Both actors can absorb a tick within the same attack. The extra recovery is per cast.
s, slot, a, b = training('beidou')
ally = s.actors[2]
cast = at(s, slot, 'FV03', 131)
spot(a, b, -104)
spot(ally, b, -135)
a.lock = ally.lock = 0
ally.cd['skill4'] = 0
assert core.attack(s, a, 'SK20')
assert core.companionAttack(s, ally, 'skill4')
a.waterShield.counters = 3
hp, ally_hp, boss_hp = a.waterShield.hp, ally.thunderShield.hp, b.hp
step(s)
assert cast.guardTick == 132 and cast.total == 348 and b.hp == boss_hp
assert (a.waterShield is None or a.waterShield.hp < hp)
assert ally.thunderShield is None or ally.thunderShield.hp < ally_hp

# Actual kills advance the saved generation; the element is fixed until the next spawn.
s, slot, a, b = training()
initial_cash, initial_xp = s.mora, s.progression.killXp
order = ['hydro','pyro','cryo','electro','hydro']
for generation, element in enumerate(order, 1):
    spot(a, b, -106)
    assert slot.generation == generation and b.element == element and b.hp == spec['hp']
    assert core.frame(s).fieldBoss.element == element
    assert math.isclose(b.resist[element], .3) and b.resist.geo == .5 and b.resist.physical == .3
    assert all(math.isclose(b.resist[key], .1) for key in order[:4] if key != element)
    frame = core.frame(s)
    sprite = next(d for d in frame.draws.values() if d.source == 'primo-source-v1.png')
    assert native(sprite.tint) == spec['variants'][(generation-1)%4].get('tint')
    if generation == len(order):
        break
    if generation > 1:
        # The variant's actual hurt event follows the same attack geometry.
        s.actors[2].hp = 0
        spot(a, b, -106)
        cast = at(s, slot, 'FV03', 131)
        spot(a, b, -106)
        step(s)
        assert cast.groups[1][1] and any(e.element == element for e in core.frame(s).events.values())
    assert core.defeatEnemy(s, b, 1) and not core.defeatEnemy(s, b, 1)
    assert slot.phase == 'respawn' and slot.cast is None
    if generation == 1:
        assert (s.mora-initial_cash, s.progression.killXp-initial_xp) == (spec['mora'], XP)
        assert s.story.quests[QUEST].count == 1
    saved = validate_save(native(core.checkpoint(s)))
    assert saved['fieldBosses'][ID] == {'generation':generation, 'hp':0, 'waitTicks':3600}
    s = core.restore(lua.table_from(saved, recursive=True), 12)
    assert s.story.node == HUB
    if generation == 1:
        cash, xp = s.mora, s.progression.questXp
        core.action(s, 'story_report:'+QUEST)
        core.action(s, 'story_report:'+QUEST)
        assert (s.mora-cash, s.progression.questXp-xp) == (300, 4000)
    for _ in range(3599):
        step(s)
    assert s.fieldSlots[ID].phase == 'respawn'
    step(s)
    slot = enter(s)
    a, b = s.actors[1], slot.enemy


def play(amber, shield=False):
    s = prepare(shield)
    slot = enter(s)
    a, b = s.actors[1], slot.enemy
    if not amber:
        s.actors[2].hp = 0
    start, guards = s.t, set()
    for _ in range(165*60):
        if b.hp <= 0:
            return {'seconds':round(s.t-start,2), 'hp':a.hp, 'returns':s.returns, 'shieldBonusCasts':len(guards)}
        cast = slot.cast
        if cast:
            key, tick = cast.move.id, cast.tick
            if cast.guardTick and tick == cast.guardTick:
                guards.add(round(s.t,3))
            if shield and key == 'FV03' and tick in (102,112,120) and not a.waterShield and a.lock <= 0:
                core.action(s, 'slot1')
            jumps = {'FV01':(66,126), 'FV02':(78,), 'FV03':() if shield else (112,)}
            if a.ground and tick in jumps[key]:
                core.action(s, 'jump')
        dx, turn = b.x-a.x, a.dir<0
        step(s, right=dx>111 or (turn and dx>=106),
             left=dx<101 or (turn and dx<106), jump=True, attack=0<dx<125 and not turn)
        assert s.returns == 0
    raise AssertionError(('clear timeout', b.hp, a.hp))


solo, party, guarded = play(False), play(True), play(True, True)
assert solo['shieldBonusCasts'] == party['shieldBonusCasts'] == 0 and guarded['shieldBonusCasts'] > 0
result = {
    'matches_manifest_timing':True, 'ground_normal_reaches_body':True,
    'claw_two_fixed_front_hits':True, 'tail_rear_only':True,
    'shower_jumpable':True, 'shower_one_hit_per_actor':True, 'shield_partial_absorption_counts':True,
    'invulnerability_consumes_no_shield':True, 'two_shields_one_extension':True, 'extra_recovery_ticks':60,
    'shield_extension_extra_boss_damage':0, 'fixed_generation_elements':order,
    'variant_hit_tags_match':True, 'solo_normal':solo, 'amber_companion':party, 'amber_and_shield':guarded,
    'field_kill':{'xp':XP, 'mora':spec['mora']}, 'commission_report_once':{'xp':4000, 'mora':300},
    'restored_respawn_ticks':3600,
}
(ROOT/'evidence/primo-geovishap-field-lua.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print('Primo field Lua passed:', solo, party, guarded, XP)
