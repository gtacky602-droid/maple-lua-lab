"""Exercise Pyro Regisvine through the field route and the Lua combat pipeline."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
ID, ENTRY, NODE = 'boss-26020201','pyro-approach','pyro-field-grotto'
HUB, QUEST = 'liyue-harbor','pyro-commission'
config = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
spec = next(b for b in config['fieldBosses'] if b['id'] == ID)
manifest = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_LIYUE_FIELD.json').read_text(encoding='utf8'))
for move in spec['moves']:
    card = next(a for a in manifest['attacks'] if a['id'] == move['id'])
    assert (move['lock'],move['active'],move['recover'],move['total']) == (
        card['lock_tick'],card['active_windows'],card['recovery'][0],card['total_ticks'])
    if move.get('shotTicks'):
        shot = card['projectiles'][0]
        assert (move['shotTicks'],move['shotLife'],move['shotSpeed'],move['shotHeight']) == (
            shot['spawn_ticks'],shot['ttl_ticks'],shot['speed_u_per_second'],shot['center_z_u'])

FLOOR,HOME=spec['floorY'],spec['home']
level=LEVELS[spec['level']-1]
xp=level['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
empty=lua.table()


def make():
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,level['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,HUB)
    core.action(s,'story_accept:'+QUEST)
    return s


def enter(s):
    core.enterStoryNode(s,ENTRY)
    s.actors[1].x=1270
    gate=core.frame(s).storyNearbyPortal
    assert gate.available and gate.to==NODE
    core.action(s,'story_nearby_portal')
    assert s.story.node==NODE
    return s.fieldSlots[ID]


def step(s,**keys):
    core.step(s,1/60,lua.table_from(keys) if keys else empty)


def at(s,slot,move,t):
    for _ in range(1100):
        cast=slot.cast
        if cast and cast.move.id==move and cast.tick==t:
            return cast
        step(s)
    raise AssertionError((move,t,native(core.frame(s).fieldBoss)))


def spot(a,dx):
    a.x,a.y,a.vy,a.ground,a.inv=HOME+dx,FLOOR,0,True,0


def pulse(dx,element='physical'):
    return lua.table_from({'id':1,'isNormal':element=='physical','atk':10,'x':HOME+dx,
        'y':FLOOR,'radial':True,'range':125,'limit':1,'mult':1,'element':element,'color':'#fff6d1','gain':1})


s=make()
fixture=validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/pyro-regisvine-field-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
slot=enter(s)
a,b=s.actors[1],slot.enemy
s.actors[2].hp=0
spot(a,-100)
assert math.isclose(b.hitBottom,FLOOR-.35*88)
slam=at(s,slot,'FP01',42)
spot(a,100)
hp=a.hp
at(s,slot,'FP01',84)
assert a.hp==hp and slam.dir==-1
spot(a,-136)
at(s,slot,'FP01',85)
assert a.hp==hp-18 and slam.seen[1]
spot(a,-185)
at(s,slot,'FP01',125)
assert a.hp==hp-18

# A target beyond head range can be hit by the traveling flame.
s=make();slot=enter(s);a=s.actors[1]
s.actors[2].hp=0
spot(a,-195)
hp=a.hp
at(s,slot,'FP01',95)
assert a.hp==hp
at(s,slot,'FP01',123)
assert a.hp==hp-13

# Two independent fireballs use the normal projectile collision and wall resistance.
spot(a,-67)
bolts=at(s,slot,'FP02',71)
hp=a.hp
at(s,slot,'FP02',78)
assert bolts.shots[1] and not bolts.shots[2] and a.hp==hp-12
a.inv=0
at(s,slot,'FP02',116)
assert bolts.shots[2] and a.hp==hp-24

spot(a,-105)
at(s,slot,'FP03',64)
hp=a.hp
core.action(s,'jump')
for _ in range(38):step(s,jump=True)
assert a.hp==hp
at(s,slot,'FP03',126)
assert a.hp==hp

s=make();slot=enter(s);a=s.actors[1]
s.actors[2].hp=0
spot(a,-112)
bolts=at(s,slot,'FP02',71)
hp=a.hp
s.rockWall=lua.table_from({'x':HOME-69,'y':FLOOR,'hp':100,'life':10})
at(s,slot,'FP02',123)
assert bolts.shots[1] and bolts.shots[2] and s.rockWall.hp==76 and a.hp==hp

# Three separate casts around the nucleus wait for the final live flame tick.
s=make();slot=enter(s);a,b=s.actors[1],slot.enemy
s.actors[2].hp=0
spot(a,-76)
at(s,slot,'FP01',96)
base=b.hp
c=pulse(-76)
core.resolveCast(s,c);core.resolveCast(s,c)
assert b.coreHits==2 and b.hp<base
core.resolveCast(s,pulse(-76,'pyro'))
core.resolveCast(s,pulse(-76,'hydro'))
assert b.coreHits==0
at(s,slot,'FP01',155)
assert b.down==0
step(s)
assert b.down==240 and slot.cast is None
assert b.hitTop==FLOOR-core.pyroFieldArt.down.profiles.legacy.height
for _ in range(240):step(s)
assert (b.down,b.rise,b.rearm)==(0,24,1200)
for _ in range(24):step(s)
assert b.hitTop==FLOOR-spec['artHeight'] and b.coreHits==0
for _ in range(1176):step(s)
assert b.coreHits==3

# Killing during the hazard clears that cast, counts the region quest once, and survives reload.
s=make();slot=enter(s);a,b=s.actors[1],slot.enemy
s.actors[2].hp=0
spot(a,-77)
at(s,slot,'FP01',110)
b.hp=1
old_mora,old_xp=s.mora,s.progression.killXp
core.resolveCast(s,pulse(-77))
assert b.hp==0 and slot.cast is None and slot.phase=='respawn' and not core.defeatEnemy(s,b,1)
assert (s.mora-old_mora,s.progression.killXp-old_xp)==(spec['mora'],xp)
assert s.story.quests[QUEST].count==1
save=validate_save(native(core.checkpoint(s)))
assert save['fieldBosses'][ID]=={'generation':1,'hp':0,'waitTicks':3600}
restored=core.restore(lua.table_from(save,recursive=True),12)
assert restored.story.node==HUB
old_mora,old_xp=restored.mora,restored.progression.questXp
core.action(restored,'story_report:'+QUEST)
core.action(restored,'story_report:'+QUEST)
assert (restored.mora-old_mora,restored.progression.questXp-old_xp)==(300,4000)
for _ in range(3599):step(restored)
assert restored.fieldSlots[ID].phase=='respawn'
step(restored)
assert restored.fieldSlots[ID].generation==2 and restored.fieldSlots[ID].enemy.coreHits==3


def play(amber):
    s=make();slot=enter(s);b,a=slot.enemy,s.actors[1]
    if not amber:s.actors[2].hp=0
    start=s.t
    triggers={'FP01':(68,), 'FP02':(64,101), 'FP03':(69,)}
    for _ in range(120*60):
        if b.hp<=0:
            return {'seconds':round(s.t-start,2),'hp':a.hp,'damage':s.damage,'coreHitsLeft':b.coreHits}
        c=slot.cast
        if c and a.ground and c.tick in triggers[c.move.id]:
            core.action(s,'jump')
        dx=b.x-a.x
        turn=a.dir<0
        step(s,right=dx>113 or (turn and dx>=109),left=dx<102 or (turn and dx<109),
             jump=True,attack=0<dx<125 and not turn)
        assert s.returns==0
    raise AssertionError(('physical fight timeout',b.hp,a.hp))


solo,party=play(False),play(True)
assert solo['coreHitsLeft']==3
(ROOT/'evidence/pyro-regisvine-field-lua.json').write_text(json.dumps({
    'matches_manifest_timing':True,'low_hurtbox_and_normal_damage':True,'slam_and_wave_share_hit':True,
    'wave_damage_outside_head':13,'double_fireballs':True,'wall_can_stop_both_fireballs':True,'sweep_jump':True,
    'nucleus_one_hit_per_cast':True,'stagger_waits_until_wave_expires':True,'down_ticks':240,'rearm_ticks':1200,
    'lethal_hit_cleans_wave':True,'solo_normal':solo,'amber_companion':party,
    'field_kill':{'xp':xp,'mora':spec['mora']},'report_once':{'xp':4000,'mora':300},'restored_respawn_ticks':3600,
},indent=2)+'\n',encoding='utf8')
print('Pyro field head-plus-wave, two shots, sweep, nucleus, report and Lv28 clears passed:',solo,party)
