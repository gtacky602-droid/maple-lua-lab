"""Test Luachra's moving rush, the reflected bubble, and the Morte quest's route switch."""
import json
from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def write(path,data):
    (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


HUB='fontaine-hub'
QUEST='fon-morte-sluice-survey'
LU='legend-fontaine_luachra_the_brilliant'
CH='legend-fontaine_chassanion'
LU_HOST='fon-wp-53865'
CH_HOST='fon-wp-55765'
TOWER='morte-tower-sluice'
graph=read('content/story-graph.json')
nodes={n['id']:n for n in graph['nodes']}
exits={key:n['exits'] for key,n in nodes.items()}
edges={(key,e['to']):e for key,route in exits.items() for e in route}
quest=next(q for q in graph['quests'] if q['id']==QUEST)
specs={s['id']:s for s in read('content/field-boss-spawns.json')['fieldBosses'] if s['id'] in (LU,CH)}
lua,core=runtime()
idle=lua.table()
dt=1/60


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def start(level,host):
    s=core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,HUB)
    core.grantExp(s,exp(level),'quest')
    core.enterStoryNode(s,host)
    return s,TrailWalk(lua,core,s,edges,exits)


def tick(s,count=1,input=idle):
    for _ in range(count):
        core.step(s,dt,input)


def until(s,predicate):
    for _ in range(650):
        if predicate():
            return
        tick(s)
    raise AssertionError(native(core.frame(s).fieldBoss))


def route(s,stage,stops):
    core.action(s,'world_map_toggle')
    core.action(s,'world_map_layer:hunt')
    core.action(s,'world_map_select:'+stage)
    atlas=core.frame(s).worldMap
    assert atlas.selected.id==stage and atlas.guide.status=='ready'
    assert [point.id for point in atlas.guide.stops.values()]==stops
    core.action(s,'world_map_close')


def gate_glance(s,walk,to):
    e=edges[s.story.node,to]
    walk.approach(e['x'],e['y'],to)
    return core.frame(s).storyNearbyPortal


def before_level(s,walk,stage):
    gate=gate_glance(s,walk,stage)
    assert gate.to==stage and not gate.available and '必要レベル 100' in gate.reason
    core.action(s,'story_nearby_portal')
    assert s.story.node!=stage
    core.grantExp(s,exp(100)-exp(99),'quest')


def start_cast(s,slot,actor,offset=175):
    boss=slot.enemy
    turn=1 if boss.x-offset>=355 else -1
    actor.x,actor.y,actor.dir=boss.x-turn*offset,boss.y+28,turn
    until(s,lambda:slot.cast is not None)
    return slot.cast


def auto_clear(s,slot,spec):
    start_time=s.t
    actor=s.actors[s.active]
    boss=slot.enemy
    inputs={(x,y):lua.table(left=x<0,right=x>0,up=y<0,down=y>0,attack=True)
            for x in (-1,0,1) for y in (-1,0,1)}
    reflected=set()
    for _ in range(60*145):
        if boss.hp<=0:
            return {'seconds':round(s.t-start_time,2),'hp':actor.hp,'bubblesReturned':len(reflected)}
        dx=boss.x-actor.x
        mx=(1 if dx>0 else -1) if abs(dx)>164 or (abs(dx)>28 and dx*actor.dir<0) else 0
        if actor.x<spec['arenaMin']+12 and mx<0:
            mx=0
        wanted=boss.y+28
        cast=slot.cast
        if cast:
            for index,orb in enumerate(cast.strikes.values()):
                skill=spec['swimPlayer'].get('reflect')
                forward=(orb.x-actor.x)*actor.dir
                if skill and orb.reflectable and not orb.reflection and cast.tick>=orb.first and cast.tick<orb.after and \
                    (actor.cd.swimReflect or 0)<=0 and -12<=forward<=skill['range'] and \
                    abs(orb.y-(actor.y-28))<=skill['vertical']:
                    core.action(s,'skill1')
                    if orb.reflection:
                        reflected.add((round(s.t,4),index))
                    break
            danger=[w for w in cast.strikes.values() if not w.reflection and not w.seen[1] and
                    cast.tick<w.after and w.left-15<actor.x<w.right+15 and not w.reflectable]
            if danger:
                safe=[y for y in range(156,478,5) if all(y<w.top-12 or y>w.bottom+64 for w in danger)]
                if safe:
                    wanted=min(safe,key=lambda y:abs(y-wanted))
            if spec['id']==CH:
                candidate=next((w for w in cast.strikes.values() if w.reflectable and not w.reflection
                                and cast.tick<w.after and w.x>actor.x and actor.dir>0),None)
                if candidate and all(candidate.y+28<w.top-12 or candidate.y+28>w.bottom+64 for w in danger):
                    wanted=candidate.y+28
        dy=wanted-actor.y
        my=(1 if dy>0 else -1) if abs(dy)>7 else 0
        tick(s,input=inputs[mx,my])
        assert actor.hp>0 and s.returns==0,(spec['id'],s.t-start_time,boss.hp)
    raise AssertionError((spec['id'],s.t-start_time,boss.hp))


