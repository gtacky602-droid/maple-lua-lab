"""Verify the low core and optional short pillar through actual Lua combat."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
ID,ENTRY,NODE='boss-20040301','geo-approach','geo-field-court'
HUB,QUEST='liyue-harbor','geo-commission'
config=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
spec=next(b for b in config['fieldBosses'] if b['id']==ID)
manifest=json.loads((ROOT/'docs/field-boss-v1/MANIFEST_LIYUE_FIELD.json').read_text(encoding='utf8'))
for move in spec['moves']:
    card=next(a for a in manifest['attacks'] if a['id']==move['id'])
    assert (move['lock'],move['active'],move['recover'],move['total'])==(
        card['lock_tick'],card['active_windows'],card['recovery'][0],card['total_ticks'])
    if move.get('shotTicks'):
        shot=card['projectiles'][0]
        assert (move['shotTicks'],move['shotLife'],move['shotSpeed'],move['shotHeight'],move['shotRadius'])==(
            shot['spawn_ticks'],shot['ttl_ticks'],shot['speed_u_per_second'],shot['center_z_u'],shot['radius_u'])
    if move.get('pillar'):
        p,design=move['pillar'],card['optional_interrupt']
        assert [p['open'],move['active'][0][0]]==design['accept_window']
        assert [p['hits'],p['expires'],p['expose']+p['reform']]==[
            design['distinct_casts'],design['object_expiry_tick'],design['success_offsets']['end_tick']]

FLOOR,HOME=spec['floorY'],spec['home']
LEVEL=LEVELS[spec['level']-1]
XP=LEVEL['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
empty=lua.table()


def make():
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVEL['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,HUB)
    core.action(s,'story_accept:'+QUEST)
    return s


def enter(s):
    core.enterStoryNode(s,ENTRY)
    s.actors[1].x=1270
    portal=core.frame(s).storyNearbyPortal
    assert portal.available and portal.to==NODE
    core.action(s,'story_nearby_portal')
    assert s.story.node==NODE
    return s.fieldSlots[ID]


def step(s,**keys):
    core.step(s,1/60,lua.table_from(keys) if keys else empty)


def at(s,slot,move,t):
    for _ in range(1300):
        cast=slot.cast
        if cast and cast.move.id==move and cast.tick==t:
            return cast
        step(s)
    raise AssertionError((move,t,native(core.frame(s).fieldBoss)))


def spot(a,dx):
    a.x,a.y,a.vy,a.ground,a.inv=HOME+dx,FLOOR,0,True,0


def hit(dx,element='physical',reaction=False):
    return lua.table_from({'id':1,'atk':10,'isNormal':element=='physical','x':HOME+dx,
        'y':FLOOR,'radial':True,'range':125,'limit':1,'mult':1,'element':element,
        'reaction':reaction,'color':'#fff0ac','gain':1})


def training():
    s=make();slot=enter(s);a=s.actors[1]
    s.actors[2].hp=0
    spot(a,-104)
    a.dir=1
    return s,slot,a


s=make()
fixture=validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/geo-hypostasis-field-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
s,slot,a=training()
b=slot.enemy
assert math.isclose(FLOOR-b.hitBottom,.5*88)
at(s,slot,'FG01',16)
hp=b.hp
assert core.attack(s,a,'normal')
hammer=at(s,slot,'FG01',48)
assert b.hp<hp and hammer.dir==-1
spot(a,104)
hp=a.hp
at(s,slot,'FG01',96)
assert a.hp==hp and hammer.dir==-1
spot(a,-104)
step(s)
assert a.hp==hp-18 and hammer.seen[1]
a.inv=0
at(s,slot,'FG01',126)
assert a.hp==hp-18

spot(a,-69)
bolts=at(s,slot,'FG02',71)
hp=a.hp
for i,t in enumerate((78,102,126),1):
    at(s,slot,'FG02',t)
    assert bolts.shots[i] and a.hp==hp-i*10
    a.inv=0

# Phase 150 closes the pillar window before the pending hit of that same tick.
spot(a,-104)
pillar=at(s,slot,'FG03',149)
assert pillar.cracks==0
late=hit(-74)
late.remaining=1;late.interval=.12;late.next=s.t+1/60
s.pending[len(s.pending)+1]=late
hp=b.hp
step(s)
assert pillar.tick==150 and pillar.cracks==0 and b.hp<hp
assert pillar.seen[1]
hp=a.hp
a.inv=0
at(s,slot,'FG03',162)
assert a.hp==hp
ending=core.frame(s)
assert not any((draw.source or '')=='geo-pillar-source-v1.png' for draw in ending.draws.values())

# Reach the actual low shaft, walk through it, and break it with distinct casts.
s,slot,a=training();b=slot.enemy
pillar=at(s,slot,'FG03',35)
core.resolveCast(s,hit(-72))
assert pillar.cracks==0
step(s)
assert pillar.tick==36
assert core.frame(s).fieldBoss.label=='近くで柱に攻撃 0/3（震動まで1.9秒）'
hp=b.hp
core.resolveCast(s,hit(-108))
assert b.hp<hp and pillar.cracks==0
core.resolveCast(s,hit(-75,reaction=True))
assert pillar.cracks==0
spot(a,-32)
for _ in range(23):step(s,right=True)
assert a.x>HOME+27 and len(s.platforms)==1
spot(a,-74)
hp=b.hp
c=hit(-74)
core.resolveCast(s,c);core.resolveCast(s,c)
assert pillar.cracks==1 and b.hp==hp-18
hp=b.hp
core.resolveCast(s,hit(-74,'geo'))
assert pillar.cracks==2 and b.hp==hp
cash,expr,kill=s.mora,s.progression.killXp,s.kills
at(s,slot,'FG03',149)
core.resolveCast(s,hit(-74))
assert pillar.cracks==3 and pillar.exposure==0 and core.frame(s).fieldBoss.label=='柱破壊・核が静止（あと2.5秒）'
assert (s.mora,s.progression.killXp,s.kills)==(cash,expr,kill)
hp=a.hp
for _ in range(149):step(s)
assert pillar.exposure==149 and a.hp==hp and not pillar.seen[1]
step(s)
assert pillar.exposure==150 and core.frame(s).fieldBoss.label=='殻を組み直す'
for _ in range(23):step(s)
assert slot.cast.exposure==173 and a.hp==hp
step(s)
assert slot.cast is None

# The optional route is unnecessary: jump the floor wave on a normal jump arc.
s,slot,a=training()
pillar=at(s,slot,'FG03',132)
hp=a.hp
core.action(s,'jump')
for _ in range(32):step(s,jump=True)
assert a.hp==hp and not pillar.seen[1] and pillar.cracks==0

# Simultaneous pillar break and lethal core hit settles only the real enemy once.
s,slot,a=training();b=slot.enemy
pillar=at(s,slot,'FG03',70)
core.resolveCast(s,hit(-74))
core.resolveCast(s,hit(-74))
b.hp=1
cash,expr=s.mora,s.progression.killXp
core.resolveCast(s,hit(-74))
assert b.hp==0 and slot.phase=='respawn' and slot.cast is None
assert (s.mora-cash,s.progression.killXp-expr)==(spec['mora'],XP)
assert not core.defeatEnemy(s,b,1) and s.story.quests[QUEST].count==1
saved=validate_save(native(core.checkpoint(s)))
assert saved['fieldBosses'][ID]=={'generation':1,'hp':0,'waitTicks':3600}
restored=core.restore(lua.table_from(saved,recursive=True),12)
assert restored.story.node==HUB
cash,expr=restored.mora,restored.progression.questXp
core.action(restored,'story_report:'+QUEST)
core.action(restored,'story_report:'+QUEST)
assert (restored.mora-cash,restored.progression.questXp-expr)==(300,4000)
for _ in range(3599):step(restored)
assert restored.fieldSlots[ID].phase=='respawn'
step(restored)
assert restored.fieldSlots[ID].generation==2 and restored.fieldSlots[ID].enemy.hp==spec['hp']


def play(amber,near):
    s=make();slot=enter(s);b,a=slot.enemy,s.actors[1]
    if not amber:s.actors[2].hp=0
    start=s.t
    broken=set()
    jumps={'FG01':(79,),'FG02':(65,110),'FG03':(132,)}
    for _ in range(120*60):
        if b.hp<=0:
            return {'seconds':round(s.t-start,2),'hp':a.hp,'damage':s.damage,'brokenPillars':len(broken)}
        c=slot.cast
        if c:
            if c.exposure==0:broken.add(round(s.t,3))
            if a.ground and c.tick in jumps[c.move.id]:core.action(s,'jump')
        dx=b.x-a.x
        turn=a.dir<0
        at_dist=78 if near else 108
        step(s,right=dx>at_dist+5 or (turn and dx>=at_dist),
             left=dx<at_dist-5 or (turn and dx<at_dist),jump=True,attack=0<dx<125 and not turn)
        assert s.returns==0
    raise AssertionError(('physical fight timeout',b.hp,a.hp))


solo,party=play(False,False),play(True,True)
assert solo['brokenPillars']==0 and party['brokenPillars']>0
(ROOT/'evidence/geo-hypostasis-field-lua.json').write_text(json.dumps({
    'matches_manifest_timing':True,'ground_normal_during_hammer':True,'hammer_locks_side':True,'three_bolts':True,
    'short_pillar_is_passable':True,'simultaneous_core_hit_not_doubled':True,'pending_hit_at_150_cannot_interrupt':True,
    'optional_recovery_ticks':[150,24],'no_pillar_rewards':True,'ground_wave_jumpable':True,
    'lethal_hit_at_pillar_break_settles_once':True,'solo_normal':solo,'amber_companion':party,
    'field_kill':{'xp':XP,'mora':spec['mora']},'commission_report_once':{'xp':4000,'mora':300},'restored_respawn_ticks':3600,
},indent=2)+'\n',encoding='utf8')
print('Geo field hammer, three bolts, optional pillar, rewards and Lv32 clears passed:',solo,party)
