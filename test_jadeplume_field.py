"""Field arena timing, geometry, lifecycle and reward regression at 60Hz."""
from copy import deepcopy
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
ID, HUB, FIELD, ARENA = 'boss-26110101','sumeru-hub','sumeru-field','sumeru-jadeplume-grove'
spec=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses'][0]
manifest=json.loads((ROOT/'docs/field-boss-v1/MANIFEST_STARTER.json').read_text(encoding='utf8'))
for move in spec['moves']:
    design=next(row for row in manifest['attacks'] if row['id']==move['id'])
    assert [move['lock'],move['active'],move['recover'],move['total']]==[
        design['lock_tick'],design['active_windows'],design['recovery'][0],design['total_ticks']]
xp=LEVELS[spec['level']-1]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']


def wait(condition,limit=900,**buttons):
    for _ in range(limit):
        if condition():
            return
        step(**buttons)
    raise AssertionError(('timeout',s.story.node,native(core.frame(s).fieldBoss)))


def step(**buttons):
    core.step(s,1/60,lua.table_from(buttons))


def snapshot():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(validate_save(data),recursive=True),12)


def new():
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[59]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,HUB)
    return s


def go(dest,x):
    a=s.actors[s.active]
    a.x,a.y,a.ground=x,480,True
    nearby=core.frame(s).storyNearbyPortal
    assert nearby and nearby.to==dest and nearby.available,native(nearby)
    core.action(s,'story_nearby_portal')
    assert s.story.node==dest


def state():
    return s.fieldSlots[ID]


def move(id,tick):
    data=state()
    return data.cast and data.cast.move.id==id and data.cast.tick==tick


s=new()
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/jadeplume-field-fixture.json').write_text(json.dumps(snapshot()),encoding='utf8')
go(FIELD,1380)
go(ARENA,1080)
b=state().enemy
a=s.actors[1]
s.actors[2].hp=0
for _ in range(240):step()
assert state().phase=='available' and b.hp==spec['hp']==b.maxhp
a.x,a.y,a.inv=745,480,0
wait(lambda:state().phase=='notice')
assert not state().cast
wait(lambda:move('FJ01',36))
cast=state().cast
assert cast.dir==-1
# Crossing at lock no longer flips the boss. Then stand in front for one hit per beat.
a.x=b.x+80
for _ in range(10):step()
assert cast.dir==-1
wait(lambda:move('FJ01',65))
hp=a.hp
a.x,a.y,a.vy,a.ground=b.x-115,393,0,False
step()
assert a.hp==hp  # Inside the bounding rectangle corner, outside the capsule.
a.x,a.y,a.vy,a.ground=b.x-75,480,0,True
wait(lambda:move('FJ01',71))
assert a.hp==hp-9
wait(lambda:move('FJ01',113))
assert a.hp==hp-18
wait(lambda:move('FJ02',48))
land=state().cast.land
a.x=land-103
wait(lambda:move('FJ02',90))
assert b.y==404 and b.hitBottom==b.y and b.hitTop==b.y-b.drawHeight
assert a.y-core.targetHeight(a,b)>75
air=next(d for d in core.frame(s,'sprite').draws.values()
         if d.source=='jadeplume-field-actions-source-v1.png')
assert air.y==b.y and air.h==b.drawHeight
wait(lambda:move('FJ02',119))
assert state().cast.land==land and b.x==land and a.hp==hp-18
wait(lambda:move('FJ02',132))
assert b.hp>0 and not b.invulnerable
a.x=b.x-66;a.dir=1;a.inv=5
past=b.hp
step(attack=True)
assert b.hp<past  # Ground attack reaches the single HP pool during stagger.
wait(lambda:move('FJ03',48))
points=native(state().cast.spots)
assert len(points)==3 and min(abs(x-y) for x in points for y in points if x!=y)>=.8*88
a.x=points[0]+38
wait(lambda:move('FJ03',107))
assert native(state().cast.spots)==points
hp=a.hp
for index,tick in enumerate([108,144,180]):
    a.x=points[index];a.inv=0
    wait(lambda:move('FJ03',tick+5))
    assert a.hp==hp-(index+1)*10

# An active cast remains attached when the map is left momentarily.
old_hp=b.hp
go(FIELD,75)
go(ARENA,1080)
assert state().enemy.hp==old_hp and state().generation==1
# A second living target keeps the encounter active even if the player retreats.
a=s.actors[1];ally=s.actors[2]
a.x=160;ally.x=b.x-95;ally.hp=150;ally.inv=8
for _ in range(299):step()
assert state().phase=='combat'
a.x,ally.x=160,120
wait(lambda:state().phase=='leash',420)
assert state().enemy.invulnerable and state().cast is None
cash,kills=s.mora,s.kills
wait(lambda:state().phase=='available',240)
assert (state().generation,state().enemy.hp,s.mora,s.kills)==(1,spec['hp'],cash,kills)