def verify_clear(s,spec,slot):
    before=(s.kills,s.progression.killXp,s.mora)
    record=s.endgame.bosses[spec['id']] if s.endgame else None
    clears=(record.clears if record else 0)+1
    solo=auto_clear(s,slot,spec)
    reward=round(LEVELS[99]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'])
    assert (s.kills,s.progression.killXp,s.mora)==(before[0]+1,before[1]+reward,before[2]+spec['mora'])
    core.onKill(s,slot.enemy)
    assert slot.phase=='cleared' and s.kills==before[0]+1 and s.endgame.bosses[spec['id']].clears==clears
    save=validate_save(native(core.checkpoint(s)))
    restored=core.restore(lua.table_from(save,recursive=True),12)
    assert restored.story.node==HUB and restored.endgame.bosses[spec['id']].clears==clears
    return dict(solo,killXp=reward),restored


fixture,_=start(100,LU_HOST)
core.enterStoryNode(fixture,CH_HOST)
write('work/fontaine-bubble-fixture.json',validate_save(native(core.checkpoint(fixture))))

lu=specs[LU]
s,walk=start(99,LU_HOST)
before_level(s,walk,lu['node'])
route(s,lu['node'],[lu['node']])
walk.cross(lu['node'])
a=walk.actor
s.actors[2].hp=0
slot=s.fieldSlots[LU]
boss=slot.enemy
original=boss.x
cast=start_cast(s,slot,a)
assert cast.move.id=='FW47' and not core.frame(s).storySwimCombat.reflect
strike=cast.strikes[1]
assert strike.dash and boss.x==strike.origin==original
until(s,lambda:cast.tick==strike.first+3)
assert boss.x==strike.x and boss.x!=original and not strike.seen[1]
a.inv=0
until(s,lambda:strike.seen[1])
assert a.hp==a.maxhp-strike.damage
until(s,lambda:slot.cast is None)
assert boss.x==strike.destination
for key in ['FW48','FW49']:
    a.hp=a.maxhp
    cast=start_cast(s,slot,a)
    assert cast.move.id==key and all(w.orb and not w.reflectable for w in cast.strikes.values())
    until(s,lambda:slot.cast is None)
walk.cross(LU_HOST)
assert not core.frame(s).storySwimCombat
walk.cross(lu['node'])
a.hp=a.maxhp
solo_lu,_=verify_clear(s,lu,s.fieldSlots[LU])

ch=specs[CH]
s,walk=start(99,CH_HOST)
before_level(s,walk,ch['node'])
route(s,ch['node'],[ch['node']])
walk.cross(ch['node'])
a=walk.actor
s.actors[2].hp=0
slot=s.fieldSlots[CH]
boss=slot.enemy
assert not core.frame(s).storyScenery
cast=start_cast(s,slot,a)
strike=cast.strikes[1]
assert cast.move.id=='FW51' and strike.reflectable
core.action(s,'skill1')
assert a.cd.swimReflect>0 and not strike.reflection
until(s,lambda:core.frame(s).storySwimCombat.reflect.ready and (a.cd.swimReflect or 0)<=0)
before=boss.hp
core.action(s,'skill1')
assert strike.reflection and not strike.reflection.impact and boss.hp==before
assert core.frame(s).fieldBoss.warnings[1].returning
assert not strike.seen[1]
tick(s,ch['swimPlayer']['reflect']['returnTicks']-1)
assert boss.hp==before and not strike.reflection.impact
tick(s)
reflected_damage=before-boss.hp
assert reflected_damage>0 and strike.reflection.impact
tick(s,3)
assert boss.hp==before-reflected_damage and a.hp==a.maxhp
until(s,lambda:slot.cast is None)
cast=start_cast(s,slot,a,offset=147)
assert cast.move.id=='FW52'
ordinary=cast.strikes[1]
a.y=ordinary.y+28
until(s,lambda:cast.tick==ordinary.first)
assert not core.frame(s).storySwimCombat.reflect.ready and not ordinary.reflectable
core.action(s,'skill1')
assert not ordinary.reflection and a.cd.swimReflect>0
boss.hp=1
a.y=boss.y+28
core.action(s,'normal')
assert slot.phase=='cleared' and s.endgame.bosses[CH].clears==1
walk.cross(CH_HOST)
assert a.y==edges[CH_HOST,ch['node']]['y'] and not a.cd.swimReflect and not core.frame(s).storySwimCombat
assert s.fieldSlots[CH] is None

core.action(s,'story_fast:'+HUB)
core.action(s,'story_accept:'+QUEST)
core.action(s,'story_fast:'+CH_HOST)
assert s.story.quests[QUEST].count==0
for i,step in enumerate(quest['itinerary'],1):
    if step['kind']=='arrive':
        walk.cross(step['node'])
    else:
        assert s.story.node==step['node']
        walk.approach(step['x'],step['y'],QUEST)
        core.action(s,'story_collect')
    assert s.story.quests[QUEST].count==i,(step,s.storyNotice)
route(s,ch['node'],[ch['node']])
core.action(s,'story_fast:'+HUB)
def map_room(state):
    f=core.frame(state)
    room=next(n for n in f.storyGraph.nodes.values() if n.id==ch['node'])
    return room.name,f.storyGraphRevision

old_name,old_revision=map_room(s)
assert old_name==nodes[ch['node']]['name']
core.action(s,'story_report:'+QUEST)
new_name,new_revision=map_room(s)
assert new_name==nodes[ch['node']]['locationAfterReport']['name'] and new_revision>old_revision
saved=validate_save(native(core.checkpoint(s)))
resumed=core.restore(lua.table_from(saved,recursive=True),12)
assert map_room(resumed)[0]==new_name

assert s.story.quests[QUEST].status=='complete'
core.action(s,'story_fast:'+CH_HOST)
route(s,ch['node'],[TOWER,ch['node']])
direct=gate_glance(s,walk,ch['node'])
assert not direct or direct.to!=ch['node']
walk.cross(TOWER)
walk.cross(ch['node'])
assert core.frame(s).storyScenery=='bygoneResonance' and '下層' in core.frame(s).location
slot=s.fieldSlots[CH]
assert slot.enemy.hp==ch['hp']
walk.cross(TOWER)
assert (a.x,a.y)==(1125,316) and s.fieldSlots[CH] is None
walk.cross(ch['node'])
a.hp=a.maxhp
solo_ch,restored=verify_clear(s,ch,s.fieldSlots[CH])
assert solo_ch['bubblesReturned']>0 and restored.story.quests[QUEST].status=='complete'
assert restored.endgame.bosses[CH].clears==2

write('evidence/fontaine-bubble-lua.json',{
  'luachra':{'dashMovesActualBodyAndHitsOnce':True,'otherMoves':['FW48','FW49'],'soloClear':solo_lu},
  'chassanion':{'returnImpactDamage':reflected_damage,'earlyKStartsCooldown':True,'ordinaryBubbleCannotBeReturned':True,
     'bubbleTravelsBeforeSingleImpact':True,'outsideAndInsideWithSingleRecord':True,'soloClear':solo_ch},
  'optionalSurveySteps':quest['goal'],'routeAfterReport':[CH_HOST,TOWER,ch['node']],
  'bothUseLv100GateAndRechallenge':True,'bothSaveReward':True
})
print('Luachra',solo_lu,'Chassanion',solo_ch)
