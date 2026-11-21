"""Exercise Narwhal's single shared attempt across the sea and belly."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB = 'boss-29090101', 'fontaine-hub'
OUTER, INNER, QUEST = 'narwhal-star-sea', 'narwhal-inner-echo', 'narwhal-weekly-commission'
LEVEL = LEVELS[83]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core,s,accepted=False):
    core.grantExp(s,LEVEL['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,HUB)
    if accepted:
        core.action(s,'story_accept:'+QUEST)
        assert s.story.quests[QUEST].status=='active'
    s.actors[2].hp=0


def match(core):
    parties=[]
    for i in range(4):
        s=core.new(12)
        core.action(s,'story_start')
        prepare(core,s,i==0)
        core.enterStoryNode(s,OUTER)
        spot(s,160+190*i)
        parties.append(s)
    parties[0].t,parties[1].t,parties[2].t,parties[3].t=550,16,720,300
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def events(s,key):
    return [e.value for e in s.events.values() if e.kind=='narwhal:'+key]


def cast(lua,core,s,x,emit=True,**change):
    request=lua.table_from(dict(id=s.active,x=x,y=480,radial=True,range=100,dir=1,atk=12,
                                mult=1,limit=1,gain=0,element='physical',color='#eaf5ff',
                                playerInputAt=s.t)|change)
    if emit:
        core.resolveCast(s,request)
    return request


def move(w,spec,step,key):
    order=spec.outerOrder if w.stage=='outer' else spec.innerOrder
    field='outerIndex' if w.stage=='outer' else 'innerIndex'
    setattr(w,field,list(order.values()).index(key)+1)
    w.rest=0
    step()
    assert w.cast.key==key
    return w.cast


def queue_swallow(w,step):
    assert w.stage=='outer' and not w.cast
    w.h,w.queued=100,True
    step()
    assert w.stage=='swallow' and w.primary.invulnerable


def in_belly(w,spec,step):
    queue_swallow(w,step)
    run(step,spec.moves.WV07.total)
    assert w.stage=='inner' and w.shadow.hp==760
    w.rest=3000


def kernel(w,spec,step):
    move(w,spec,step,'WV11')
    run(step,spec.kernel.open)
    assert w.special.hp==4
    return w.special


def group_cycle(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,watcher,offline=parties
    step=lambda:core.stepCoop(room,TICK)
    # Players with identical actor IDs can both contribute to the eye.
    eye=move(w,spec,step,'WV05')
    run(step,spec.eye.spawn)
    x=w.special.x
    for state in parties:
        for _ in range(2):
            cast(lua,core,state,x)
    assert w.special is None and w.h>=25
    assert [len(events(s,'WV05:eye-hit')) for s in parties]==[2,2,2,2]
    assert [events(s,'WV05:broken') for s in parties]==[[25]]*4
    run(step,eye.successUntil-eye.t)
    before=[]
    for i,state in enumerate(parties):
        a=state.actors[1]
        a.hp=100+3*i
        a.cd.skill1=10
        state.gauge=40+i
        state.coralWall=lua.table(x=a.x,y=480,owner=1,dummy=True)
        state.pending[1]=cast(lua,core,state,480,emit=False,next=state.t+30,remaining=1,interval=1)
        before.append((a.hp,state.gauge))
    members[3].online=False
    # A valid coral-wall state is quiet before the transition.
    for state in parties[:3]:
        state.coralWall=None
    queue_swallow(w,step)
    assert all(not len(s.pending) and s.coralWall is None for s in parties)
    run(step,spec.transition.sceneTick-1)
    assert room.node==OUTER and all(s.story.node==OUTER for s in parties)
    step()
    assert room.node==INNER and all(s.story.node==INNER and core.sharesCoopField(s) for s in parties)
    assert [s.actors[1].x for s in parties]==[238,310,382,454]
    assert [(s.actors[1].hp,s.gauge) for s in parties]==before
    assert all(math.isclose(s.actors[1].cd.skill1,10-97/60) for s in parties[:3])
    assert offline.actors[1].cd.skill1==10 and not any(s.actors[2].hp for s in parties)
    assert all(core.frame(s).weeklyBoss.narwhal.epoch==2 for s in parties)
    members[3].online=True
    run(step,spec.moves.WV07.total-spec.transition.sceneTick)
    w.rest=3000
    assert w.stage=='inner' and w.primary.hp==2200
    old=watcher.t
    obj=kernel(w,spec,step)
    cast(lua,core,watcher,obj.x,playerInputAt=old)
    cast(lua,core,host,obj.x,playerInputAt=None,growthAI=True)
    assert obj.hp==4
    first=cast(lua,core,host,obj.x)
    core.resolveCast(host,first)
    cast(lua,core,host,obj.x)
    cast(lua,core,guest,obj.x)
    assert obj.hp==2
    run(step,spec.kernel.gap)
    cast(lua,core,host,obj.x)
    cast(lua,core,guest,obj.x)
    assert obj.hp==0 and w.shadow.hp==570 and w.primary.hp==2200
    assert [events(s,'WV11:kernel-hit') for s in parties]==[[1,3],[2,4],[],[]]
    assert all(events(s,'WV13:kernel-loss')==[190] for s in parties)
    # The newest pending cast ends the phase and clears both queues mid-step.
    guest.pending[1]=cast(lua,core,guest,480,emit=False,next=guest.t,remaining=1,interval=1)
    guest.pending[2]=cast(lua,core,guest,480,emit=False,next=guest.t,remaining=1,interval=1,atk=12000)
    host.pending[1]=cast(lua,core,host,480,emit=False,next=host.t+30,remaining=1,interval=1)
    step()
    assert w.stage=='expel' and w.shadow.hp==0 and not len(guest.pending) and not len(host.pending)
    run(step,spec.transition.sceneTick-w.stageTick)
    assert room.node==OUTER and all(s.story.node==OUTER for s in parties)
    assert all(core.frame(s).weeklyBoss.narwhal.epoch==4 for s in parties)
    assert w.primary.hp==2200
    run(step,spec.transition.lossTick-spec.transition.sceneTick)
    assert w.primary.hp==1760 and all(events(s,'WV14:return-loss')==[440] for s in parties)
    run(step,spec.moves.WV14.total-spec.transition.lossTick+spec.transition.weakOpen)
    assert w.stage=='weak' and all(core.frame(s).weeklyBoss.narwhal.exposure==600 for s in parties)
    spot(host,438);spot(guest,530)
    strike(lua,core,host,w.primary,34)
    strike(lua,core,guest,w.primary)
    assert [s.kills for s in parties]==[1,1,1,1]
    assert [(s.progression.killXp,s.mora) for s in parties]==[(EXP,2500)]*4
    assert host.story.quests[QUEST].count==1 and all(s.story.quests[QUEST] is None for s in parties[1:])


def lethal_return(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,watcher,offline=parties
    step=lambda:core.stepCoop(room,TICK)
    in_belly(w,spec,step)
    w.primary.hp=300
    cast(lua,core,host,w.shadow.x,atk=40)
    cast(lua,core,guest,w.shadow.x,atk=9000)
    assert w.stage=='expel'
    core.detachCoop(members[1])
    assert guest.story.node==OUTER
    run(step,spec.transition.lossTick)
    assert w.primary.hp==0 and host.kills==1 and guest.kills==0 and watcher.kills==0
    assert events(host,'WV14:return-loss')==[300]


def wipe(lua,core):
    room,parties,_,w,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    in_belly(w,spec,step)
    c=move(w,spec,step,'WV08')
    run(step,spec.moves.WV08.locks[1])
    x=c.origin+c.dir*80
    for state in parties:
        spot(state,x)
        state.actors[1].hp=1
    run(step,spec.moves.WV08.windows[1][1]-c.t)
    assert w.rechallenge and room.node==INNER and all(s.actors[1].hp==0 for s in parties)
    step()
    assert room.node==OUTER and w.stage=='outer' and w.primary.hp==2200 and w.entries==w.epoch==0
    assert all(s.returns==1 for s in parties)


def via_http(url):
    host,guest,late=[Client(url) for _ in range(3)]
    clients=(host,guest,late)
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],i==0)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        assert cross(client,700,OUTER)['weeklyBoss']['maxhp']==2200
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        session=env['coop_room']
        states=[SESSIONS[c.sid]['state'] for c in clients[:2]]
        room=session.worlds[OUTER]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        in_belly(w,spec,step)
    a,b=advance(host,guest,.15)
    for frame in (a,b):
        assert frame['story']['node']==frame['coop']['map']==INNER
        assert frame['coop']['peers'][0]['map']==INNER and frame['coop']['peers'][0]['actors']
        assert frame['weeklyBoss']['narwhal']['epoch']==2
    assert INNER not in session.worlds
    ranked=Client(url)
    ranked.frame(['story_start'])
    with LOCK:
        env=SESSIONS[ranked.sid]
        prepare(env['core'],env['state'])
        extra=LEVELS[-1]['maple_reference_total_exp_to_reach']-LEVEL['maple_reference_total_exp_to_reach']
        env['core'].grantExp(env['state'],extra,'quest')
    assert ranked.frame(['coop_join:'+code])['coop']['code']==code
    with LOCK:
        ranked_state=SESSIONS[ranked.sid]['state']
        spot(ranked_state,700)
    ready=ranked.frame([f'weekly_start:{BOSS}:entry'])
    assert ready['story']['node']==OUTER and ready['weeklyBoss']['difficulty']=='入門'
    with LOCK:
        rank_room=session.worlds[(OUTER,'entry')]
        rank_slot,rank_spec=core.currentWeeklyBoss(ranked_state)
        in_belly(rank_slot,rank_spec,lambda:core.stepCoop(rank_room,TICK))
        rank_slot.shadow.hp=650
    rank_view=ranked.frame()['weeklyBoss']
    assert rank_view['narwhal']['scene']=='inner' and rank_view['narwhal']['shadow']['hp']==650
    assert host.frame()['weeklyBoss']['narwhal']['shadow']['hp']==760
    assert late.frame(['coop_join:'+code])['coop']['code']==code

    def arrive(client):
        with LOCK:
            spot(SESSIONS[client.sid]['state'],700)
        frame=client.frame(['story_portal:'+OUTER])
        assert frame['story']['node']==frame['coop']['map']==INNER
        assert frame['weeklyBoss']['narwhal']['shadow']['hp']==760
        return frame

    arrive(late)
    assert INNER not in session.worlds
    for client in clients:
        assert cross(client,66,HUB)['coop']['code']==code
    stop=room.tick,w.clock
    advance(host,guest,.18)
    assert (room.tick,w.clock)==stop and room.node==INNER
    for client in clients:
        arrive(client)
    with LOCK:
        states=[SESSIONS[c.sid]['state'] for c in clients]
        obj=kernel(w,spec,step)
        for state,dir in zip(states[:2],(1,-1)):
            spot(state,obj.x-dir*62)
            state.actors[1].dir=dir
    host.frame(['normal'])
    guest.frame(['normal'])
    a,b=advance(host,guest,.14)
    assert a['weeklyBoss']['narwhal']['object']['hp']==b['weeklyBoss']['narwhal']['object']['hp']==2
    with LOCK:
        run(step,spec.kernel.gap)
        cast(lua,core,states[0],obj.x)
        cast(lua,core,states[1],obj.x)
        assert w.shadow.hp==570
        strike(lua,core,states[1],w.shadow)
        run(step,spec.moves.WV14.total+spec.transition.weakOpen)
        assert room.node==OUTER and w.primary.hp==1760
        spot(states[0],421);spot(states[1],535)
        strike(lua,core,states[0],w.primary,27)
        strike(lua,core,states[1],w.primary)
    for i,client in enumerate(clients[:2]):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==2500
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)
    assert late.frame()['kills']==ranked.frame()['kills']==0 and INNER not in session.worlds


if __name__=='__main__':
    lua,core=runtime()
    group_cycle(lua,core)
    lethal_return(lua,core)
    wipe(lua,core)
    with lab() as url:
        via_http(url)
    result=dict(lua=dict(participants=4,eyeShared=True,allSceneMembershipMoves=True,offlineKeepsHealthGaugeAndCooldown=True,
                         pendingAndCoralWallCleared=True,perActorKernelCadence=True,staleOrRepeatedInputsRejected=True,
                         epoch4=True,shadowDamageSeparate=True,oneReturnLoss=440,exposureTicks=600,
                         sharedLethalReturnWithFinisherGone=True,wipeRestartsInSea=True),
                http=dict(participants=4,oneWorldAcrossScenes=True,lateEntryAndFrozenTrialResume=True,rankedTrialIsolated=True,
                          normalAttacksShareKernel=True,personalXp=EXP,personalMora=2500,onlyEligiblePlayersGetRewards=True))
    (ROOT/'evidence/coop-narwhal-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
