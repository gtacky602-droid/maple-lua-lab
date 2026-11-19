"""Verify both paired-ray arenas through the Lua lab's map, gates and water controls."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def write(path, data):
    (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


HUB = 'fontaine-hub'
HOSTS = {'legend-fontaine_fairy_knight_twins':'fon-wp-50075','legend-fontaine_swords_of_the_gorge':'fon-wp-50071'}
graph = read('content/story-graph.json')
nodes = {node['id']:node for node in graph['nodes']}
exits = {id:node['exits'] for id,node in nodes.items()}
edges = {(id,edge['to']):edge for id,route in exits.items() for edge in route}
specs = [row for row in read('content/field-boss-spawns.json')['fieldBosses'] if row['id'] in HOSTS]
lua,core = runtime()
dt = 1/60
idle = lua.table()
assert len(specs)==2


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def start(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.enterStoryNode(s,HUB)
    core.grantExp(s,exp(level),'quest')
    return s


def tick(s, count=1, input=idle):
    for _ in range(count):
        core.step(s,dt,input)


def until(s, predicate, ticks=600):
    for _ in range(ticks):
        if predicate():
            return
        tick(s)
    raise AssertionError((s.story.node,s.t,native(core.frame(s).fieldBoss)))


def enter(s, spec):
    stage=spec['node']
    host=HOSTS[spec['id']]
    core.enterStoryNode(s,host)
    walk=TrailWalk(lua,core,s,edges,exits)
    gate=edges[host,stage]
    walk.approach(gate['x'],gate['y'],stage)
    portal=core.frame(s).storyNearbyPortal
    assert portal.to==stage and not portal.available and '必要レベル 100' in portal.reason
    core.action(s,'story_nearby_portal')
    assert s.story.node==host
    core.grantExp(s,exp(100)-exp(99),'quest')
    core.action(s,'world_map_toggle')
    core.action(s,'world_map_layer:hunt')
    core.action(s,'world_map_select:'+stage)
    fmap=core.frame(s).worldMap
    assert fmap.selected.id==stage and fmap.guide.status=='ready' and fmap.guide.stops[1].id==stage, native(fmap.guide)
    core.action(s,'world_map_close')
    walk.cross(stage)
    assert s.storySwimming and core.frame(s).storySwimCombat and len(s.enemies)==2
    return walk


def take_shot(s, actor, x, depth, facing=1):
    actor.x,actor.y,actor.dir=x,depth+28,facing
    actor.cd.swimPulse=0
    core.action(s,'normal')


def take_lane(s, actor, strike):
    # Stand about one third of the way down the blade's path.
    actor.x=strike.origin+(strike.destination-strike.origin)/3
    actor.y=(strike.top+strike.bottom)/2+25
    actor.hp,actor.inv=actor.maxhp,0
    while not strike.seen[1]:
        tick(s)
        assert s.fieldSlots[strike.owner.fieldBoss].cast
    assert actor.hp==actor.maxhp-strike.damage


def verify_moves(s, spec, slot, actor):
    owners = []
    for move in spec['moves']:
        actor.x,actor.y=slot.enemy.x-166,slot.enemy.y+28
        until(s,lambda:slot.cast is not None)
        cast=slot.cast
        assert cast.move.id==move['id']
        strikes=list(cast.strikes.values())
        expected=[spec['partner']['entity'] if stage['partner'] else spec['entity'] for stage in move['steps']]
        assert [strike.owner.id for strike in strikes]==expected
        frame=core.frame(s).fieldBoss
        assert [warning.sourceId for warning in frame.warnings.values()]==expected
        assert all(not warning.active for warning in frame.warnings.values())
        owners.append(expected)

        if move['id'] in {'FW33','FW34'}:
            labels=[item.text for item in core.frame(s).draws.values() if item.kind=='text']
            assert labels.count('同時')==2
            # At the midpoint of the same two active bands, normal swimming is safe.
            shallow,deep=sorted(strikes,key=lambda strike:strike.top)
            actor.x=min(strike.origin for strike in strikes)-190
            actor.y=(shallow.bottom+50+deep.top)/2
            assert shallow.bottom+50<actor.y<deep.top
            actor.hp,actor.inv=actor.maxhp,0
            until(s,lambda:cast.tick>=max(strike.after for strike in strikes))
            assert actor.hp==actor.maxhp and not any(strike.seen[1] for strike in strikes)
        else:
            for strike in strikes:
                take_lane(s,actor,strike)
        until(s,lambda:slot.cast is None)
    return owners


def clear_with_swim(s, slot, spec):
    actor=s.actors[s.active]
    start=s.t
    inputs={(x,y):lua.table(left=x<0,right=x>0,up=y<0,down=y>0,attack=True)
            for x in (-1,0,1) for y in (-1,0,1)}
    for _ in range(60*135):
        boss=slot.enemy
        if boss.hp<=0:
            return round(s.t-start,2),actor.hp
        body=min((boss,boss.fieldPartner),key=lambda body:abs(body.x-actor.x)+abs(body.y+28-actor.y)*1.75)
        dx,dy=body.x-actor.x,body.y+28-actor.y
        mx=(1 if dx>0 else -1) if abs(dx)>155 or (abs(dx)>22 and dx*actor.dir<0) else 0
        wanted=body.y+28
        cast=slot.cast
        burst=False
        if cast:
            lanes=[strike for strike in cast.strikes.values() if not strike.seen[1]
                   and cast.tick<strike.after and strike.left-24<actor.x<strike.right+24]
            if lanes:
                safes=[y for y in range(155,476,5) if all(
                    y<strike.top-14 or y>strike.bottom+64 for strike in lanes)]
                if safes:
                    wanted=min(safes,key=lambda y:abs(y-wanted))
                    burst=abs(wanted-actor.y)>70 and any(0<=strike.first-cast.tick<=17 for strike in lanes)
        dy=wanted-actor.y
        my=(1 if dy>0 else -1) if abs(dy)>7 else 0
        if burst:
            mx=0
        tick(s,input=inputs[mx,my])
        if burst and (actor.cd.swimBurst or 0)<=0:
            core.action(s,'dodge')
        assert actor.hp>0 and s.returns==0,(spec['id'],s.t-start,boss.hp)
    raise AssertionError((spec['id'],s.t-start,slot.enemy.hp))


fixture=start(100)
for host in HOSTS.values():
    core.enterStoryNode(fixture,host)
write('work/fontaine-ray-pairs-fixture.json',validate_save(native(core.checkpoint(fixture))))

results={}
for spec in specs:
    id,stage=spec['id'],spec['node']
    host=HOSTS[id]
    s=start(99)
    walk=enter(s,spec)
    a=walk.actor
    s.actors[2].hp=0
    slot=s.fieldSlots[id]
    main,partner=slot.enemy,slot.enemy.fieldPartner
    assert main.id==spec['entity'] and partner.id==spec['partner']['entity']
    assert partner.y-main.y==spec['partner']['offsetY']
    assert partner.hp==main.hp==spec['hp']
    assert not core.frame(s).storySwimCombat.counter

    # The partner can be hit at its own depth without touching the primary body.
    take_shot(s,a,partner.x-155,partner.y)
    primary_hit=spec['hp']-main.hp
    assert primary_hit>0 and main.hp==partner.hp
    take_shot(s,a,main.x-155,main.y)
    damage_both=spec['hp']-main.hp
    assert damage_both==2*primary_hit and main.hp==partner.hp
    # Where both bodies overlap, one cast still hits the shared receiver once.
    original=partner.x,partner.y,partner.hitTop,partner.hitBottom
    partner.x,partner.y,partner.hitTop,partner.hitBottom=main.x,main.y,main.hitTop,main.hitBottom
    take_shot(s,a,main.x-155,main.y)
    assert spec['hp']-main.hp==3*primary_hit
    partner.x,partner.y,partner.hitTop,partner.hitBottom=original

    a.x=main.x-166
    f=core.frame(s,'sprite','legacy')
    assert {body.id:body.name for body in f.fieldBoss.bodies.values()}=={
        main.id:spec['memberName'],partner.id:spec['partner']['memberName']}
    assert len([draw for draw in f.draws.values() if draw.source=='fontaine-ray-pair-poses-source-v1.png'])==2
    metrics={p:core.frame(s,'rect',p).commands for p in ('legacy','h48c32','h32c16')}
    assert metrics['legacy']>metrics['h48c32']>metrics['h32c16']
    owners=verify_moves(s,spec,slot,a)

    walk.cross(host)
    gate=edges[host,stage]
    assert abs(a.y-gate['y'])<.01 and s.fieldSlots[id] is None and not core.frame(s).storySwimCombat
    walk.cross(stage)
    slot=s.fieldSlots[id]
    assert slot.enemy.hp==slot.enemy.fieldPartner.hp==spec['hp'] and slot.phase=='available'

    kills,xp,mora=s.kills,s.progression.killXp,s.mora
    seconds,hp=clear_with_swim(s,slot,spec)
    reward=round(LEVELS[99]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'])
    assert (s.kills,s.progression.killXp,s.mora)==(kills+1,xp+reward,mora+spec['mora'])
    assert slot.enemy.fieldPartner.hp==0 and slot.phase=='cleared'
    core.onKill(s,slot.enemy)
    core.onKill(s,slot.enemy.fieldPartner)
    assert s.kills==kills+1 and s.endgame.bosses[id].clears==1
    saved=validate_save(native(core.checkpoint(s)))
    restored=core.restore(lua.table_from(saved,recursive=True),12)
    assert restored.story.node==HUB and restored.endgame.bosses[id].clears==1 and id not in saved.get('fieldBosses',{})
    results[id]={'entrance':[host,stage],'memberNames':[spec['memberName'],spec['partner']['memberName']],
      'lv99LockedLv100Accessible':True,'ownerByWaterBlade':owners,'simultaneousBladesLeaveSafeMiddle':True,
      'waterPulseHitsEitherMemberOnce':primary_hit,'retreatAtEntryDepth':True,'reentryResetBoth':True,
      'drawCommands':metrics,'soloClear':{'seconds':seconds,'hp':hp,'killXp':reward},'singleRewardAndSave':True}
    print(f"{id}: solo clear {seconds}s at {hp} HP, both bodies and route verified.")

write('evidence/fontaine-ray-pairs-lua.json',results)
