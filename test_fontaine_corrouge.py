"""Exercise the two gates and the timed, returnable mines in Corrouge's arena."""
import json
from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def write(path,value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


HUB='fontaine-hub'
HOST='fon-wp-55784'
WATER='erinnyes-root-waterway'
ARENA='erinnyes-corrouge-cleft'
QUEST='fon-erinnyes-root-water-survey'
BOSS='legend-fontaine_mageblade_corrouge'
graph=read('content/story-graph.json')
exits={n['id']:n['exits'] for n in graph['nodes']}
edges={(id,e['to']):e for id,route in exits.items() for e in route}
quest=next(q for q in graph['quests'] if q['id']==QUEST)
spec=next(enemy for enemy in read('content/field-boss-spawns.json')['fieldBosses'] if enemy['id']==BOSS)
skill=spec['swimPlayer']['reflect']
lua,core=runtime()
idle=lua.table()
dt=1/60


def instrument(state,step,checked):
    art=graph['waterInstruments'][step['waterInstrument']]
    for packed in (False,True):
        state.packRectArt=packed
        try:
            frame=core.frame(state,'rect','h32c16')
            shapes={(d.x+state.camera-step['x'],d.y-step['y'],d.w,d.h,d.color)
                    for d in frame.draws.values() if d.kind=='rect'}
            for row in art['base']+art['after' if checked else 'before']:
                assert tuple(row) in shapes,(step['objective'],checked,row)
            assert tuple(art['before' if checked else 'after'][0]) not in shapes
        finally:
            state.packRectArt=None


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def start(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,HUB)
    core.grantExp(s,exp(level),'quest')
    core.enterStoryNode(s,HOST)
    return s


def tick(s,n=1,input=idle):
    for _ in range(n):
        core.step(s,dt,input)


def until(s,predicate):
    for _ in range(650):
        if predicate():
            return
        tick(s)
    raise AssertionError(native(core.frame(s).fieldBoss))


def locked(s,walk,to,reason):
    e=edges[s.story.node,to]
    walk.approach(e['x'],e['y'],to)
    portal=core.frame(s).storyNearbyPortal
    assert portal.to==to and not portal.available and reason in portal.reason
    origin=s.story.node
    core.action(s,'story_nearby_portal')
    assert s.story.node==origin and not s.lift


def first_cast(s,slot,a):
    b=slot.enemy
    a.x,a.y,a.dir=b.x-210,b.y+28,1
    until(s,lambda:slot.cast is not None)
    assert slot.cast.move.id=='FW54'
    return slot.cast


def clear(s,slot):
    a=s.actors[s.active]
    start_time=s.t
    inputs={(x,y):lua.table(left=x<0,right=x>0,up=y<0,down=y>0,attack=True)
            for x in (-1,0,1) for y in (-1,0,1)}
    returned=0
    for _ in range(150*60):
        b=slot.enemy
        if b.hp<=0:
            return {'seconds':round(s.t-start_time,2),'hp':a.hp,'bubblesReturned':returned}
        dx=b.x-a.x
        target_y=b.y+28
        mx=(1 if dx>0 else -1) if abs(dx)>169 or (abs(dx)>28 and dx*a.dir<0) else 0
        cast=slot.cast
        if cast:
            candidates=[w for w in cast.strikes.values() if w.setAt and not w.reflection and cast.tick<w.first
                         and -12<=(w.x-a.x)*a.dir<=skill['range'] and abs(w.y+28-a.y)<=skill['vertical']]
            if any(cast.tick>=w.setAt for w in candidates) and (a.cd.swimReflect or 0)<=0:
                core.action(s,'skill1')
                if any(w.reflection for w in candidates):
                    returned+=1
            hazards=[w for w in cast.strikes.values() if not w.reflection and not w.seen[1]
                     and w.first-19<=cast.tick<w.after and w.left-13<a.x<w.right+13]
            if hazards:
                choices=[y for y in range(153,474,5) if all(y<w.top-11 or y>w.bottom+61 for w in hazards)]
                if choices:
                    target_y=min(choices,key=lambda y:abs(y-target_y))
        dy=target_y-a.y
        my=(1 if dy>0 else -1) if abs(dy)>7 else 0
        tick(s,input=inputs[mx,my])
        assert a.hp>0 and s.returns==0,(s.t-start_time,b.hp)
    raise AssertionError((s.t-start_time,slot.enemy.hp))


write('work/fontaine-corrouge-fixture.json',validate_save(native(core.checkpoint(start(100)))))
s=start(99)
walk=TrailWalk(lua,core,s,edges,exits)
locked(s,walk,WATER,'依頼')
core.action(s,'story_fast:'+HUB)
core.action(s,'story_accept:'+QUEST)
core.action(s,'story_fast:'+HOST)
state=s.story.quests[QUEST]
assert state.count==0
for i,step in enumerate(quest['itinerary'],1):
    if step['kind']=='arrive':
        walk.cross(step['node'])
    else:
        assert s.story.node==step['node']
        walk.approach(step['x'],step['y'],QUEST)
        instrument(s,step,False)
        core.action(s,'story_collect')
        instrument(s,step,True)
    assert state.count==i,(step,s.storyNotice)
    if i==2:
        assert s.storySwimming and not core.frame(s).storySwimCombat
        locked(s,walk,ARENA,'必要レベル 100')
        core.grantExp(s,exp(100)-exp(99),'quest')
        locked(s,walk,ARENA,'報告')
assert s.story.node==HOST
core.action(s,'story_fast:'+HUB)
core.action(s,'story_report:'+QUEST)
assert state.status=='complete'
core.action(s,'story_fast:'+HOST)
core.action(s,'world_map_toggle')
core.action(s,'world_map_layer:hunt')
core.action(s,'world_map_select:'+ARENA)
guide=core.frame(s).worldMap
assert guide.selected.id==ARENA and guide.guide.status=='ready'
assert [p.id for p in guide.guide.stops.values()]==[WATER,ARENA]
core.action(s,'world_map_close')
walk.cross(WATER)
walk.cross(ARENA)
a=walk.actor
s.actors[2].hp=0
slot=s.fieldSlots[BOSS]
b=slot.enemy
cast=first_cast(s,slot,a)
mine=cast.strikes[1]
a.x,a.y=mine.x-114,mine.y+28
initial=mine.x,mine.y
assert cast.tick<mine.setAt and not core.frame(s).storySwimCombat.reflect.ready
until(s,lambda:cast.tick==mine.setAt)
assert core.frame(s).fieldBoss.warnings[1].returnWindow and not core.frame(s).fieldBoss.warnings[1].active
assert (mine.x,mine.y)==initial and a.hp==a.maxhp
a.dir=-1
assert not core.frame(s).storySwimCombat.reflect.ready
a.dir=1
until(s,lambda:cast.tick==104)
assert cast.tick<mine.first and (mine.x,mine.y)==initial
before=b.hp
core.action(s,'skill1')
assert mine.reflection and not mine.reflection.impact and b.hp==before
assert core.frame(s).fieldBoss.warnings[1].returning
a.x=initial[0]
until(s,lambda:cast.tick==mine.first+1)
assert b.hp==before and not mine.seen[1] and a.hp==a.maxhp
until(s,lambda:mine.reflection.impact)
returned_damage=before-b.hp
assert returned_damage>0
tick(s,3)
assert b.hp==before-returned_damage and a.hp==a.maxhp
walk.cross(WATER)
assert a.y==324 and s.fieldSlots[BOSS] is None and not a.cd.swimReflect

walk.cross(ARENA)
slot=s.fieldSlots[BOSS]
assert slot.enemy.hp==spec['hp']
cast=first_cast(s,slot,a)
mine=cast.strikes[1]
a.x,a.y=mine.x,mine.y+28
until(s,lambda:cast.tick==mine.first-1)
assert a.hp==a.maxhp and not mine.seen[1]
tick(s)
frame=core.frame(s)
assert not frame.fieldBoss.warnings[1].returnWindow and frame.fieldBoss.warnings[1].active
assert a.hp==a.maxhp-mine.damage and mine.seen[1]
core.action(s,'skill1')
assert not mine.reflection
a.inv=0
tick(s)
assert a.hp==a.maxhp-mine.damage
until(s,lambda:slot.cast is None)
a.x,a.y=slot.enemy.x-190,slot.enemy.y+28
until(s,lambda:slot.cast is not None)
cast=slot.cast
assert cast.move.id=='FW55'
assert all(w.orb and not w.setAt and not w.reflectable for w in cast.strikes.values())
until(s,lambda:slot.cast is None)
a.x,a.y=slot.enemy.x-190,slot.enemy.y+28
until(s,lambda:slot.cast is not None)
cast=slot.cast
assert cast.move.id=='FW56' and [w.first for w in cast.strikes.values()]==[102,151,172]
walk.cross(WATER)
walk.cross(ARENA)
a.hp=a.maxhp
slot=s.fieldSlots[BOSS]
kills,mora,xp=s.kills,s.mora,s.progression.killXp
solo=clear(s,slot)
assert solo['bubblesReturned']>0
reward=round(LEVELS[99]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'])
assert (s.kills,s.mora,s.progression.killXp)==(kills+1,mora+spec['mora'],xp+reward)
core.onKill(s,slot.enemy)
assert s.kills==kills+1 and s.endgame.bosses[BOSS].clears==1
save=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(save,recursive=True),12)
assert restored.story.node==HUB and restored.story.quests[QUEST].status=='complete'
assert restored.endgame.bosses[BOSS].clears==1 and BOSS not in save.get('fieldBosses',{})
for step in quest['itinerary']:
    if step.get('waterInstrument'):
        core.enterStoryNode(restored,step['node'])
        restored.camera=step['x']-480
        instrument(restored,step,True)

write('evidence/fontaine-corrouge-lua.json',{
    'surveySteps':quest['goal'],'levelAndReportChecked':True,'route':[HOST,WATER,ARENA],
    'stationaryBubbleReturnBeforeBurst':True,'burstClosesReturnAndHitsOnce':True,
    'wrongFacingRejected':True,'returnedDamage':returned_damage,'movingBubblesAndStaggeredBursts':True,
    'retreatResetsFight':True,'questAndSingleRewardPersist':True,'soloClear':dict(solo,killXp=reward)})
print('Corrouge:',solo)
