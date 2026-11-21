"""Exercise Childe's shared forms, party-owned marks and verified rewards."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, ENTITY = 'boss-29030101', 29030101
HUB, ARENA, QUEST = 'liyue-harbor', 'childe-golden-house-arena', 'childe-weekly-commission'
LEVEL = LEVELS[27]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core, state, accepted=False):
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
        assert state.story.quests[QUEST].status == 'active'
    state.actors[2].hp = 0


def party(core, accepted=False):
    state = core.new(12)
    core.action(state, 'story_start')
    prepare(core, state, accepted)
    core.enterStoryNode(state, ARENA)
    return state


def spot(state, x, y=480):
    a = state.actors[state.active]
    a.x, a.y, a.vy, a.ground, a.inv, a.hp = x, y, 0, True, 0, a.maxhp


def strike(lua, core, state, boss, power=10000, **opts):
    values = dict(id=state.active, atk=power, x=boss.x, y=480, dir=1, radial=True, range=100,
                  limit=1, mult=1, gain=0, color='#dcb4e8', element='physical', startedAt=state.t, critRate=0)
    core.resolveCast(state,lua.table_from(values | opts))


def run(step, count):
    for _ in range(count):
        step()


def move(step, slot, spec, name):
    slot.index = list(spec.orders[slot.form].values()).index(name)+1
    slot.cast, slot.rest = None, 0
    step()
    assert slot.cast.id == name
    return slot.cast


def hurts(state, since):
    return [e.value for e in state.events.values()
            if e.seq>since and e.kind=='hurt' and e.target==ENTITY]


def sample(states):
    marks=[s.seq for s in states]
    return lambda:[hurts(s,m) for s,m in zip(states,marks)]


def own_marks(core,states):
    return [core.frame(s).weeklyBoss.mark for s in states]


def switch(core, state, actor):
    state.actors[actor].hp=state.actors[actor].maxhp
    state.actors[actor].lock=0
    state.swap=0
    core.action(state,'swap')
    assert state.active==actor
    state.actors[3-actor].hp=0


def phase_change(lua,core,states,step,slot,spec,number):
    hp = (720,420)[number-2]
    timing = spec.transitions[number-1]
    strike(lua,core,states[0],slot.primary)
    assert slot.primary.hp==hp and slot.shift and slot.cast is None and slot.primary.invulnerable
    assert all(s.kills==0 and s.mora==0 for s in states)
    assert own_marks(core,states)==[None]*len(states)
    run(step,timing.swap)
    assert all(core.frame(s).weeklyBoss.form==number for s in states)
    strike(lua,core,states[1],slot.primary)
    assert slot.primary.hp==hp and slot.primary.invulnerable
    run(step,timing.total-timing.swap)
    assert slot.shift is None and not slot.primary.invulnerable


def test_lua(lua,core):
    states=[party(core,i==0) for i in range(4)]
    host,guest,observer,outside=states
    host.t,guest.t,observer.t=240,3,900
    room=core.newCoop(host)
    members=[core.attachCoop(room,s) for s in states]
    slot, spec = core.currentWeeklyBoss(host)
    boss=slot.primary
    step=lambda:core.stepCoop(room,TICK)
    same=lua.eval('rawequal')
    assert boss.hp==960 and len(core.coopFrame(host).enemies)==1
    for state,point in zip(states,((322,480),(315,480),(682,480),(157,372))):
        spot(state,*point)
    _=move(step,slot,spec,'WC03')
    hit=sample(states)
    run(step,96)
    assert hit()==[[12],[12],[],[]]
    assert own_marks(core,states)==['hydro','hydro',None,None]
    switch(core,guest,2)
    spot(guest,215,372)
    spot(host,spec.edge-1)
    step()
    assert own_marks(core,states)==[None,'hydro',None,None]
    frame=core.frame(host)
    assert any(d.text=='◆ 水断流' and d.x==215-frame.camera for d in frame.draws.values())

    spot(host,415)
    c=move(step,slot,spec,'WC02')
    assert same(c.target,guest)
    run(step,54)
    assert c.rainY==372 and all(135<point<311 for point in c.points.values())
    phase_change(lua,core,states,step,slot,spec,2)

    switch(core,guest,1)
    spot(host,405)
    spot(guest,386)
    c=move(step,slot,spec,'WC06')
    run(step,48)
    strike(lua,core,observer,boss,4,x=boss.x-30,startedAt=observer.t-TICK)
    strike(lua,core,host,boss,4,x=boss.x-30,growthAI=True)
    assert not c.counter
    strike(lua,core,guest,boss,4,x=boss.x-30)
    assert c.counter

    spot(host,233)
    spot(guest,393)
    spot(observer,390)
    c=move(step,slot,spec,'WC07')
    run(step,50)
    assert own_marks(core,states)==[None,'electro','electro',None]
    c=move(step,slot,spec,'WC10')
    assert same(c.target,guest)
    run(step,60)
    spot(guest,spec.edge-1);step()
    assert c.cancelled and c.total==144
    assert own_marks(core,states)==[None,None,'electro',None]
    run(step,84)
    assert not any(e.kind=='childe:WC10:hit' for s in states for e in s.events.values())

    slot.marks[guest]='electro'
    spot(guest,365)
    c=move(step,slot,spec,'WC10')
    switch(core,guest,2)
    spot(guest,628)
    run(step,84)
    assert c.land==628
    spot(guest,spec.edge-1)
    spot(host,627);spot(observer,618);spot(outside,821)
    hit=sample(states)
    run(step,73)
    assert c.land==628 and not c.cancelled
    assert hit()==[[26],[],[26],[]]
    assert own_marks(core,states)==['electro',None,'electro',None]

    spot(host,360);spot(observer,365)
    c=move(step,slot,spec,'WC10')
    assert same(c.target,host)
    core.detachCoop(members[0])
    run(step,2)
    assert c.cancelled and slot.marks[observer]=='electro'
    core.attachCoop(room,host,members[0])
    phase_change(lua,core,states,step,slot,spec,3)

    spot(host,405);spot(guest,551);spot(observer,28);spot(outside,929)
    strike(lua,core,host,boss,24)
    strike(lua,core,guest,boss)
    assert slot.phase=='respawn' and [s.kills for s in states]==[1,1,0,0]
    assert [(s.progression.killXp,s.mora) for s in states[:2]]==[(EXP,560)]*2
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None
    for state in states[:2]:
        saved=validate_save(native(core.checkpoint(state)))
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']==3600


def test_adopt(lua,core):
    host,guest=party(core),party(core)
    slot,spec=core.currentWeeklyBoss(host)
    spot(host,410)
    step=lambda:core.step(host,TICK)
    move(step,slot,spec,'WC03')
    while not hurts(host,0) and slot.cast.tick<100:
        step()
    assert hurts(host,0)==[12] and slot.marks[host]=='hydro'
    room=core.newCoop(host)
    for state in (host,guest):
        core.attachCoop(room,state)
        spot(state,410)
    hit=sample([host,guest])
    core.stepCoop(room,TICK)
    assert hit()==[[],[12]]
    assert own_marks(core,[host,guest])==['hydro','hydro']


def test_http(url):
    players=[Client(url),Client(url)]
    for index,client in enumerate(players):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],index==0)
    code=players[0].frame(['coop_create'])['coop']['code']
    assert players[1].frame(['coop_join:'+code])['coop']['code']==code
    for client in players:
        assert cross(client,1040,ARENA)['weeklyBoss']['maxhp']==960
    with LOCK:
        a,b=[SESSIONS[c.sid] for c in players]
        lua,core=a['lua'],a['core']
        states=[a['state'],b['state']]
        room=a['coop_room'].worlds[ARENA]
        slot,spec=core.currentWeeklyBoss(states[0])
        boss=slot.primary
        step=lambda:core.stepCoop(room,TICK)
        strike(lua,core,states[0],boss)
        run(step,10)
    for client in players:
        trial=client.frame()['weeklyBoss']
        assert trial['hp']==720 and trial['move']=='WC14' and not trial['damageable']
        assert cross(client,116,HUB)['coop']['code']==code
    frozen=(room.tick,slot.shift.tick)
    advance(*players,.25)
    assert (room.tick,slot.shift.tick)==frozen
    for client in players:
        assert cross(client,1040,ARENA)['weeklyBoss']['hp']==720
    with LOCK:
        run(step,spec.transitions[1].total-slot.shift.tick)
        phase_change(lua,core,states,step,slot,spec,3)
        spot(states[0],418);spot(states[1],541)
        strike(lua,core,states[0],boss,24)
        strike(lua,core,states[1],boss)
    for i,client in enumerate(players):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==560
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)
    return dict(participants=2,sharedTransitionWhileRoomEmpty=True,personalRewardsAndAcceptedQuest=True)


if __name__=='__main__':
    lua,core=runtime()
    test_lua(lua,core)
    test_adopt(lua,core)
    del lua,core
    result={'lua':dict(participants=4,marksAndBoundaryPerParty=True,marksFollowSwap=True,rainTargetsMarkedParty=True,
                       sharedCounterClockWithFreshManualCast=True,lockedLightningAndOwnerCancellation=True,
                       oneHitPerActorAndAdoptedHitsPreserved=True,threeSharedPhasesAndIndividualRewards=True)}
    with lab() as url:
        result['http']=test_http(url)
    (ROOT/'evidence/coop-childe-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
