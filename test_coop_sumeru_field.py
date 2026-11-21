"""Verify the shared state of three Sumeru encounters through Lua and HTTP."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


HUB = 'sumeru-hub'
ENTRY, ROAD = 'sumeru-entry', 'sumeru-field'
MATRIX = ('boss-24050101', 'asimon-commission', ENTRY, 1210, 'FMT03', 86, 108)
WENUT = ('boss-26130101', 'wenut-commission', ENTRY, 800, 'FWN03', 83, 114)
DENDRO = ('boss-20040701', 'dendro-hypostasis-commission', ROAD, 900, 'FHD02', 94, 114)
SPECS = {s['id']: s for s in json.loads(
    (ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8'))['fieldBosses']}


def grant(core, state, spec):
    core.grantExp(state, LEVELS[spec['level']-1]['maple_reference_total_exp_to_reach'], 'quest')


def party(core, case, accepted=False, in_hub=False):
    id, quest, *_ = case
    spec = SPECS[id]
    state = core.new(12)
    core.action(state, 'story_start')
    grant(core, state, spec)
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:'+quest)
        assert state.story.quests[quest].status=='active'
    if not in_hub:
        core.enterStoryNode(state, spec['node'])
    place(state, spec['home']-106)
    return state


def share(core, case):
    states = [party(core, case, i==0) for i in range(4)]
    room = core.newCoop(states[0])
    for s in states:
        core.attachCoop(room,s)
    assert room.fieldSlot.enemy.maxhp==SPECS[case[0]]['hp']
    return room,states,lambda:core.stepCoop(room,TICK)


def attack(lua, core, state, boss, **settings):
    cast = dict(id=1,atk=20,x=boss.x,y=480,dir=1,radial=True,range=24,limit=1,
                mult=1,color='#fff0ac',gain=0,element='physical',critRate=0,targetId=boss.id)
    hp=boss.hp
    core.resolveCast(state,lua.table_from(cast | settings))
    return hp-boss.hp


def hurt(state, since, boss):
    return [(e.value,e.element) for e in state.events.values()
            if e.seq>since and e.kind=='hurt' and e.target==boss.id]


def rewarded(states,case):
    id,quest,*_=case
    spec=SPECS[id]
    xp=LEVELS[spec['level']-1]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
    assert [(s.kills,s.mora,s.progression.killXp) for s in states]==[(1,spec['mora'],xp)]*2+[(0,0,0)]*2
    assert states[0].story.quests[quest].count==1 and states[1].story.quests[quest] is None
    return {'xp':xp,'mora':spec['mora']}


def matrix_check(lua,core):
    room,states,step=share(core,MATRIX)
    host,guest,observer,spectator=states
    slot=room.fieldSlot
    boss=slot.enemy
    wait_cast(step,slot,'FMT01',95)
    ray=slot.cast
    for s,x in zip(states,(boss.x-80,boss.x-80,boss.x+120,boss.x-265)):
        place(s,x)
    marks=[s.seq for s in states]
    step()
    place(host,boss.x-80)
    wait_cast(step,slot,'FMT01',105)
    assert ray.dir==-1
    assert [hurt(s,seq,boss) for s,seq in zip(states,marks)]==[[(20,'physical')],[(20,'physical')],[],[]]
    for s in states:
        place(s,boss.x-126)
    wait_cast(step,slot,'FMT03',54)
    cloak=slot.cast
    destination=cloak.dest
    assert attack(lua,core,host,boss,element='dendro',key='fixture:pair')==19
    expiry=boss.aura.expires
    for s in states:
        place(s,cloak.origin+105)
    wait_cast(step,slot,'FMT03',90)
    assert cloak.dest==destination
    assert boss.aura.expires==expiry and boss.aura.element=='dendro'
    assert math.isclose(boss.x,(cloak.origin+cloak.dest)/2)
    assert attack(lua,core,guest,boss,x=cloak.origin)==0
    assert attack(lua,core,guest,boss,element='pyro',key='fixture:pair')==19
    assert boss.burning.remaining==4
    boss.burning.next=room.time+TICK
    hp=boss.hp
    step()
    assert boss.hp<hp and boss.burning.remaining==3
    for s in states:
        frame=core.frame(s,'sprite')
        assert frame.fieldBoss.cloaked and frame.fieldBoss.x==boss.x and frame.fieldBoss.destination==destination
        sprite=next(d for d in frame.draws.values() if d.source=='asimon-field-poses-source-v1.png')
        assert sprite.opacity==.45 and math.isclose(sprite.x+s.camera,boss.x)
    wait_cast(step,slot,'FMT03',108)
    assert all(not core.frame(s).fieldBoss.cloaked for s in states)
    for s in states:
        place(s,boss.x-60)
    assert attack(lua,core,guest,boss,atk=1600)>0 and slot.phase=='respawn'

    solo, newcomer=party(core,MATRIX),party(core,MATRIX)
    live=solo.fieldSlots[MATRIX[0]]
    wait_cast(lambda:core.step(solo,TICK,lua.table()),live,'FMT02',107)
    center=live.cast.points[1]
    place(solo,center)
    core.step(solo,TICK,lua.table())
    assert hurt(solo,0,live.enemy)[-1]==(21,'physical')
    adopted=core.newCoop(solo)
    for s in (solo,newcomer):
        core.attachCoop(adopted,s)
        place(s,center)
    marks=[s.seq for s in (solo,newcomer)]
    core.stepCoop(adopted,TICK)
    assert [hurt(s,seq,live.enemy) for s,seq in zip((solo,newcomer),marks)]==[[],[(21,'physical')]]
    return {'hp':1100,'sharedBeamsHitPerParty':True,'lockedDestination':True,'fadeAlpha':.45,
            'hitboxMovesWithArt':True,'twoPartiesCombineBurningDuringCloak':True,
            'preexistingSoloHitHistory':True,**rewarded(states,MATRIX)}


def wenut_check(lua,core):
    room,states,step=share(core,WENUT)
    host,guest,*_=states
    slot=room.fieldSlot
    boss=slot.enemy
    wait_cast(step,slot,'FWN03',54)
    live=slot.cast
    assert all(core.frame(s).fieldBoss.emergeX==live.dest for s in states)
    attack(lua,core,host,boss,element='dendro')
    attack(lua,core,guest,boss,element='pyro')
    wait_cast(step,slot,'FWN03',87)
    assert boss.underground and boss.burning.remaining==4
    assert all(core.frame(s).fieldBoss.underground for s in states)
    assert attack(lua,core,guest,boss,atk=3000)==0
    assert attack(lua,core,guest,boss,x=live.dest,atk=3000)==0
    boss.hp=1
    boss.burning.next=room.time+TICK
    for s in states:
        place(s,boss.x-60)
    step()
    assert boss.hp==0 and slot.phase=='respawn' and slot.cast is None
    marks=[s.seq for s in states]
    for _ in range(160):
        step()
    assert all(not hurt(s,seq,boss) for s,seq in zip(states,marks))
    assert not any(live.projectiles.values())

    solo, newcomer=party(core,WENUT),party(core,WENUT)
    personal=solo.fieldSlots[WENUT[0]]
    wait_cast(lambda:core.step(solo,TICK,lua.table()),personal,'FWN01',108)
    assert hurt(solo,0,personal.enemy)==[(22,'physical')]
    adopted=core.newCoop(solo)
    for s in (solo,newcomer):
        core.attachCoop(adopted,s)
        place(s,personal.cast.origin-90)
    marks=[s.seq for s in (solo,newcomer)]
    core.stepCoop(adopted,TICK)
    assert [hurt(s,seq,personal.enemy) for s,seq in zip((solo,newcomer),marks)]==[[],[(22,'physical')]]
    return {'hp':1080,'sharedEmergenceMark':True,'noBuriedDirectHit':True,
            'twoPartyBurningCancelsBurrowOnKill':True,'noLateAnemoProjectile':True,
            'preexistingSoloHitHistory':True,**rewarded(states,WENUT)}


def dendro_check(lua,core):
    room,states,step=share(core,DENDRO)
    host,guest,wall_owner,spectator=states
    slot=room.fieldSlot
    boss=slot.enemy
    assert attack(lua,core,host,boss,element='dendro')==0
    assert attack(lua,core,host,boss,element='pyro')==19
    wait_cast(step,slot,'FHD02',96)
    assert all(core.frame(s).fieldBoss.y==408 and core.frame(s).fieldBoss.flying for s in states)
    assert attack(lua,core,guest,boss,atk=3000)==0
    assert attack(lua,core,guest,boss,y=408)==19
    wait_cast(step,slot,'FHD02',126)
    assert all(not core.frame(s).fieldBoss.flying for s in states)
    for s in states:
        place(s,boss.x-105)
    wait_cast(step,slot,'FHD03',48)
    seed=slot.cast
    x,direction=seed.origin,seed.dir
    place(host,x+direction*121)
    place(guest,x+direction*121)
    place(wall_owner,x-direction*100)
    place(spectator,x-direction*100)
    wall_owner.rockWall=lua.table(x=x+direction*68,y=480,life=5,hp=14,maxhp=14)
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FHD03',109)
    assert seed.shots[1] and wall_owner.rockWall is None
    assert all(not hurt(s,seq,boss) for s,seq in zip(states,marks))
    for s in states:
        place(s,boss.x-60)
    assert attack(lua,core,host,boss)>0
    assert attack(lua,core,guest,boss,atk=1600)>0 and slot.phase=='respawn'
    return {'hp':1120,'sharedAirborneHurtbox':True,'dendroImmunity':True,
            'allyWallBlocksDendroSeed':True,**rewarded(states,DENDRO)}


def run_lua():
    lua,core=runtime()
    fixture=validate_save(native(core.checkpoint(party(core,MATRIX,True,True))))
    (ROOT/'work/coop-asimon-fixture.json').write_text(json.dumps(fixture),encoding='utf-8')
    return {'matrix':matrix_check(lua,core),'wenut':wenut_check(lua,core),'dendro':dendro_check(lua,core)}


def run_http(url,case):
    id,quest,approach,gate,move,pause_at,land=case
    spec=SPECS[id]
    clients=(Client(url),Client(url))
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            core,state=env['core'],env['state']
            grant(core,state,spec)
            core.enterStoryNode(state,HUB)
            if i==0:
                core.action(state,'story_accept:'+quest)
        cross(client,1380 if approach==ROAD else 60,approach)
    code=clients[0].frame(['coop_create'])['coop']['code']
    assert clients[1].frame(['coop_join:'+code])['coop']['code']==code
    arena=spec['node']
    for c in clients:
        assert cross(c,gate,arena)['coop']['code']==code
    with LOCK:
        h,g=[SESSIONS[c.sid] for c in clients]
        lua,core=h['lua'],h['core']
        world=h['coop_room'].worlds[arena]
        slot=world.fieldSlot
        for env in (h,g):
            place(env['state'],spec['home']-108)
        wait_cast(lambda:core.stepCoop(world,TICK),slot,move,pause_at)
        shared_state={'FMT03':'cloaked','FWN03':'underground','FHD02':'flying'}[move]
        for env in (h,g):
            b=core.frame(env['state']).fieldBoss
            assert b[shared_state]
    for c in clients:
        assert cross(c,65,approach)['coop']['code']==code
    frozen=(world.tick,slot.cast.tick,slot.enemy.x,slot.enemy.y)
    advance(*clients,.2)
    assert (world.tick,slot.cast.tick,slot.enemy.x,slot.enemy.y)==frozen
    for c in clients:
        cross(c,gate,arena)
    with LOCK:
        boss=slot.enemy
        if slot.cast.tick<land:
            wait_cast(lambda:core.stepCoop(world,TICK),slot,move,land)
        for env in (h,g):
            place(env['state'],boss.x-60)
        assert attack(lua,core,h['state'],boss)>0
        assert attack(lua,core,g['state'],boss,atk=1600)>0
    a,b=[c.frame(checkpoint=True) for c in clients]
    assert all(f['kills']==1 and f['mora']==spec['mora'] and f['fieldBoss']['phase']=='respawn'
               and f['checkpoint']['endgame']['bosses'][id]['clears']==1 for f in (a,b))
    assert a['story']['quests'][quest]['count']==1 and quest not in b['story']['quests']
    return {'participants':2,'sharedMapAndBoss':True,'emptyArenaPreservesMoveAndPosition':True,
            'ownSavedRewards':True,'questOnlyForAccepted':True}


if __name__=='__main__':
    result={'lua':run_lua(),'http':{}}
    for case in (MATRIX,WENUT,DENDRO):
        with lab() as url:
            result['http'][case[0]]=run_http(url,case)
    (ROOT/'evidence/coop-sumeru-field-lua-http.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
