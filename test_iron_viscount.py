"""Verify the thermal route and the Iron Viscount's swimming counter through game inputs."""
from runtime import ROOT, native, runtime
from experience import LEVELS, RUNTIME_EXP
from savegame import validate_save
from tools.waypoint_test import TrailWalk
import json


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def write(path,data):
    (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


HUB='fontaine-hub'
HOST='fon-wp-50044'
VENT='iron-viscount-thermal-gallery'
STAGE='iron-viscount-legend-pool'
QUEST='fon-beryl-thermal-vents'
BOSS='legend-fontaine_iron_viscount'
SOURCE='fontaine-iron-viscount-poses-source-v1.png'
graph=read('content/story-graph.json')
nodes={row['id']:row for row in graph['nodes']}
exits={name:row['exits'] for name,row in nodes.items()}
edges={(name,e['to']):e for name,route in exits.items() for e in route}
quest=next(row for row in graph['quests'] if row['id']==QUEST)
spec=next(row for row in read('content/field-boss-spawns.json')['fieldBosses'] if row['id']==BOSS)
lua,core=runtime()
idle=lua.table()
dt=1/60


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def ready(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,HUB)
    core.grantExp(s,exp(level),'quest')
    core.enterStoryNode(s,HOST)
    return s,TrailWalk(lua,core,s,edges,exits)


def tick(s,count=1,input=idle):
    for _ in range(count):
        core.step(s,dt,input)


def until(s,predicate,ticks=740):
    for _ in range(ticks):
        if predicate():
            return
        tick(s)
    raise AssertionError((s.story.node,s.t,native(core.frame(s).fieldBoss)))


def locked(s,walk,to,reason):
    edge=edges[s.story.node,to]
    walk.approach(edge['x'],edge.get('y',480),to)
    prompt=core.frame(s).storyNearbyPortal
    assert prompt.to==to and not prompt.available and reason in prompt.reason
    origin=s.story.node
    core.action(s,'story_nearby_portal')
    assert s.story.node==origin and not s.lift


fixture,_=ready(100)
write('work/iron-viscount-fixture.json',validate_save(native(core.checkpoint(fixture))))
s,walk=ready(99)
locked(s,walk,VENT,'排熱弁')
core.action(s,'story_fast:'+HUB)
core.action(s,'story_accept:'+QUEST)
core.action(s,'story_fast:'+HOST)
state=s.story.quests[QUEST]
assert state.status=='active' and state.count==0
for i,step in enumerate(quest['itinerary'],1):
    if step['kind']=='arrive':
        assert s.story.node==step['from']
        walk.cross(step['node'])
    else:
        assert s.story.node==step['node']
        walk.approach(step['x'],step['y'],QUEST)
        core.action(s,'story_collect')
    assert state.count==i,(step,s.storyNotice)
    if i==1:
        locked(s,walk,VENT,'排熱弁')
    if i==3:
        assert s.storySwimming and not core.frame(s).storySwimCombat
        core.action(s,'skill1')
        assert not walk.actor.swimGuardUntil
assert s.story.node==HOST
walk.cross(VENT)
locked(s,walk,STAGE,'必要レベル')
core.grantExp(s,exp(100)-exp(99),'quest')
locked(s,walk,STAGE,'報告')
walk.cross(HOST)
core.action(s,'story_fast:'+HUB)
core.action(s,'story_report:'+QUEST)
assert state.status=='complete'
core.action(s,'story_fast:'+HOST)
core.action(s,'world_map_toggle')
core.action(s,'world_map_layer:hunt')
core.action(s,'world_map_select:'+STAGE)
atlas=core.frame(s).worldMap
assert atlas.selected.id==STAGE and atlas.guide.status=='ready'
assert [p.id for p in atlas.guide.stops.values()]==[VENT,STAGE]
core.action(s,'world_map_close')
walk.cross(VENT)
walk.cross(STAGE)
assert s.storySwimming and core.frame(s).storySwimCombat.counter
slot=s.fieldSlots[BOSS]
boss=slot.enemy
a=walk.actor
s.actors[2].hp=0


def put_in_strike(strike):
    a.x=(strike.left+strike.right)/2
    a.y=(strike.top+strike.bottom)/2+25
    a.hp,a.inv=a.maxhp,0


a.x,a.y,a.dir=boss.x-166,boss.y+28,1
until(s,lambda:slot.cast is not None)
cast=slot.cast
assert cast.move.id=='FW21' and boss.waterGuard
before=boss.hp
core.action(s,'normal')
guarded_damage=before-boss.hp
first=cast.strikes[1]
until(s,lambda:cast.tick==first.first-9)
put_in_strike(first)
core.action(s,'skill1')
assert core.frame(s).storySwimCombat.counter.guarding
guard_expiry=a.swimGuardUntil
core.action(s,'skill1')
assert a.swimGuardUntil==guard_expiry
until(s,lambda:first.seen[1])
assert a.hp==a.maxhp and not a.swimGuardUntil and a.swimCounterUntil>s.t
pref=core.frame(s,'sprite','legacy')
assert pref.fieldBoss.warnings[1].catchable and pref.storySwimCombat.counter.ready
assert any(d.source==SOURCE for d in pref.draws.values())
commands={k:core.frame(s,'rect',k).commands for k in ('legacy','h48c32','h32c16')}
assert commands['legacy']>commands['h48c32']>commands['h32c16']

before=boss.hp
core.action(s,'normal')
counter_damage=before-boss.hp
assert counter_damage>0 and not a.swimCounterUntil
assert 0<guarded_damage<counter_damage
until(s,lambda:slot.cast is None)

a.x,a.y=boss.x-165,boss.y+25
until(s,lambda:slot.cast is not None)
cast=slot.cast
assert cast.move.id=='FW22'
first=cast.strikes[1]
until(s,lambda:cast.tick==first.first-8)
put_in_strike(first)
assert (a.cd.swimGuard or 0)<=0
core.action(s,'skill1')
until(s,lambda:first.seen[1])
assert a.hp==a.maxhp-first.damage and not a.swimCounterUntil
second=cast.strikes[2]
until(s,lambda:cast.tick==second.first-1)
put_in_strike(second)
tick(s)
assert second.seen[1] and a.hp==a.maxhp-second.damage
until(s,lambda:slot.cast is None)

a.x,a.y=boss.x-164,boss.y+28
until(s,lambda:slot.cast is not None)
cast=slot.cast
assert cast.move.id=='FW23'
wave=cast.strikes[1]
until(s,lambda:cast.tick==wave.first-1)
a.x,a.y=(wave.left+wave.right)/2,wave.top-20
tick(s)
assert not wave.seen[1] and wave.activeRight-wave.activeLeft<wave.right-wave.left
a.y=(wave.top+wave.bottom)/2+25
a.hp,a.inv=a.maxhp,0
core.action(s,'skill1')
until(s,lambda:wave.seen[1])
assert a.hp==a.maxhp and a.swimCounterUntil>s.t
walk.cross(VENT)
assert (a.x,a.y)==(1110,343) and not a.swimCounterUntil and not a.cd.swimGuard
assert s.fieldSlots[BOSS] is None and not core.frame(s).storySwimCombat
walk.cross(STAGE)
slot=s.fieldSlots[BOSS]
assert slot.enemy.hp==spec['hp'] and slot.phase=='available'
assert not core.frame(s).storySwimCombat.counter.ready

# Normal movement and game actions from full HP, using K where the warnings allow it.
def auto_clear(s,slot):
    inputs={(x,y):lua.table(left=x<0,right=x>0,up=y<0,down=y>0,attack=True)
            for x in (-1,0,1) for y in (-1,0,1)}
    a=s.actors[s.active]
    start=s.t
    for _ in range(60*150):
        boss=slot.enemy
        if boss.hp<=0:
            return round(s.t-start,2),a.hp
        dx,dy=boss.x-a.x,boss.y+28-a.y
        mx=(1 if dx>0 else -1) if abs(dx)>175 or (abs(dx)>24 and dx*a.dir<0) else 0
        my=(1 if dy>0 else -1) if abs(dy)>12 else 0
        urgent=False
        cast=slot.cast
        if cast:
            for strike in cast.strikes.values():
                remaining=strike.first-cast.tick
                if not (-17<=remaining<=31 and not strike.seen[1] and strike.left-12<a.x<strike.right+12):
                    continue
                if strike.catchable and (a.cd.swimGuard or 0)<=0 and 2<=remaining<=14:
                    core.action(s,'skill1')
                    break
                if not a.swimGuardUntil or a.swimGuardUntil<=s.t:
                    if strike.top-8<a.y<strike.bottom+58:
                        safe=[y for y in (strike.top-9,strike.bottom+58) if s.storySwimming.top<=y<=s.storySwimming.bottom]
                        if safe:
                            target=min(safe,key=lambda y:abs(a.y-y))
                            mx,my=0,1 if a.y<target else -1
                            urgent=0<=remaining<=14
                        else:
                            mx=-1 if a.x-strike.left<strike.right-a.x else 1
                    else:
                        my=0
                break
        tick(s,input=inputs[mx,my])
        if urgent and (a.cd.swimBurst or 0)<=0:
            core.action(s,'dodge')
        assert a.hp>0 and s.returns==0,(s.t-start,boss.hp)
    raise AssertionError((s.t-start,slot.enemy.hp))


kills,xp,mora=s.kills,s.progression.killXp,s.mora
seconds,hp=auto_clear(s,slot)
reward=round(LEVELS[99]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'])
assert (s.kills,s.progression.killXp,s.mora)==(kills+1,xp+reward,mora+spec['mora'])
core.onKill(s,slot.enemy)
assert s.kills==kills+1 and slot.phase=='cleared' and s.endgame.bosses[BOSS].clears==1
saved=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(saved,recursive=True),12)
assert restored.story.node==HUB and restored.story.quests[QUEST].status=='complete'
assert restored.endgame.bosses[BOSS].clears==1 and BOSS not in saved.get('fieldBosses',{})

write('evidence/iron-viscount-lua.json',{
    'sixQuestObjectives':quest['goal'],'normalRouteInitiallyLocked':True,
    'separateReportAndLevelGate':True,'nestedAtlasRoute':[HOST,VENT,STAGE],
    'aquaticCatchGuardedAndCounterDamage':{'guarded':guarded_damage,'counter':counter_damage},
    'hotWaterCannotBeCaught':True,'bothDepthsHitAndMovingWave':True,
    'retreatClearsGuardChargeAndKeepsExitDepth':True,'reentryAtFullBossHealth':True,
    'pausedRectangles':commands,'soloClear':{'seconds':seconds,'hp':hp,'killXp':reward},
    'savePreservesQuestAndSingleReward':True,
})
print(f'Iron Viscount: thermal route, guard, reentry and rewards passed, solo clear {seconds}s (HP {hp}).')
