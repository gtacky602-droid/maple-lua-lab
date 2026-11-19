"""Exercise both sonar arenas using the Lua lab's ordinary gates and inputs."""
import json
from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def write(path,value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


HUB='fontaine-hub'
HOSTS={'legend-fontaine_fading_veteran':'fon-wp-50073',
       'legend-fontaine_dobharcu_lord_of_the_hidden':'fon-wp-50062'}
graph=read('content/story-graph.json')
nodes={row['id']:row for row in graph['nodes']}
exits={id:row['exits'] for id,row in nodes.items()}
edges={(id,e['to']):e for id,route in exits.items() for e in route}
specs={row['id']:row for row in read('content/field-boss-spawns.json')['fieldBosses'] if row['id'] in HOSTS}
lua,core=runtime()
idle=lua.table()
dt=1/60


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def tick(s,count=1,input=idle):
    for _ in range(count):
        core.step(s,dt,input)


def until(s,predicate,allowance=820):
    for _ in range(allowance):
        if predicate():
            return
        tick(s)
    raise AssertionError(native(core.frame(s).fieldBoss))


def start(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,HUB)
    core.grantExp(s,exp(level),'quest')
    return s


def enter(s,host,stage):
    core.enterStoryNode(s,host)
    walk=TrailWalk(lua,core,s,edges,exits)
    gate=edges[host,stage]
    walk.approach(gate['x'],gate['y'],stage)
    portal=core.frame(s).storyNearbyPortal
    assert portal.to==stage and not portal.available and '必要レベル 100' in portal.reason
    core.action(s,'story_nearby_portal')
    assert s.story.node==host and not core.frame(s).storySwimCombat
    core.grantExp(s,exp(100)-exp(99),'quest')
    core.action(s,'world_map_toggle')
    core.action(s,'world_map_layer:hunt')
    core.action(s,'world_map_select:'+stage)
    atlas=core.frame(s).worldMap
    assert atlas.selected.id==stage and atlas.guide.status=='ready' and atlas.guide.stops[1].id==stage
    core.action(s,'world_map_close')
    walk.cross(stage)
    assert s.storySwimming and len(s.enemies)==1
    return walk


def wait_for_veil(s,slot,actor):
    boss=slot.enemy
    actor.x,actor.y,actor.dir=boss.x-168,boss.y+27,1
    until(s,lambda:boss.underground)
    assert slot.cast.move.veil
    return slot.cast


def align_aim(actor,boss,facing=1):
    actor.x,actor.y,actor.dir=boss.x-168,boss.y+27,facing


def clear(s,slot,spec):
    actor=s.actors[s.active]
    start_time=s.t
    reveals=0
    inputs={(x,y):lua.table(left=x<0,right=x>0,up=y<0,down=y>0,attack=True)
            for x in (-1,0,1) for y in (-1,0,1)}
    sonar=spec['swimPlayer']['sonar']
    for _ in range(60*135):
        b=slot.enemy
        if b.hp<=0:
            return {'seconds':round(s.t-start_time,2),'hp':actor.hp,'reveals':reveals}
        dx=b.x-actor.x
        x=(1 if dx>0 else -1) if abs(dx)>152 or (abs(dx)>22 and dx*actor.dir<0) else 0
        aim_y=b.y+27
        if b.underground and (actor.cd.swimSonar or 0)<=0 and 0<=dx*actor.dir<=sonar['range'] \
                and abs(actor.y-aim_y)<=sonar['vertical']:
            core.action(s,'skill1')
            reveals+=1
        c=slot.cast
        if c and not c.revealedUntil:
            lanes=[w for w in c.strikes.values() if not w.seen[1] and
                   c.tick<w.after and w.left-15<actor.x<w.right+15]
            if lanes:
                valid=[y for y in range(157,475,5) if all(y<w.top-13 or y>w.bottom+63 for w in lanes)]
                if valid:
                    aim_y=min(valid,key=lambda y:abs(y-aim_y))
        dy=aim_y-actor.y
        y=(1 if dy>0 else -1) if abs(dy)>7 else 0
        tick(s,input=inputs[x,y])
        assert actor.hp>0 and s.returns==0,(spec['id'],s.t-start_time,b.hp)
    raise AssertionError((spec['id'],s.t-start_time,b.hp))


fixture=start(100)
for host in HOSTS.values():
    core.enterStoryNode(fixture,host)
write('work/fontaine-echo-fixture.json',validate_save(native(core.checkpoint(fixture))))

results={}
for id,host in HOSTS.items():
    spec=specs[id]
    stage=spec['node']
    source=read(f"assets/{spec['art']}-field-idle-sprites-v1.json")['source']
    s=start(99)
    walk=enter(s,host,stage)
    slot=s.fieldSlots[id]
    b=slot.enemy
    a=walk.actor
    s.actors[2].hp=0
    sonar=spec['swimPlayer']['sonar']
    cast=wait_for_veil(s,slot,a)
    frame=core.frame(s,'sprite','legacy')
    assert frame.storySwimCombat.sonar.hidden and not frame.storySwimCombat.counter
    assert not any(d.source==source for d in frame.draws.values())
    assert any(d.kind=='effect' and d.color=='#eff0ad' for d in frame.draws.values())
    assert b.hp==b.maxhp
    core.action(s,'normal')
    assert b.hp==b.maxhp
    align_aim(a,b,-1)
    core.action(s,'skill1')
    assert b.underground and a.cd.swimSonar>0 and not cast.revealedUntil
    align_aim(a,b)
    core.action(s,'skill1')
    assert b.underground and not cast.revealedUntil
    until(s,lambda:(a.cd.swimSonar or 0)<=0)
    assert b.underground
    core.action(s,'skill1')
    frame=core.frame(s,'sprite','legacy')
    assert not frame.storySwimCombat.sonar.hidden
    assert abs(frame.storySwimCombat.sonar.exposed-sonar['exposureTicks']/60)<1e-6
    assert len(frame.fieldBoss.warnings)==0
    assert any(d.source==source for d in frame.draws.values())
    assert b.hp==b.maxhp
    a.cd.swimPulse=0
    core.action(s,'normal')
    assert b.hp<b.maxhp
    tick(s,sonar['exposureTicks']-1)
    assert slot.cast and not b.underground and not any(w.seen[1] for w in cast.strikes.values())
    tick(s)
    assert slot.cast is None and not core.frame(s).storySwimCombat.sonar.exposed
    walk.cross(host)
    assert a.y==edges[host,stage]['y'] and not a.cd.swimSonar and not core.frame(s).storySwimCombat
    assert s.fieldSlots[id] is None

    walk.cross(stage)
    slot=s.fieldSlots[id]
    b=slot.enemy
    assert b.hp==spec['hp']
    tested=[]
    for move in spec['moves']:
        align_aim(a,b)
        until(s,lambda:slot.cast is not None)
        cast=slot.cast
        assert cast.move.id==move['id']
        if cast.move.veil:
            until(s,lambda:b.underground)
        for strike in cast.strikes.values():
            a.x=strike.origin+(strike.destination-strike.origin)/3
            a.y=(strike.top+strike.bottom)/2+24
            a.hp,a.inv=a.maxhp,0
            until(s,lambda:strike.seen[1],160)
            assert a.hp==a.maxhp-strike.damage
            warning=next(w for w in core.frame(s).fieldBoss.warnings.values() if w.first==strike.first and
                         abs(w.orb.y-(strike.top+strike.bottom)/2)<.01)
            assert warning.active and warning.orb.x!=strike.origin
            assert warning.activeRight-warning.activeLeft<warning.right-warning.left
            a.inv=0
            tick(s)
            assert a.hp==a.maxhp-strike.damage
        until(s,lambda:slot.cast is None)
        assert not b.underground
        tested.append(move['id'])
    walk.cross(host)
    walk.cross(stage)
    slot=s.fieldSlots[id]
    assert slot.enemy.hp==spec['hp'] and slot.phase=='available'
    a.hp=a.maxhp
    before=(s.kills,s.progression.killXp,s.mora)
    solo=clear(s,slot,spec)
    assert solo['reveals']>0
    reward=round(LEVELS[99]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'])
    assert (s.kills,s.progression.killXp,s.mora)==(before[0]+1,before[1]+reward,before[2]+spec['mora'])
    core.onKill(s,slot.enemy)
    assert s.kills==before[0]+1 and s.endgame.bosses[id].clears==1
    saved=validate_save(native(core.checkpoint(s)))
    restored=core.restore(lua.table_from(saved,recursive=True),12)
    assert restored.story.node==HUB and restored.endgame.bosses[id].clears==1
    assert id not in saved.get('fieldBosses',{})
    results[id]={'route':[host,stage],'lv99BlockedAnd100Admitted':True,'tracedVeilHidesArtAndJMisses':True,
       'backwardEchoFailsAndCooldownApplies':True,'echoRestoresArtAndCancelsOrbs':True,
       'allShotTrajectoriesAndSingleHits':tested,'retreatReentryReset':True,'singleRewardAndSavedClear':True,
       'soloClear':dict(solo,killXp=reward)}
    print(f"{id}: echo and retreat verified, solo clear {solo['seconds']}s at {solo['hp']} HP.")

write('evidence/fontaine-echo-lua.json',results)
