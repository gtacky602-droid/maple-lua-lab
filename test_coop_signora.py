"""Verify the shared Signora fight and personal temperatures, holds and moths."""
import json
from time import monotonic, sleep

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike, switch
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, ENTITY = 'boss-29050101', 29050101
HUB, ARENA, QUEST = 'inazuma-town', 'signora-ten-shrine-arena', 'signora-weekly-commission'
LEVEL = LEVELS[43]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core,state,accepted=False):
    core.grantExp(state,LEVEL['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,HUB)
    if accepted:
        core.action(state,'story_accept:'+QUEST)
        assert state.story.quests[QUEST].status=='active'
    state.actors[2].hp=0


def party(core,accepted=False):
    state=core.new(12)
    core.action(state,'story_start')
    prepare(core,state,accepted)
    core.enterStoryNode(state,ARENA)
    return state


def event(state,key):
    return [e.value for e in state.events.values() if e.kind=='signora:'+key]


def room_setup(core):
    states=[party(core,i==0) for i in range(4)]
    states[0].t,states[1].t,states[2].t=250,5,900
    room=core.newCoop(states[0])
    members=[core.attachCoop(room,s) for s in states]
    slot,spec=core.currentWeeklyBoss(states[0])
    for state,x in zip(states,(70,110,480,890)):
        spot(state,x)
        core.frame(state)
    return room,states,members,slot,spec


def environment_test(lua,core):
    room,states,members,slot,spec=room_setup(core)
    host,guest,observer,other=states
    prototype=lua.table(interact=True)
    step=lambda:core.stepCoop(room,TICK)
    slot.rest=9000
    for state,amount in zip(states,(91,82,73,63)):
        slot.climates[state].temperature=amount
    slot.floors=lua.table_from([
        {'x':205,'y':480,'width':88,'expires':360},
        {'x':620,'y':480,'width':88,'expires':360},
    ],recursive=True)
    members[0].input=prototype
    members[1].input=prototype
    run(step,29)
    assert [core.frame(s).weeklyBoss.deviceHold for s in states]==[29,29,0,0]
    assert slot.devices[1]==0
    step()
    views=[core.frame(s).weeklyBoss for s in states]
    assert views[0].temperature==views[1].temperature==0
    assert [native(v.deviceRelease) for v in views[:2]]==[{'side':1,'floors':1}]*2
    assert views[2].deviceRelease is None and views[3].deviceRelease is None
    assert views[2].temperature>73 and views[3].temperature>0
    assert all(v.devices[1]==spec.temperature.recharge for v in views)
    assert [(v.deviceCue.side,v.deviceCue.inRange) for v in views]==[(2,False),(2,False),(2,False),(2,True)]
    assert all(v.deviceHold==0 for v in views)
    assert list(event(host,'WS16:release'))==[1] and not event(guest,'WS16:release')
    assert len(slot.floors)==1 and slot.floors[1].x==620
    members[0].input=members[1].input=None
    members[3].input=prototype
    run(step,30)
    assert slot.devices[1]<=slot.clock<slot.devices[2] and event(other,'WS16:release')==[2]
    members[3].input=None

    for state,x in zip(states,(310,320,410,810)):
        spot(state,x)
    before=[s.actors[1].hp for s in states]
    slot.climates[host].temperature=100
    run(step,91)
    assert [b-s.actors[1].hp for s,b in zip(states,before)]==[6,0,0,0]
    for state in states:
        slot.climates[state].temperature=0
    slot.index,slot.rest=1,0
    step()
    cast=slot.cast
    assert cast.id=='WS01'
    run(step,42)
    for state,x in zip(states,(cast.points[1].x,cast.points[1].x,800,850)):
        spot(state,x)
    run(step,48)
    values=[core.frame(s).weeklyBoss.temperature for s in states]
    assert all(t>8 for t in values[:2]) and all(t<8 for t in values[2:])
    assert [event(s,'WS01:hit') for s in states]==[[1],[1],[],[]]


def seal_strike(lua,core,state,boss,**change):
    return lua.table_from(dict(id=state.active,x=boss.x,y=boss.y,radial=True,range=80,
                               playerInputAt=state.t,mult=1,color='#ffdbab',element='physical',
                               limit=1,gain=0,atk=1,dir=1) | change)


def break_seal(lua,core,states,slot,step,spec):
    host,guest=states[:2]
    seal=slot.seal
    for _ in range(4):
        if slot.stage!='seal':return
        # Move both players away from the moth sites before replenishment.
        spot(host,150);spot(guest,790)
        run(step,spec.seal.mothCycle)
        assert len(seal.moths)==2
        for i,state in enumerate(states[:2],1):
            spot(state,seal.moths[i].x)
        step()
        for state in states[:2]:
            core.resolveCast(state,seal_strike(lua,core,state,slot.primary))
            if slot.stage!='seal':return
    raise AssertionError('Cocoon did not break after four replacement cycles')


def seal_test(lua,core):
    room,states,members,slot,spec=room_setup(core)
    host,guest,observer,other=states
    step=lambda:core.stepCoop(room,TICK)
    boss=slot.primary
    strike(lua,core,host,boss)
    assert slot.stage=='seal' and boss.hp==800 and len(room.enemies)==1
    early=seal_strike(lua,core,observer,boss,element='pyro')
    run(step,spec.seal.opening)
    seal=slot.seal
    core.resolveCast(observer,early)
    assert seal.hp==100 and seal.openedAt is not None
    older=seal_strike(lua,core,host,boss)
    x=seal.moths[1].x
    spot(host,x);spot(guest,x)
    step()
    first=seal.tokens[host].id
    assert seal.tokens[guest] is None and seal.moths[1] is None
    spot(guest,seal.moths[2].x)
    step()
    second=seal.tokens[guest].id
    assert first!=second
    assert all(core.frame(s).weeklyBoss.seal.carrying for s in states[:2])
    assert not core.frame(other).weeklyBoss.seal.carrying
    assert any(d.text=='紅蓮蛾' for d in core.frame(other).draws.values())
    switch(core,guest,2)
    spot(guest,673)
    assert seal.tokens[guest].id==second
    no_input=seal_strike(lua,core,guest,boss,playerInputAt=None)
    core.resolveCast(guest,no_input)
    assert seal.tokens[guest].id==second and seal.hp==100
    core.resolveCast(host,older)
    assert seal.tokens[host].id==first and seal.hp==99
    core.resolveCast(guest,seal_strike(lua,core,guest,boss))
    assert seal.hp==74 and event(guest,'moth-used')==[second]
    assert native(core.frame(host).weeklyBoss.sealStrike)=={'source':'plain','damage':1,'remaining':99}
    assert native(core.frame(guest).weeklyBoss.sealStrike)=={'source':'moth','damage':25,'remaining':74}
    assert core.frame(observer).weeklyBoss.sealStrike is None
    run(step,spec.seal.hitInterval)
    core.resolveCast(host,older)
    assert seal.hp==74 and seal.tokens[host].id==first
    core.resolveCast(host,seal_strike(lua,core,host,boss))
    assert seal.hp==49 and event(host,'moth-used')==[first]
    break_seal(lua,core,states,slot,step,spec)
    assert slot.stage=='transform' and slot.seal is None and boss.hp==800
    assert [len(event(s,'moth-used')) for s in states]==[2,2,0,0]
    assert not list(slot.floors.values()) and list(slot.devices.values())==[0,0]
    run(step,spec.moves.WS09.total)
    assert all(core.frame(s).weeklyBoss.temperature==0 for s in states)
    assert slot.stage=='pyro' and not boss.invulnerable
    spot(host,408);spot(guest,556)
    strike(lua,core,host,boss,24)
    strike(lua,core,guest,boss)
    assert [s.kills for s in states]==[1,1,0,0] and slot.phase=='respawn'
    assert [(s.progression.killXp,s.mora) for s in states[:2]]==[(EXP,860)]*2
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None
    for state in states[:2]:
        save=validate_save(native(core.checkpoint(state)))
        assert save['weeklyBosses'][BOSS]['hp']==0 and save['weeklyBosses'][BOSS]['waitTicks']==3600
        assert save['endgame']['bosses'][BOSS]['clears']==1


def check_http(url):
    host,guest=[Client(url),Client(url)]
    for index,client in enumerate((host,guest)):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],index==0)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        assert cross(client,995,ARENA)['weeklyBoss']['maxhp']==1280
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        states=[SESSIONS[c.sid]['state'] for c in (host,guest)]
        world=env['coop_room'].worlds[ARENA]
        slot,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(world,TICK)
        slot.rest=9000
        for state,x in zip(states,(70,480)):
            spot(state,x)
            core.frame(state)
            slot.climates[state].temperature=60
        slot.floors=lua.table_from([
            {'x':205,'y':480,'width':88,'expires':slot.clock+360},
            {'x':630,'y':480,'width':88,'expires':slot.clock+360},
        ],recursive=True)
    until=monotonic()+5
    while monotonic()<until:
        sleep(.025)
        result=host.frame(input={'interact':True})['weeklyBoss']
        peer=guest.frame()['weeklyBoss']
        if result['devices'][0]>0:
            break
    else:
        raise AssertionError('Held interact did not release the shared device')
    # A response can include ticks after release while the device is recharging.
    assert result['cause']=='release' and 0<=result['temperature']<.25
    assert result['deviceRelease']=={'side':1,'floors':1}
    assert peer['temperature']>60 and peer['devices'][0]>0
    assert 'deviceRelease' not in peer
    host.frame()
    with LOCK:
        strike(lua,core,states[0],slot.primary)
        run(step,spec.seal.opening)
        spot(states[0],slot.seal.moths[1].x)
        spot(states[1],slot.seal.moths[2].x)
        step()
        core.resolveCast(states[0],seal_strike(lua,core,states[0],slot.primary))
        assert slot.seal.hp==75 and slot.seal.tokens[states[1]]
    assert host.frame()['weeklyBoss']['sealStrike']=={'source':'moth','damage':25,'remaining':75}
    assert 'sealStrike' not in guest.frame()['weeklyBoss']
    for client in (host,guest):
        assert client.frame()['weeklyBoss']['seal']['hp']==75
        assert cross(client,126,HUB)['coop']['code']==code
    frozen=world.tick,slot.stageTick
    advance(host,guest,.2)
    assert (world.tick,slot.stageTick)==frozen and not list(slot.seal.tokens.keys())
    for client in (host,guest):
        v=cross(client,995,ARENA)['weeklyBoss']
        assert v['seal']['hp']==75 and not v['seal']['carrying']
    with LOCK:
        break_seal(lua,core,states,slot,step,spec)
        run(step,spec.moves.WS09.total)
        spot(states[0],405);spot(states[1],560)
        strike(lua,core,states[0],slot.primary,24)
        strike(lua,core,states[1],slot.primary)
    for index,client in enumerate((host,guest)):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==860
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if index==0 else None)
    return dict(participants=2,transportedHoldInput=True,localReleaseOnly=True,personalHudResults=True,
                departureClearsMothButKeepsCocoon=True,individualRewardsAndQuest=True)


if __name__=='__main__':
    lua,core=runtime()
    environment_test(lua,core)
    seal_test(lua,core)
    del lua,core
    result={'lua':dict(participants=4,independentTemperatureAndHits=True,oneLocalReleaseWhenBothHold=True,
                       deviceCooldownGuaranteesOneReady=True,sharedFloorsClearLocally=True,
                       separateMothsAndInputClocks=True,onePickupPerMoth=True,manualFreshAttackOnly=True,
                       independentCocoonHitInterval=True,oneTransformationAndIndividualRewards=True,
                       personalHudResults=True,localDevicePrompts=True)}
    with lab() as url:
        result['http']=check_http(url)
    (ROOT/'evidence/coop-signora-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
