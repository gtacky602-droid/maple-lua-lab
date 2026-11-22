"""Exercise consent, a shared two-scene attempt, and individual laws and rewards."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB = 'boss-29130201', 'nod-town'
OUTER, INNER, QUEST = 'nod-false-moon-court', 'nod-false-moon-rift', 'false-moon-weekly-commission'
LEVEL = LEVELS[131]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']
USE, CANCEL = 'encounter_interact', 'encounter_cancel'


def prepare(core, state, accepted=False):
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
        assert state.story.quests[QUEST].status == 'active'
    state.actors[2].hp = 0


def match(core, players=4):
    parties = []
    for i in range(players):
        state = core.new(12)
        core.action(state, 'story_start')
        prepare(core, state, i == 0)
        core.enterStoryNode(state, OUTER)
        spot(state, 240 + i*155)
        state.t = i*137
        parties.append(state)
    room = core.newCoop(parties[0])
    members = [core.attachCoop(room, state) for state in parties]
    return room, parties, members, *core.currentWeeklyBoss(parties[0])


def events(state, key):
    return [e for e in state.events.values() if e.kind == 'false-moon:' + key]


def view(core, state):
    return core.frame(state).weeklyBoss.falseMoon


def move(w, spec, step, key):
    w.rest,w.cast = 0,None
    w.index = list(spec.order.values()).index(key)+1
    step()
    assert w.cast.key == key
    return w.cast


def open_rift(w, spec, step):
    w.lastRift = -math.inf
    c = move(w, spec, step, 'WM13')
    run(step, spec.rift.enterTick)
    return c


def vote(core, states, x):
    for state in states:
        spot(state, x)
        core.action(state, USE)


def laws(lua, core):
    room, parties, members, w, spec = match(core)
    host, guest, switched, safe = parties
    step = lambda: core.stepCoop(room, TICK)
    switched.actors[2].hp = switched.actors[2].maxhp
    guest.actors[1].ground,guest.actors[1].y = False,350
    w.rest=0
    step()
    assert w.cast is None  # One airborne participant delays the law.
    spot(guest,395)
    c = move(w, spec, step, 'WM09')
    run(step, 119)
    guest.actors[1].dash, guest.actors[1].dashDir = .2,-1
    run(step, 11)
    assert not events(guest, 'WM09:violation:walk')
    for member in (members[0], members[2]):
        member.input = lua.table(right=True)
    step()
    for member in (members[0], members[2]):
        member.input = None
    core.action(switched,'swap')
    assert switched.active == 2
    assert [view(core, s).rule.violated for s in parties] == [True,False,True,False]
    run(step, 455-c.t)
    for state in parties:
        spot(state, 475)
    run(step, 25)
    assert [len(events(s,'WM12:hit')) for s in parties] == [1,0,1,0]
    assert events(switched,'WM12:hit')[0].actor == 2
    assert all(not events(s,'WM09:success') for s in (host,switched))
    assert all(events(s,'WM09:success') for s in (guest,safe))
    # Two participants facing different directions at the same position get different results.
    for state in parties:
        spot(state, 294)
        state.actors[state.active].dir = -1
        state.actors[state.active].lock = 0
    guest.actors[1].dir = 1
    c = move(w, spec, step, 'WM10')
    run(step, 120)
    assert [view(core, s).rule.violated for s in parties] == [False,True,False,False]
    c = move(w, spec, step, 'WM08')
    run(step, 359)
    for state,x in zip(parties,(160,623,658,900)):
        spot(state,x)
    step()
    assert len(events(host,'WM08:ward')) == 1
    assert not events(host,'WM08:hit')
    assert all(events(s,'WM08:hit')[-1].value == spec.damage.shock for s in parties[1:])


def cycle(lua, core):
    room,parties,members,w,spec = match(core)
    host,guest,late,safe = parties
    step = lambda: core.stepCoop(room, TICK)
    core.detachCoop(members[2])
    c = open_rift(w,spec,step)
    vote(core,(host,guest),spec.rift.x)
    assert view(core,host).vote.count == 2 and view(core,host).vote.required == 3
    run(step, 95)
    assert c.confirm is None and room.node == OUTER
    vote(core,(safe,),spec.rift.x)
    assert c.confirm == c.t+90
    core.action(guest,CANCEL)
    step()
    assert c.confirm is None and view(core,safe).vote.mine
    vote(core,(guest,),spec.rift.x)
    run(step, 90)
    assert w.cast.key == 'WM14'
    core.attachCoop(room,late,members[2])
    step()
    assert w.cast.key == 'WM13' and w.cycle == w.epoch == 0
    assert view(core, late).vote.required == 4
    vote(core,(late,),spec.rift.x)
    run(step,89)
    safe.actors[2].hp=safe.actors[2].maxhp
    safe.actors[1].hp=0
    step()
    assert w.cast.key == 'WM13' and not view(core,safe).vote.mine and safe.active==2
    vote(core,(safe,),spec.rift.x)
    run(step,90)
    assert w.cast.key == 'WM14' and w.epoch == 0
    snapshot=[]
    for i,state in enumerate((host,guest,late)):
        a=state.actors[1]
        a.hp,a.cd.skill1,state.gauge = 110+i,10,25+i
        snapshot.append((a.hp,state.gauge))
    run(step,89)
    assert all(s.story.node==OUTER for s in parties)
    step()
    assert room.node==INNER and all(s.story.node==INNER and core.sharesCoopField(s) for s in parties)
    assert [s.actors[1].x for s in (host,guest,late)] == [103,175,319]
    assert [(s.actors[1].hp,s.gauge) for s in (host,guest,late)] == snapshot
    assert all(math.isclose(s.actors[1].cd.skill1,8.5) for s in (host,guest,late))
    run(step,90)
    assert w.cast.key == 'WM15' and len(w.shadows)==3
    strike(lua,core,host,w.shadows[1])
    strike(lua,core,guest,w.shadows[2])
    assert w.innerCount==2 and all(s.kills==0 for s in parties)
    vote(core,(host,),spec.rift.exitX)
    step()
    assert w.cast.key=='WM15'
    vote(core,(guest,late,safe),spec.rift.exitX)
    step()
    assert w.cast.key=='WM16'
    assert len(w.shadows)==0 and w.innerCount==2
    hp=w.primary.hp
    run(step,95)
    assert (room.node,w.epoch,w.primary.hp) == (OUTER,2,hp)
    step()
    assert w.primary.hp==hp-272 and w.budget==544
    assert all([e.value for e in events(s,'WM16:loss')]==[272] for s in parties)
    run(step,24)
    assert all(view(core,s).exposure==360 for s in parties)
    run(step,360)
    assert w.primary.invulnerable
    assert all(len(events(s,'WM16:loss'))==1 for s in parties)


def room_created_during_entry(core):
    parties=[]
    for _ in range(2):
        state=core.new(12)
        core.action(state,'story_start')
        prepare(core,state)
        core.enterStoryNode(state,OUTER)
        parties.append(state)
    host,guest=parties
    w,spec=core.currentWeeklyBoss(host)
    step=lambda:core.step(host,TICK)
    open_rift(w,spec,step)
    vote(core,(host,),spec.rift.x)
    run(step,90)
    assert w.cast.key=='WM14'
    room=core.newCoop(host)
    core.attachCoop(room,host)
    core.attachCoop(room,guest)
    core.stepCoop(room,TICK)
    assert w.cast.key=='WM13' and w.epoch==0
    assert view(core,guest).vote.count==1 and view(core,guest).vote.required==2


def capped_finish(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,other,safe=parties
    step=lambda:core.stepCoop(room,TICK)
    for wanted, after in ((408,2992),(408,2584),(0,2584)):
        open_rift(w,spec,step)
        vote(core,parties,spec.rift.x)
        run(step,90+180)
        assert w.cast.key=='WM15'
        for state,shadow in zip(parties,w.shadows.values()):
            strike(lua,core,state,shadow)
        step()
        run(step,120)
        assert w.primary.hp==after and w.cast.key=='WM16'
        if wanted: assert events(guest,'WM16:loss')[-1].value==wanted
    assert w.budget==0 and len(events(host,'WM16:loss'))==2
    for state in parties:
        spot(state,485)
    strike(lua,core,host,w.primary)
    assert [s.kills for s in parties] == [1,1,1,0]
    assert [s.progression.killXp for s in parties] == [EXP,EXP,EXP,0]
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None


def lethal_return_and_wipe(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,*_=parties
    step=lambda:core.stepCoop(room,TICK)
    open_rift(w,spec,step)
    vote(core,parties,spec.rift.x)
    run(step,270)
    for state,e in zip((host,guest),w.shadows.values()):
        strike(lua,core,state,e)
    core.detachCoop(members[1])
    assert guest.story.node==OUTER
    w.primary.hp=100
    vote(core,(host,*parties[2:]),spec.rift.exitX)
    run(step,97)
    assert w.primary.hp==0 and [state.kills for state in parties]==[1,0,0,0]
    assert events(host,'WM16:loss')[-1].value==100 and not w.rewindUsed

    room,parties,_,w,spec=match(core,2)
    step=lambda:core.stepCoop(room,TICK)
    open_rift(w,spec,step)
    vote(core,parties,spec.rift.x)
    run(step,270)
    for state in parties:
        spot(state,w.shadows[1].x-15)
        state.actors[1].hp=1
    run(step,spec.rift.shadowFirst)
    assert w.rechallenge and room.node==INNER
    step()
    assert room.node==OUTER and w.cycle==w.epoch==0 and w.primary.hp==3400


def via_http(url):
    host,guest,late=clients=[Client(url) for _ in range(3)]
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],i==0)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        assert cross(client,210,OUTER)['weeklyBoss']['maxhp']==3400
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core,session=env['lua'],env['core'],env['coop_room']
        room=session.worlds[OUTER]
        states=[SESSIONS[c.sid]['state'] for c in (host,guest)]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        open_rift(w,spec,step)
        for s in states: spot(s,spec.rift.x)
    a=host.frame([USE])
    assert a['weeklyBoss']['falseMoon']['vote']=={'count':1,'required':2,'mine':True}
    assert a['weeklyBoss']['falseMoon'].get('confirm') is None
    b=guest.frame([USE])
    assert b['weeklyBoss']['falseMoon']['confirm']>0
    with LOCK: run(step,270)
    fs=advance(host,guest,.1)
    assert all(f['coop']['map']==f['story']['node']==INNER for f in fs)
    assert INNER not in session.worlds
    assert late.frame(['coop_join:'+code])['coop']['code']==code
    with LOCK:
        spot(SESSIONS[late.sid]['state'],210)
    joined=late.frame(['story_portal:'+OUTER])
    assert joined['story']['node']==INNER and joined['weeklyBoss']['falseMoon']['epoch']==1
    with LOCK:
        states.append(SESSIONS[late.sid]['state'])
        for state,shadow in zip(states[:2],w.shadows.values()):
            strike(lua,core,state,shadow)
        assert w.innerCount==2
        for s in states: spot(s,spec.rift.exitX)
    host.frame([USE])
    guest.frame([USE])
    assert host.frame()['weeklyBoss']['falseMoon']['card']=='WM15'
    late.frame([USE])
    with LOCK:
        run(step,121)
        assert room.node==OUTER and w.primary.hp==3128
        for s in states: spot(s,470)
        strike(lua,core,states[0],w.primary)
    for i,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['progression']['killXp']==(EXP if i<2 else 0)
        assert saved['mora']==(5500 if i<2 else 0)
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    laws(lua,core)
    cycle(lua,core)
    room_created_during_entry(core)
    capped_finish(lua,core)
    lethal_return_and_wipe(lua,core)
    with lab() as url:
        via_http(url)
    proof=dict(lua=dict(participants=4, ownMotionAndFacing=True, onlyOwnSentenceAfterSwap=True,
                        individualCover=True, allLivingVotes=True, deathRecountsVotes=True,
                        arrivalBeforeCommitReopensVote=True, roomCreatedDuringEntryRecountsVotes=True, earlyReturnRequiresAll=True,
                        carriesHpCooldownAndGauge=True, earlyReturnLoss=272, exposureTicks=360,
                        twoFullReturnsCap=816, zeroBudgetStillExposes=True, lethalSettlementOnce=True,
                        detachedAttackerNoReward=True, wipeReturnsToOuter=True),
               http=dict(participants=3, oneRoomAcrossScenes=True, lateJoinToInner=True,
                         earlyReturnRequiresAll=True, ownRewards=True, personalXp=EXP, personalMora=5500))
    (ROOT/'evidence/coop-false-moon-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
