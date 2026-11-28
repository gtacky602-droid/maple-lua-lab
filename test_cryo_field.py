"""Fixed-clock verification of the regional Regisvine and its legacy route."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core=runtime()
ID, ARENA, ENTRY='boss-26020101','cryo-field-grove','cryo-approach'
QUEST='cryo-commission'
config=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
spec=next(b for b in config['fieldBosses'] if b['id']==ID)
manifest=json.loads((ROOT/'docs/field-boss-v1/MANIFEST_STARTER.json').read_text(encoding='utf8'))
for move in spec['moves']:
    design=next(card for card in manifest['attacks'] if card['id']==move['id'])
    assert [move['lock'],move['active'],move['recover'],move['total']]==[
        design['lock_tick'],design['active_windows'],design['recovery'][0],design['total_ticks']]
    if move['pattern']=='bolts':
        assert (move['shotTicks'],move['shotLife'])==(design['projectiles'][0]['spawn_ticks'],design['projectiles'][0]['ttl_ticks'])
reward=LEVELS[15]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
empty=lua.table()


def make():
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[15]['maple_reference_total_exp_to_reach'],'quest')
    core.action(s,'story_accept:'+QUEST)
    return s


def step(**buttons):
    core.step(s,1/60,lua.table_from(buttons))


def wait(condition,ticks=800):
    for _ in range(ticks):
        if condition():
            return
        step()
    raise AssertionError(('timeout',native(core.frame(s).fieldBoss)))


def move(id,tick):
    c=slot.cast
    return c and c.move.id==id and c.tick==tick


def enter():
    core.enterStoryNode(s,ENTRY)
    s.actors[1].x=1270
    p=core.frame(s).storyNearbyPortal
    assert p.to==ARENA and p.available
    core.action(s,'story_nearby_portal')
    assert s.story.node==ARENA
    return s.fieldSlots[ID]


def spot(dx,y=480):
    a=s.actors[1]
    a.x,a.y,a.vy,a.ground,a.inv=spec['home']+dx,y,0,y==480,0
    return a


def pulse(dx,element='physical'):
    return lua.table_from({'id':1,'key':'geometry-probe','atk':10,'x':spec['home']+dx,'y':480,
        'radial':True,'dir':1,'range':125,'limit':1,'mult':1,'element':element,'color':'#ffffff','gain':1})


s=make()
seed=validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/cryo-regisvine-field-fixture.json').write_text(json.dumps(seed),encoding='utf8')
slot=enter()
b=slot.enemy
s.actors[2].hp=0
a=spot(-110)
wait(lambda:move('FC01',36))
a.x=spec['home']+110
wait(lambda:move('FC01',83))
assert slot.cast.dir==-1 and a.hp==140
wait(lambda:move('FC02',42))
a=spot(100)
wait(lambda:move('FC02',70))
core.action(s,'jump')
for _ in range(25):step(jump=True)
assert slot.cast.dir==1 and a.hp==140
wait(lambda:move('FC03',36))
a=spot(57)
wait(lambda:move('FC03',65))
assert not slot.cast.shots[1]
wait(lambda:move('FC03',71))
assert slot.cast.shots[1] and a.hp==131
a.inv=0
wait(lambda:move('FC03',95))
assert slot.cast.shots[2] and a.hp==122
assert b.coreHits==3 and b.hp==spec['hp']
wait(lambda:move('FC03',156))
assert core.frame(s).fieldBoss.label=='反撃の隙・地上で根元に近づいて攻撃'

# The same wall that stops existing enemy projectiles must stop both field shots.
s=make();slot=enter();s.actors[2].hp=0;a=spot(110)
wait(lambda:move('FC03',65))
hp=a.hp
s.rockWall=lua.table_from({'x':spec['home']+66,'y':480,'hp':100,'life':10})
wait(lambda:move('FC03',96))
assert slot.cast.shots[1] and slot.cast.shots[2]
assert s.rockWall.hp==82 and a.hp==hp

# Test the nucleus hook through the ordinary hit pipeline, including one multi-hit cast.
s=make();slot=enter();b=slot.enemy;s.actors[2].hp=0;a=spot(-75)
wait(lambda:move('FC01',65))
hp=b.hp
core.resolveCast(s,pulse(-112))
assert b.coreHits==3 and b.hp==hp-6
c=pulse(-75)
core.resolveCast(s,c);core.resolveCast(s,c)
assert b.coreHits==2 and b.hp==hp-18
core.resolveCast(s,pulse(-75,'pyro'))
assert b.coreHits==1 and b.hp==hp-26
core.resolveCast(s,pulse(-75))
assert b.coreHits==0 and b.down==0 and b.hp==hp-32
assert core.frame(s).fieldBoss.label=='核を破壊・攻撃が終わるとダウン'
wait(lambda:move('FC01',83))
assert b.down==0
step()
assert b.down==240 and slot.cast is None
assert core.frame(s).fieldBoss.label=='核を破壊・ダウン（あと4.0秒）'
assert b.hitTop==480-core.cryoFieldArt.down.profiles.legacy.height
for _ in range(240):step()
assert b.down==0 and b.rise==24 and b.rearm==1200
for _ in range(24):step()
assert b.rise==0 and b.coreHits==0
assert '攻撃が終わるとダウン' not in core.frame(s).fieldBoss.label
b.hp=spec['hp']
a.inv=30
for _ in range(1176):step()
assert b.coreHits==3

# A real early kill cancels a pending cast and counts toward the old investigation.
cash,xp=s.mora,s.progression.killXp
assert core.defeatEnemy(s,b,1)
assert not core.defeatEnemy(s,b,1)
core.onKill(s,b)
assert s.story.quests[QUEST].count==1
assert (s.mora-cash,s.progression.killXp-xp)==(125,reward)
snapshot=validate_save(native(core.checkpoint(s)))
assert snapshot['fieldBosses'][ID]['waitTicks']==3600
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
assert restored.fieldSlots[ID].generation==1 and restored.fieldSlots[ID].phase=='respawn'
core.enterStoryNode(restored,'mond-town')
old_cash,old_xp=restored.mora,restored.progression.questXp
core.action(restored,'story_report:'+QUEST)
core.action(restored,'story_report:'+QUEST)
assert (restored.mora-old_cash,restored.progression.questXp-old_xp)==(300,1500)
for _ in range(3599):
    core.step(restored,1/60,empty)
assert restored.fieldSlots[ID].phase=='respawn'
core.step(restored,1/60,empty)
next_slot=restored.fieldSlots[ID]
assert next_slot.phase=='available' and next_slot.generation==2
assert next_slot.enemy.hp==spec['hp'] and next_slot.enemy.coreHits==spec['core']['hits']

# A short exit preserves damage. Leaving long enough resets the same generation.
s=make();slot=enter();s.actors[2].hp=0;spot(-75)
wait(lambda:move('FC01',36))
core.resolveCast(s,pulse(-75))
hp=slot.enemy.hp
core.enterStoryNode(s,ENTRY)
for _ in range(60):step()
slot=enter()
assert (slot.enemy.hp,slot.enemy.coreHits,slot.generation)==(hp,2,1)
spot(-75)
step()
core.enterStoryNode(s,ENTRY)
for _ in range(spec['leashTicks']+1):step()
slot=enter()
assert (slot.enemy.hp,slot.enemy.coreHits,slot.generation)==(spec['hp'],3,1)

# Actual movement and normal attacks at a safe working distance. No core stun required.
def play(with_amber):
    global s,slot
    s=make();slot=enter();b=slot.enemy;a=s.actors[1]
    s.actors[2].hp=s.actors[2].maxhp if with_amber else 0
    initial=s.t
    for _ in range(110*60):
        if b.hp<=0:
            return {'seconds':round(s.t-initial,2),'hp':a.hp,'damage':s.damage,'coreHitsLeft':b.coreHits}
        c=slot.cast
        if c and a.ground:
            start={'FC01':59,'FC02':64,'FC03':61}[c.move.id]
            if c.tick==start:core.action(s,'jump')
        distance=b.x-a.x
        turn=a.dir<0
        step(right=distance>112 or (turn and distance>=110),
             left=distance<101 or (turn and distance<110),
             jump=True,attack=0<distance<125 and not turn)
        assert s.returns==0
    raise AssertionError(('time limit',b.hp,a.hp))

solo=play(False)
party=play(True)
assert solo['coreHitsLeft']==3
(ROOT/'evidence/cryo-regisvine-field-lua.json').write_text(json.dumps({
    'attack_windows_and_icicle_ttls_match_design':True,'side_lock_hop_and_two_icicle_hits':True,
    'rock_wall_absorbs_both_icicles':True,
    'core_one_hit_per_cast_with_main_hp_damage':True,'core_break_waits_until_active_end':True,
    'down_ticks':240,'safe_rise_ticks':24,'core_rearm_ticks':1200,
    'solo_normal_without_core_break':solo,'amber_companion':party,
    'one_generation_reward':{'xp':reward,'mora':125},'commission_once':{'xp':1500,'mora':300},
    'cooldown_persists':True,'second_generation_at_3600_ticks':True,'short_exit_preserves_damage_long_exit_resets':True
},indent=2)+'\n',encoding='utf8')
print('Cryo field timing, nucleus, kill, report and Lv16 clears passed:',solo,party)
