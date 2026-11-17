"""Exercise one shared target, three attacks and the real field settlement in Lua."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
ID, ENTRY, NODE = 'boss-20050101', 'oceanid-approach', 'oceanid-field-reservoir'
HUB, QUEST = 'liyue-harbor', 'oceanid-commission'
config = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
spec = next(b for b in config['fieldBosses'] if b['id'] == ID)
manifest = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_OCEANID_INAZUMA.json').read_text(encoding='utf8'))
for move in spec['moves']:
    card = next(a for a in manifest['attacks'] if a['id'] == move['id'])
    assert (move['lock'], move['active'], move['recover'], move['total']) == (
        card['lock_tick'], card['active_windows'], card['recovery'][0], card['total_ticks'])
    if move.get('shotTicks'):
        assert move['shotTicks'] == card['projectiles'][0]['spawn_ticks']
        assert move['shotLife'] == card['projectiles'][0]['ttl_ticks']
    if move.get('airborne'):
        assert [move['airborne']] == card['temporary_ground_melee_out_of_range']
assert spec['transformTicks'] == manifest['bosses'][0]['damage_proxy']['form_change_max_ticks']
LEVEL = LEVELS[spec['level']-1]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
FLOOR = spec['floorY']
empty = lua.table()


def prepare():
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, HUB)
    core.action(s, 'story_accept:'+QUEST)
    return s


def enter(s):
    core.enterStoryNode(s, ENTRY)
    s.actors[1].x = 1270
    gate = core.frame(s).storyNearbyPortal
    assert gate.available and gate.to == NODE
    core.action(s, 'story_nearby_portal')
    assert s.story.node == NODE
    return s.fieldSlots[ID]


def step(s, **keys):
    core.step(s, 1/60, lua.table_from(keys) if keys else empty)


def at(s, slot, move, tick):
    for _ in range(1800):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        step(s)
    raise AssertionError((move, tick, native(core.frame(s).fieldBoss)))


def spot(a, b, dx):
    a.x, a.y, a.vy, a.ground, a.inv = b.x+dx, FLOOR, 0, True, 0


def train():
    s = prepare()
    slot = enter(s)
    a, b = s.actors[1], slot.enemy
    s.actors[2].hp = 0
    spot(a, b, -97)
    a.dir = 1
    return s, slot, a, b


def attack(s, x, y=FLOOR, element='physical', vertical=75, target=None):
    cast = {'id':1, 'atk':20, 'x':x, 'y':y, 'range':100, 'radial':True, 'limit':8,
            'mult':1, 'element':element, 'color':'#fff0ac', 'gain':1, 'vertical':vertical}
    if target is not None:
        cast['targetId'] = target
    core.resolveCast(s, lua.table_from(cast))


same = lua.eval('rawequal')
(ROOT/'work').mkdir(exist_ok=True)
fixture = validate_save(native(core.checkpoint(prepare())))
(ROOT/'work/oceanid-field-fixture.json').write_text(json.dumps(fixture), encoding='utf8')

# The host is a draw command only. One AOE hits the one receiver once.
s, slot, a, b = train()
assert len(s.enemies) == 1 and same(s.enemies[1], b)
draws = core.frame(s).draws.values()
assert [d.source for d in draws if d.source and d.source.startswith('oceanid-')] == [
    'oceanid-source-v1.png', 'oceanid-boar-source-v1.png']
hp, hits = b.hp, s.hits
attack(s, b.x, y=FLOOR-233, vertical=32)
attack(s, b.x, element='hydro')
assert (b.hp, s.hits) == (hp, hits)
attack(s, b.x)
assert (b.hp, s.hits) == (hp-19, hits+1)
assert any(e.kind == 'hit' and e.target == b.id for e in core.frame(s).events.values())

# Boar stops at the locked point and hits its low path once, even when crossing a player.
boar = at(s, slot, 'FO01', 42)
old_x, dest, hp = b.x, boar.dest, a.hp
spot(a, b, 95)
at(s, slot, 'FO01', 89)
assert boar.dest == dest and b.x == old_x and boar.dir == -1
spot(a, b, -75)
at(s, slot, 'FO01', 113)
assert b.x == dest and boar.seen[1] and a.hp == hp-14
a.inv = 0
at(s, slot, 'FO01', 189)
assert b.x == dest and a.hp == hp-14

# The same targeted queued multi-hit applies on both sides of the 18-tick transform.
spot(a, b, -106)
at(s, slot, 'FO02', 1)
attack(s, b.x, element='cryo', target=b.id)
assert b.aura.element == 'cryo'
aura, hp, hits, kills, mora = b.aura, b.hp, s.hits, s.kills, s.mora
multi = lua.table_from({'id':1,'atk':20,'x':b.x,'y':FLOOR,'radial':True,'range':125,'limit':8,
                        'targetId':b.id,'mult':1,'element':'physical','color':'#fff0ac','gain':1,
                        'remaining':2,'interval':.16,'next':s.t+.065})
s.pending[len(s.pending)+1] = multi
forms = set()
for t in range(2,19):
    at(s, slot, 'FO02', t)
    forms.add(b.form)
    assert same(b, s.enemies[1]) and same(aura, b.aura)
    assert len(s.enemies) == 1 and b.hitBottom >= FLOOR-.25*88
    field = core.frame(s)
    foreground = next(d for d in field.draws.values() if d.source == 'oceanid-'+b.form+'-source-v1.png')
    assert math.isclose(foreground.h, b.y-b.hitTop)
assert forms == {'boar','crane'} and (b.hp,s.hits,s.kills,s.mora) == (hp-38,hits+2,kills,mora)

# Two horizontal waves, each one hit. Their lifetimes end before recovery.
spot(a, b, -100)
crane = at(s, slot, 'FO02', 77)
hp = a.hp
step(s)
first = crane.projectiles[1]
assert first and math.isclose(first.y,FLOOR-.35*88)
x = first.x
step(s)
assert math.isclose(abs(first.x-x),3.5*88/60)
at(s, slot, 'FO02', 105)
assert a.hp == hp-12 and crane.shots[1]
a.inv = 0
at(s, slot, 'FO02', 126)
assert not crane.projectiles[1] and crane.projectiles[2]
at(s, slot, 'FO02', 148)
assert a.hp == hp-24 and crane.shots[2]
assert sum(e.kind == 'hurt' and e.element == 'hydro' for e in core.frame(s).events.values()) >= 3
at(s, slot, 'FO02', 174)
assert not crane.projectiles[2]

# The frog hops briefly, moves the real hurtbox and returns at the locked landing.
spot(a, b, -93)
frog = at(s, slot, 'FO03', 54)
assert b.form == 'frog'
dest = frog.dest
at(s, slot, 'FO03', 96)
assert math.isclose(b.y, FLOOR-112) and b.hitBottom < FLOOR-75
hp, hits = b.hp, s.hits
attack(s, b.x)
assert (b.hp,s.hits) == (hp,hits)
attack(s, b.x, y=b.y)
assert b.hp == hp-19 and not b.invulnerable
spot(a, b, dest-b.x)
hp = a.hp
at(s, slot, 'FO03', 113)
assert a.hp == hp and b.y < FLOOR
step(s)
assert b.x == dest and b.y == FLOOR and frog.seen[1] and a.hp == hp-21
a.inv = 0
at(s, slot, 'FO03', 150)
assert a.hp == hp-21
hp = b.hp
attack(s, b.x)
assert b.hp == hp-19

s, slot, a, b = train()
crane = at(s, slot, 'FO02', 78)
assert crane.projectiles[1]
core.action(s, 'story_fast:'+HUB)
assert s.story.node == HUB and slot.cast is None and core.frame(s).fieldBoss is None

s, slot, a, b = train()
at(s, slot, 'FO03', 95)
hp = b.hp
a.x = 65
core.action(s, 'story_nearby_portal')
assert s.story.node == ENTRY and slot.cast is None and b.y == FLOOR and b.hp == hp
assert core.frame(s).fieldBoss is None
same_slot = enter(s)
assert same(same_slot.enemy,b) and b.hp == hp
spot(a, b, -100)
at(s, slot, 'FO01', 15)
core.action(s,'boss_oceanid')
assert core.frame(s).fieldBoss is None and core.frame(s).boss.maxhp == 500
step(s)
assert slot.cast is None

s, slot, a, b = train()
frog = at(s, slot, 'FO03', 96)
spot(a, b, frog.dest-b.x)
b.hp = 1
attack(s,b.x,y=b.y)
assert b.hp == 0 and slot.cast is None
hp = a.hp
for _ in range(41):
    step(s)
assert a.hp == hp and not frog.seen[1]

# Can win before any transformation; one quest kill and saveable generation cooldown.
s, slot, a, b = train()
b.hp = 1
cash, expr, kills = s.mora, s.progression.killXp, s.kills
attack(s,b.x)
assert slot.phase == 'respawn' and slot.cast is None and not core.defeatEnemy(s,b,1)
assert (s.mora-cash,s.progression.killXp-expr,s.kills-kills) == (spec['mora'],XP,1)
assert s.story.quests[QUEST].count == 1
saved = validate_save(native(core.checkpoint(s)))
assert saved['fieldBosses'][ID] == {'generation':1,'hp':0,'waitTicks':3600}
restored = core.restore(lua.table_from(saved,recursive=True),12)
assert restored.story.node == HUB
cash, expr = restored.mora, restored.progression.questXp
core.action(restored,'story_report:'+QUEST)
core.action(restored,'story_report:'+QUEST)
assert (restored.mora-cash,restored.progression.questXp-expr) == (300,4000)
for _ in range(3599):
    step(restored)
assert restored.fieldSlots[ID].phase == 'respawn'
step(restored)
next_slot = restored.fieldSlots[ID]
assert next_slot.generation == 2 and next_slot.enemy.hp == spec['hp'] and next_slot.enemy.form == 'boar'


def play(amber):
    s = prepare()
    slot = enter(s)
    a, b = s.actors[1], slot.enemy
    if not amber:
        s.actors[2].hp = 0
    start = s.t
    jumps = {'FO01':(72,), 'FO02':(68,116), 'FO03':(94,)}
    for _ in range(135*60):
        if b.hp <= 0:
            return {'seconds':round(s.t-start,2),'hp':a.hp,'returns':s.returns}
        cast = slot.cast
        if cast and a.ground and cast.tick in jumps[cast.move.id]:
            core.action(s,'jump')
        dx = b.x-a.x
        move = 1 if dx>99 else -1 if dx<-99 else 0
        if not move and abs(dx)>8 and dx*a.dir<0:
            move = 1 if dx>0 else -1
        step(s,right=move>0,left=move<0,jump=True,attack=abs(dx)<125 and dx*a.dir>=0)
        assert s.returns == 0
    raise AssertionError(('clear timeout',b.hp,a.hp))


solo, party = play(False), play(True)
result = {
    'matches_manifest_timing':True, 'one_target_in_enemy_list':True, 'host_only_visual':True,
    'physical_route_and_hydro_immunity':True, 'preserved_target_and_aura_through_transform':True,
    'multihit':{'pulses':2,'hits':2,'resulting_damage':38},
    'boar_locked_low_charge':True, 'crane_waves':2, 'projectiles_expire_at_tick':174,
    'frog_moves_hurtbox':True, 'frog_land_reachable':True, 'airborne_kill_cancels_landing':True,
    'interrupted_cast_and_projectiles_cleared':True,
    'can_win_before_form_change':True, 'normal_attack_solo':solo, 'normal_attack_amber':party,
    'field_kill':{'xp':XP,'mora':spec['mora']}, 'commission_report_once':{'xp':4000,'mora':300},
    'restored_respawn_ticks':3600,
}
(ROOT/'evidence/oceanid-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print('Oceanid field Lua passed:',solo,party,XP)
