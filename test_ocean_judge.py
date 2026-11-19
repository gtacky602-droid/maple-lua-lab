"""Run the first aquatic arena through standard adventure, combat and save entry points."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def write(path, data):
    (ROOT/path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


HOST = 'fon-wp-50065'
STAGE = 'ocean-judge-legend-pool'
BOSS = 'legend-fontaine_ocean_circuit_judge'
SOURCE = 'fontaine-ocean-judge-poses-source-v1.png'
graph = read('content/story-graph.json')
nodes = {n['id']:n for n in graph['nodes']}
exits = {id:n['exits'] for id,n in nodes.items()}
edges = {(id,e['to']):e for id,route in exits.items() for e in route}
spec = next(row for row in read('content/field-boss-spawns.json')['fieldBosses'] if row['id']==BOSS)
layout = read('assets/fontaine-ocean-judge-poses-v1-layout.json')
lua, core = runtime()
dt = 1/60
idle = lua.table()
attack = lua.table(attack=True)
up = lua.table(up=True)
down = lua.table(down=True)


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def tick(s, count=1, input=idle):
    for _ in range(count):
        core.step(s,dt,input)


def until(s, predicate, ticks=750):
    for _ in range(ticks):
        if predicate():
            return
        tick(s)
    raise AssertionError((s.story.node, s.t, native(core.frame(s).fieldBoss)))


def player(s):
    return s.actors[s.active]


def start():
    s=core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,'fontaine-hub')
    core.grantExp(s,exp(99),'quest')
    core.enterStoryNode(s,HOST)
    return s,TrailWalk(lua,core,s,edges,exits)


s, walk = start()
assert s.storySwimming and not core.frame(s).storySwimCombat
gate=edges[HOST,STAGE]
walk.approach(gate['x'],gate['y'],STAGE)
assert '必要レベル 100' in core.frame(s).storyNearbyPortal.reason
core.action(s,'story_nearby_portal')
assert s.story.node==HOST
core.grantExp(s,exp(100)-exp(99),'quest')
core.action(s,'world_map_toggle')
core.action(s,'world_map_layer:hunt')
core.action(s,'world_map_select:'+STAGE)
map_view=core.frame(s).worldMap
assert map_view.selected.id==STAGE and map_view.guide.status=='ready'
assert map_view.guide.stops[1].id==STAGE
core.action(s,'world_map_close')
before=validate_save(native(core.checkpoint(s)))
write('work/ocean-judge-fixture.json',before)
assert nodes[HOST]['mapPoint']=='teyvat:50065' and nodes[STAGE]['peaceful']

# Ordinary swimming does not use the arena attack or the burst.
x=player(s).x
core.action(s,'dodge')
tick(s,10,attack)
assert player(s).x==x and not player(s).cd.swimPulse and not player(s).cd.swimBurst

walk.cross(STAGE)
assert s.storySwimming and core.frame(s).storySwimCombat and len(s.enemies)==1
slot=s.fieldSlots[BOSS]
boss=slot.enemy
assert boss.hp==spec['hp']
s.actors[2].hp=0
a=player(s)
depth=a.y
tick(s,2,up)
before_burst=a.y
core.action(s,'jump')
assert abs(a.y-(before_burst-spec['swimPlayer']['burstDistance']))<.01
assert a.y<depth and a.inv>0 and a.cd.swimBurst>0
core.action(s,'jump')
assert abs(a.y-(before_burst-spec['swimPlayer']['burstDistance']))<.01

# The pulse requires facing the enemy at a usable depth.
a.x,a.y,a.dir=boss.x-165,boss.y-84,1
tick(s,1,attack)
assert boss.hp==boss.maxhp
a.cd.swimPulse=0
a.y,a.dir=boss.y+28,-1
tick(s,1,attack)
assert boss.hp==boss.maxhp
a.cd.swimPulse=0
a.dir=1
tick(s,1,attack)
assert boss.hp<boss.maxhp and a.cd.swimPulse>0
pulse_damage=boss.maxhp-boss.hp
tick(s,1,attack)
assert boss.hp==boss.maxhp-pulse_damage
a.inv=0

for f in layout['frames']:
    art=read(f"assets/{f['id']}-field-{f['pose']}-sprites-v1.json")
    assert art['source']==SOURCE
    x,y,w,h=art['box']
    assert y+h==f['crop'][1]+f['pivot'][1]
    assert abs(x+w*art['anchorX']-(f['crop'][0]+layout['swimCenter'][0])) < 1e-7

tests={}
for move in spec['moves']:
    a.x,a.y=boss.x-172,boss.y+29
    a.hp,a.inv=a.maxhp,0
    until(s,lambda: slot.cast is not None)
    cast=slot.cast
    assert cast.move.id==move['id']
    frame=core.frame(s,'sprite','legacy')
    body=next(d for d in frame.draws.values() if d.source==SOURCE)
    assert abs(body.y-(boss.y+spec['artPivotOffset']*spec['artScale']))<.001
    tested=[]
    if move.get('guardUntil'):
        before=boss.hp
        a.cd.swimPulse=0
        a.dir=1
        tick(s,1,attack)
        front=before-boss.hp
        a.x,a.dir=boss.x+166,-1
        a.cd.swimPulse=0
        before=boss.hp
        tick(s,1,attack)
        back=before-boss.hp
        assert 0<front<back and frame.storySwimCombat.guard
        tests['armor']={'frontDamage':front,'rearDamage':back}

    for index,phase in enumerate(move['steps'],1):
        strike=cast.strikes[index]
        to=phase['first']-1
        until(s,lambda:cast.tick>=to)
        a.hp,a.inv=a.maxhp,0
        a.x=(strike.left+strike.right)/2
        if phase.get('travel'):
            # Same depth as the eventual wave, but initially outside the dynamic strike.
            a.y=strike.top-20
            tick(s)
            assert not strike.seen[1] and a.hp==a.maxhp
            assert strike.activeRight-strike.activeLeft<strike.right-strike.left
            a.y=(strike.top+strike.bottom)/2+25
            until(s,lambda:strike.seen[1],phase['after']-phase['first'])
        else:
            a.y=(strike.top+strike.bottom)/2+25
            tick(s)
            assert strike.seen[1]
        assert a.hp==a.maxhp-phase['damage']
        a.inv=0
        tick(s)
        assert a.hp==a.maxhp-phase['damage']
        tested.append(index)
    until(s,lambda:slot.cast is None)
    tests[move['id']]=tested

a.x,a.y=boss.x-170,boss.y+28
a.inv=99
until(s,lambda:slot.cast is not None)
preview=core.frame(s,'rect','legacy')
commands={profile:core.frame(s,'rect',profile).commands for profile in ('legacy','h48c32','h32c16')}
assert commands['legacy']>commands['h48c32']>commands['h32c16']
core.action(s,'pause')
time=s.t
tick(s,8,attack)
assert s.t==time and core.frame(s).fieldBoss.tick==preview.fieldBoss.tick
core.action(s,'pause')

walk.cross(HOST)
assert not core.frame(s).storySwimCombat and s.fieldSlots[BOSS] is None
assert (player(s).x,player(s).y)==(gate['x'],gate['y'])
walk.cross(STAGE)
slot=s.fieldSlots[BOSS]
boss=slot.enemy
a=player(s)
assert slot.phase=='available' and boss.hp==boss.maxhp
assert all(not e.spawnId for e in s.enemies.values())

# Full clear using held J and swimming. Test positions above were precise hit checks only.
def auto_clear(s,slot):
    s.actors[2].hp=0
    a=player(s)
    began=s.t
    inputs={(x,y):lua.table(left=x<0,right=x>0,up=y<0,down=y>0,attack=True)
            for x in (-1,0,1) for y in (-1,0,1)}
    for _ in range(60*155):
        if slot.enemy.hp<=0:
            return round(s.t-began,2),a.hp
        b=slot.enemy
        dx,dy=b.x-a.x,b.y+28-a.y
        move_x=(1 if dx>0 else -1) if abs(dx)>180 or (abs(dx)>24 and dx*a.dir<0) else 0
        move_y=(1 if dy>0 else -1) if abs(dy)>11 else 0
        cast=slot.cast
        urgent=False
        if cast:
            for strike in cast.strikes.values():
                if -16<=strike.first-cast.tick<=31 and not strike.seen[1] and strike.left-12<a.x<strike.right+12:
                    if strike.top-8<a.y<strike.bottom+58:
                        safe=[y for y in (strike.top-9,strike.bottom+58)
                              if s.storySwimming.top<=y<=s.storySwimming.bottom]
                        if safe:
                            goal=min(safe,key=lambda y:abs(a.y-y))
                            move_y=1 if a.y<goal else -1
                            move_x=0
                            urgent=0<=strike.first-cast.tick<=14
                        else:
                            move_x=-1 if a.x-strike.left<strike.right-a.x else 1
                    else:
                        move_y=0
                    break
        tick(s,1,inputs[move_x,move_y])
        if urgent and (a.cd.swimBurst or 0)<=0:
            core.action(s,'dodge')
        assert a.hp>0 and not s.returns, (s.t-began,b.hp)
    raise AssertionError((s.t-began,slot.enemy.hp))


start_kills,start_xp,start_mora=s.kills,s.progression.killXp,s.mora
seconds,hp=auto_clear(s,slot)
reward=round(LEVELS[99]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'])
assert s.kills==start_kills+1 and s.progression.killXp==start_xp+reward and s.mora==start_mora+spec['mora']
assert slot.phase=='cleared' and s.endgame.bosses[BOSS].clears==1
core.onKill(s,boss)
tick(s,12)
assert s.kills==start_kills+1 and s.endgame.bosses[BOSS].clears==1
saved=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(saved,recursive=True),12)
assert restored.story.node=='fontaine-hub' and restored.endgame.bosses[BOSS].clears==1
assert BOSS not in saved.get('fieldBosses',{})

# A total KO uses the normal checkpoint and abandons the arena state.
walk.cross(HOST)
walk.cross(STAGE)
for swimmer in s.actors.values():
    swimmer.hp=0
tick(s)
assert s.returns==1 and s.story.node=='fontaine-hub' and s.fieldSlots[BOSS] is None
assert all(swimmer.hp==swimmer.maxhp for swimmer in s.actors.values())

write('evidence/ocean-judge-lua.json',{
    'entryLevel100MapGuideAndSwimReturn':True, 'ordinarySwimmingUnaffected':True,
    'directionAndDepthTested':True,'directionalBurstWithCooldown':True,
    'pausedFrameDrawCommands':commands,'attackChecks':tests,
    'normalSwimClear':{'seconds':seconds,'hp':hp, 'xp':reward,'mora':spec['mora']},
    'defeatSaveAndSingleReward':True,'checkpointOnWipe':True,
})
print(f'Ocean judge: aquatic entry, combat and save passed, solo clear {seconds}s (HP {hp}).')
