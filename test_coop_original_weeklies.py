"""Verify the original weekly trials in shared Lua and HTTP rooms."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


HUB = 'liyue-harbor'
SURVEYOR = ('original-tide-surveyor','tide-calibration-hall','surveyor-inspection',30,1120,42,340)
LOOM = ('original-twin-shuttle-loom','buried-weaving-room','loom-stopped',34,1240,45,360)


def xp(level):
    return LEVELS[level-1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core,state,case):
    _,_,quest,level,*_=case
    core.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,HUB)
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    state.actors[2].hp=0


def match(core,case):
    parties=[]
    for i in range(4):
        state=core.new(12)
        core.action(state,'story_start')
        prepare(core,state,case)
        core.enterStoryNode(state,case[1])
        state.t=i*173
        parties.append(state)
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def wait_move(step,w,key,tick=1):
    for _ in range(1400):
        if w.cast and w.cast.move.id==key and w.cast.tick==tick:
            return w.cast
        step()
    raise AssertionError((key,tick,w.stage,w.phase))


def events(state,name):
    return [e for e in state.events.values() if e.kind==name]


def view(core,state):
    return core.frame(state).weeklyBoss


def surveyor(lua,core):
    room,parties,members,w,spec=match(core,SURVEYOR)
    host,guest,safe,immune=parties
    step=lambda:core.stepCoop(room,TICK)
    for s,x in zip(parties,(407,408,660,404)): spot(s,x)
    c=wait_move(step,w,'TS01',53)
    assert all(view(core,s).zones[1].left==c.zones[1].left for s in parties)
    immune.actors[1].inv=1
    step()
    assert [s.actors[1].hp for s in parties]==[128,128,140,140]
    assert [len(events(s,'surveyor_mark')) for s in parties]==[1,1,0,0]
    assert [bool(view(core,s).marks['1']) for s in parties]==[True,True,False,False]
    assert math.isclose(view(core,host).marks['1'],22)
    assert math.isclose(view(core,guest).marks['1'],22)
    a=host.actors[1]
    a.x,a.y=160,374
    step()
    assert w.marks[a] is not None
    a.y=480;step()
    assert w.marks[a] is None and view(core,guest).marks['1']>21
    assert len(events(host,'surveyor_cleanse'))==1 and not events(guest,'surveyor_cleanse')
    a.x=410
    wait_move(step,w,'TS02',66)
    assert [s.actors[1].hp for s in (host,guest)]==[112,100]
    assert not events(host,'surveyor_feedback') and events(guest,'surveyor_feedback')[0].value==12
    assert not len(w.marks)

    strike(lua,core,host,w.primary,240)
    wait_move(step,w,'TS04')
    assert w.stage==2 and 221<w.primary.hp<455
    strike(lua,core,guest,w.primary,250)
    wait_move(step,w,'TS07')
    assert w.stage==3 and all(view(core,s).stage==3 for s in parties)
    mark=room.time+10
    w.marks[guest.actors[1]]=mark
    core.detachCoop(members[1])
    assert w.marks[guest.actors[1]] is None
    core.attachCoop(room,guest,members[1])
    for s in parties: spot(s,440)
    strike(lua,core,guest,w.primary,10)
    strike(lua,core,host,w.primary,1000)
    assert [s.kills for s in parties]==[1,1,0,0]
    assert [s.story.quests[SURVEYOR[2]].count for s in parties]==[1,1,0,0]


def loom(lua,core):
    room,parties,_,w,spec=match(core,LOOM)
    host,guest,other,safe=parties
    step=lambda:core.stepCoop(room,TICK)
    for s,x in zip(parties,(298,655,658,910)): spot(s,x)
    c=wait_move(step,w,'LW01',40)
    strike(lua,core,host,w.primary,1000)
    assert w.primary.hp==250
    strike(lua,core,host,w.shuttles[1],100)
    assert w.shuttles[1].hp==0 and w.shuttles[2].hp==24
    wait_move(step,w,'LW01',106)
    assert [s.actors[1].hp for s in parties]==[140,123,123,140]
    assert all(not s.kills and not s.mora for s in parties)
    strike(lua,core,guest,w.shuttles[2],100)
    step()
    assert w.cycle==1 and len(room.enemies)==1
    assert all(view(core,s).openTicks==780 and view(core,s).stage=='open' for s in parties)
    assert all([e.value for e in events(s,'loom_exposed')]==[1] for s in parties)
    strike(lua,core,host,w.primary,80)
    wounded=w.primary.hp
    assert 0<wounded<250
    run(step,779)
    assert all(view(core,s).openTicks==1 for s in parties)
    pending=lua.table(id=1,x=480,y=480,atk=10000,radial=True,range=100,limit=1,mult=1,
                      dir=1,element='physical',gain=0,color='#faf8df',next=host.t+TICK,remaining=1,interval=0)
    host.pending[1]=pending
    step()
    assert w.cast.move.id=='LW04' and w.primary.hp==wounded and len(room.enemies)==3
    assert [w.shuttles[i].hp for i in (1,2)]==[24,24]
    for s in parties: spot(s,480)
    strike(lua,core,host,w.shuttles[1],100)
    strike(lua,core,guest,w.shuttles[2],100)
    step()
    assert w.cycle==2 and w.primary.hp==wounded
    strike(lua,core,host,w.primary,1000)
    assert [s.kills for s in parties]==[1,1,0,0]
    assert [s.progression.killXp for s in parties]==[xp(34),xp(34),0,0]


def wipe(lua,core,case):
    room,parties,_,w,spec=match(core,case)
    step=lambda:core.stepCoop(room,TICK)
    if case==SURVEYOR:
        for s in parties: spot(s,420)
        wait_move(step,w,'TS01',53)
    else:
        for s in parties: spot(s,290)
        wait_move(step,w,'LW01',63)
        strike(lua,core,parties[0],w.shuttles[2],100)
    hp=w.primary.maxhp
    for s in parties:
        s.actors[1].hp=1
        s.actors[1].inv=0
    step()
    assert w.rechallenge and all(s.actors[1].hp==0 for s in parties)
    step()
    assert w.primary.hp==hp and not w.rechallenge and all(s.returns==1 for s in parties)
    assert len(room.enemies)==(1 if case==SURVEYOR else 3)
    assert not any(s.kills for s in parties)


def via_http(url,case):
    boss,arena,quest,level,entrance,exit_x,mora=case
    host,guest=clients=[Client(url) for _ in range(2)]
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],case)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in clients: cross(client,entrance,arena)
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        room=env['coop_room'].worlds[arena]
        states=[SESSIONS[c.sid]['state'] for c in clients]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        run(step,spec.noticeTicks+1)
        targets=(w.primary,w.primary) if case==SURVEYOR else tuple(w.shuttles.values())
        for s,o in zip(states,targets):
            spot(s,o.x-65)
            s.actors[1].dir,s.actors[1].atk=1,45
    host.frame(['normal'])
    a,b=advance(host,guest,.10)
    if case==LOOM:
        assert all([p['broken'] for p in f['weeklyBoss']['shuttles']]==[True,False] for f in (a,b))
        assert all(f['weeklyBoss']['stage']=='sealed' for f in (a,b))
    else:
        assert 0<w.primary.hp<650
    for client in clients:
        cross(client,exit_x,HUB)
    frozen=(room.tick,w.primary.hp)
    advance(host,guest,.12)
    assert (room.tick,w.primary.hp)==frozen
    for client in clients:
        assert cross(client,entrance,arena)['weeklyBoss']['hp']==frozen[1]
    with LOCK:
        if case==LOOM: assert w.shuttles[1].hp==0 and w.shuttles[2].hp==24
        for state,target in zip(states,targets):
            spot(state,target.x-64)
            state.actors[1].dir,state.actors[1].atk=1,45
    guest.frame(['normal'])
    views=advance(host,guest,.14)
    if case==LOOM:
        assert all(f['weeklyBoss']['stage']=='open' and f['weeklyBoss']['openTicks']>740 for f in views)
    else:
        assert w.primary.hp<frozen[1]
    with LOCK:
        # Confirm eligibility on the final shared attempt after the retreat.
        strike(lua,core,states[0],w.primary,1000)
    for client in clients:
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][boss]['hp']==0 and saved['endgame']['bosses'][boss]['clears']==1
        assert (saved['progression']['killXp'],saved['mora'])==(xp(level),mora)
        assert saved['story']['quests'][quest]['count']==1
        cross(client,exit_x,HUB)
    assert host.frame(['story_report:'+quest])['story']['quests'][quest]['status']=='complete'
    assert guest.frame()['story']['quests'][quest]['status']=='active'
    assert guest.frame(['story_report:'+quest])['story']['quests'][quest]['status']=='complete'


if __name__=='__main__':
    lua,core=runtime()
    surveyor(lua,core)
    loom(lua,core)
    for case in (SURVEYOR,LOOM): wipe(lua,core,case)
    with lab() as url:
        for case in (SURVEYOR,LOOM): via_http(url,case)
    proof=dict(lua=dict(participants=4, eachActorOwnMark=True, sameRoomClock=True, groundedCleanse=True,
                        personalFeedbackBonus=12, threeSharedStages=True, leaveClearsMarks=True,
                        shuttlesIndependent=True, exposureTicks=780, noDamageAtClosure=True,
                        rebuildPreservesHp=True, contributorOnlyRewards=True, wipeRestoresBothTrials=True),
               http=dict(participants=2, mechanicsThroughNormalInput=True, retreatFreezesBoth=True,
                         separateReports=True, surveyorXp=xp(30), surveyorMora=340,
                         loomXp=xp(34), loomMora=360))
    (ROOT/'evidence/coop-original-weeklies-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