# Death takes precedence over an imminent active window, regardless of map reload.
b=state().enemy
a.x=b.x-80;a.hp=a.maxhp;a.inv=0;ally.hp=0
wait(lambda:move('FJ01',65))
before=(s.progression.killXp,s.mora,s.kills)
assert core.defeatEnemy(s,b,1)
assert not core.defeatEnemy(s,b,1)
core.onKill(s,b)
assert (s.progression.killXp-before[0],s.mora-before[1],s.kills-before[2])==(xp,spec['mora'],1)
assert state().phase=='respawn' and state().cast is None
data=snapshot()
assert data['fieldBosses'][ID]=={'generation':1,'hp':0,'waitTicks':3600}
core.action(s,'pause')
for _ in range(120):step()
assert snapshot()['fieldBosses'][ID]['waitTicks']==3600
core.action(s,'pause')
go(FIELD,75)
for _ in range(180):step()
go(ARENA,1080)
assert state().enemy.hp==0 and state().generation==1
pending=snapshot()
s=restore(pending)
assert s.story.node==HUB and state().enemy.hp==0
go(FIELD,1380);go(ARENA,1080)
for _ in range(3400):step()
assert state().phase=='respawn'
wait(lambda:state().phase=='available',240)
assert state().generation==2 and state().enemy.hp==spec['hp']
before=s.progression.killXp
assert core.defeatEnemy(s,state().enemy,1)
assert s.progression.killXp-before==xp
bad=deepcopy(snapshot());bad['fieldBosses'][ID]['hp']=1
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('HP plus cooldown was accepted')

# Physical attacks use unmodified Lv60 stats. No cutdowns or scripted health.
def play(ally_active):
    global s
    s=new();go(FIELD,1380);go(ARENA,1080)
    a=s.actors[1]
    s.actors[2].hp=s.actors[2].maxhp if ally_active else 0
    opened=s.t;side=-1
    for _ in range(60*110):
        enemy=state().enemy
        if enemy.hp<=0:
            return {'seconds':round(s.t-opened,2),'hp':a.hp,'damage':s.damage}
        cast=state().cast
        dx=enemy.x-a.x
        if cast and a.ground:
            t=cast.tick
            if ((cast.move.id=='FJ01' and (t==54 or t==98))
                or (cast.move.id=='FJ02' and t==92)
                or (cast.move.id=='FJ03' and t in (96,132,168))):
                core.action(s,'jump')
        # Keep spacing inside the arena and face toward the boss before swinging.
        if side<0 and enemy.x<spec['arenaMin']+132:side=1
        if side>0 and enemy.x>spec['arenaMax']-132:side=-1
        desired=enemy.x+side*100
        offset=desired-a.x
        if abs(offset)>10:
            left,right=offset<0,offset>0
        else:
            left,right=dx*a.dir<0 and dx<0,dx*a.dir<0 and dx>0
        step(left=left,right=right,jump=True,attack=dx*a.dir>0 and abs(dx)<125)
        assert s.returns==0
    raise AssertionError(('combat limit',state().enemy.hp,a.hp))

solo=play(False)
party=play(True)
for mode in ('legacy','h48c32','h32c16'):
    s=new();go(FIELD,1380);go(ARENA,1080)
    s.actors[1].x=710
    assert core.frame(s,'rect',mode).fieldBoss.hp==spec['hp']
(ROOT/'evidence/jadeplume-field-lua.json').write_text(json.dumps({
    'attack_windows_match_design':True,'peck_rounded_corner_does_not_hit':True,'lock_and_avoided_leap':True,'two_peck_hits_and_three_spore_hits':True,
    'same_y_sprite_and_airborne_hurtbox':True,'ground_hurtbox_at_recovery':True,'alive_target_prevents_leash':True,'retreat_no_reward':True,'hp_zero_priority':True,
    'same_generation_map_reentry_and_restore':True,'pause_freezes_timer':True,'second_generation_reward':True,
    'regional_level':60,'boss_hp':spec['hp'],'per_generation':{'exp':xp,'mora':spec['mora'],'artifact_chance_pct':25},
    'normal_only_at_level_60':solo,'normal_with_default_amber':party
},indent=2)+'\n',encoding='utf8')
print('Jadeplume Lua route, attacks, two generations and Lv60 clears passed:',solo,party)
