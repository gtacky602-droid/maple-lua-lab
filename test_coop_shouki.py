"""Test shared Shouki resources and independently owned terminal commands."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB = 'boss-29070101', 'sumeru-hub'
ARENA, QUEST = 'shouki-godmaking-arena', 'shouki-weekly-commission'
LEVEL = LEVELS[63]
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
        core.enterStoryNode(s,ARENA)
        spot(s,80+230*i)
        parties.append(s)
    parties[0].t,parties[1].t,parties[2].t=250,14,720
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def events(s,key):
    return [e.value for e in s.events.values() if e.kind=='shouki:'+key]


def view(core,s):
    return core.frame(s).weeklyBoss.shouki


def supplies(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,far,wind=parties
    step=lambda:core.stepCoop(room,TICK)
    w.rest=2500
    w.blocks=lua.table_from([
        {'x':300,'y':480,'value':50,'id':501,'expires':999},
        {'x':640,'y':480,'value':50,'id':502,'expires':999},
    ],recursive=True)
    for s,x in zip(parties,(300,300,640,500)):
        spot(s,x)
    step()
    assert w.charge==100 and not len(w.blocks)
    assert [events(s,'WN18:collected') for s in parties]==[[501],[],[502],[]]
    assert all(view(core,s).charge==100 for s in parties)
    w.floors=lua.table_from([{'x':310,'width':100,'element':'pyro','expires':900}],recursive=True)
    before=[s.actors[1].hp for s in parties]
    run(step,10)
    assert [hp-s.actors[1].hp for hp,s in zip(before,parties)]==[5,5,0,0]
    for s,x in zip(parties,(557,598,840,230)):
        spot(s,x)
        s.actors[1].hp-=20
    before=[s.actors[1].hp for s in parties]
    core.action(host,'encounter_interact')
    core.action(guest,'encounter_interact')
    step()
    assert [s.actors[1].hp-hp for hp,s in zip(before,parties)]==[7,7,0,0]
    assert events(host,'WN06:hydro')==[0] and not events(guest,'WN06:hydro')
    w.charge=100
    core.action(wind,'encounter_interact')
    core.action(wind,'jump')
    members[3].input=lua.table(jump=True)
    run(step,4)
    assert events(wind,'WN06:lift') and wind.actors[1].vy<-650
    assert all(not events(s,'WN06:lift') for s in parties[:3])
    spot(host,393);spot(guest,883)
    w.charge=100
    core.action(host,'encounter_interact')
    assert w.charge==0 and all(view(core,s).left for s in parties)
    w.charge=100
    core.action(guest,'encounter_interact')
    run(step,60)
    assert w.stage=='overload' and not w.primary.invulnerable
    assert all(view(core,s).exposure==360 for s in parties)


def armored(lua,core,s,w,spec,step):
    strike(lua,core,s,w.primary)
    assert w.stage=='rise' and w.primary.hp==1040
    run(step,spec.moves.WN08.total)
    w.rest,w.autoAt=3000,8000
    assert w.stage=='p2' and w.shield==100
    assert w.blocks[1].value==100
    w.blocks[1]=None


def cast(lua,core,s,x,**change):
    cast=lua.table_from(dict(id=s.active,x=x,y=480,radial=True,range=88,dir=1,atk=12,
                             mult=1,limit=4,gain=0,element='physical',color='#eef7e4',
                             playerInputAt=s.t)|change)
    core.resolveCast(s,cast)
    return cast


def trial(w,spec,step):
    w.shield=0
    step()
    assert w.stage=='trial'
    run(step,60)
    assert len(w.targets)==4


def terminal(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    armored(lua,core,host,w,spec,step)
    first=cast(lua,core,host,w.primary.x)
    core.resolveCast(host,first)
    cast(lua,core,host,w.primary.x)
    cast(lua,core,guest,w.primary.x)
    assert w.shield==98 and w.primary.hp==1040
    spot(host,220);spot(guest,745)
    w.charge=100
    core.action(host,'encounter_interact')
    core.action(guest,'encounter_interact')
    core.action(guest,'encounter_target:left')
    core.action(guest,'encounter_confirm')
    core.action(guest,'encounter_cancel')
    assert w.aim.target=='core' and not w.aim.confirmed and w.charge==100
    assert view(core,host).aim.mine and not view(core,guest).aim.mine
    assert view(core,guest).aim.slot==members[0].id and view(core,guest).aim.owner==1
    host.actors[2].hp=host.actors[2].maxhp
    core.action(host,'swap')
    assert host.active==2
    step()
    assert not w.aim and w.charge==100
    host.actors[1].hp=0

    core.action(guest,'encounter_interact')
    members[1].online=False
    step()
    assert not w.aim and w.charge==100
    members[1].online=True
    core.action(guest,'encounter_interact')
    core.action(guest,'encounter_confirm')
    run(step,spec.moves.WN14.launches[1]-1)
    assert not w.aim.fired and w.charge==100
    step()
    assert w.aim.fired and w.charge==0 and w.shot
    core.detachCoop(members[1])
    run(step,spec.moves.WN14.total)
    assert not w.aim and w.charge==0 and w.shield==73
    core.attachCoop(room,guest,members[1])
    guest.actors[2].hp=0

    early=guest.t
    trial(w,spec,step)
    cast(lua,core,guest,96,playerInputAt=early)
    assert w.targets[1].charges==4
    core.action(host,'encounter_target:pod1')
    core.action(guest,'encounter_target:pod4')
    assert view(core,host).assist==1 and view(core,guest).assist==4 and view(core,far).assist is None
    assert w.targets[1].acceptsAutoTarget(host,host.actors[1])
    assert not w.targets[1].acceptsAutoTarget(guest,guest.actors[2])
    cast(lua,core,host,96,id=1,playerInputAt=None,growthAI=True,startedAt=host.t)
    cast(lua,core,guest,96,id=2,playerInputAt=None,growthAI=True,startedAt=guest.t)
    assert w.targets[1].charges==3
    same=cast(lua,core,guest,864,id=2,playerInputAt=None,growthAI=True,startedAt=guest.t)
    core.resolveCast(guest,same)
    assert w.targets[4].charges==3
    for s,pod in zip(parties,list(w.targets.values())):
        for _ in range(pod.charges):
            cast(lua,core,s,pod.x)
        assert pod.hp==0
    assert w.trialLeft==0 and w.charge==100 and not list(w.assists.keys())
    assert [events(s,'WN15:destroyed') for s in parties]==[[1],[2],[3],[4]]
    spot(guest,536)
    core.action(guest,'encounter_interact')
    core.action(guest,'encounter_confirm')
    for _ in range(120):
        step()
        if w.stage=='collapse':
            break
    assert w.stage=='collapse' and w.stageTick==0 and w.primary.hp==1040 and w.charge==0
    assert events(guest,'WN14:core-hit')==[0]
    run(step,60)
    assert all(view(core,s).exposure==600 for s in parties)
    assert all(view(core,s).trialResult.kind=='core-hit' for s in parties)
    spot(host,440);spot(guest,530)
    strike(lua,core,host,w.primary,30)
    strike(lua,core,guest,w.primary)
    assert [s.kills for s in parties]==[1,1,1,1]
    assert [(s.progression.killXp,s.mora) for s in parties]==[(EXP,1370)]*4
    assert host.story.quests[QUEST].count==1 and all(s.story.quests[QUEST] is None for s in parties[1:])


def wipe(lua,core):
    room,parties,_,w,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    armored(lua,core,parties[0],w,spec,step)
    trial(w,spec,step)
    w.charge=75
    run(step,spec.trial.deadline-60)
    assert w.stage=='failure'
    for s in parties:
        spot(s,460)
        s.actors[1].hp=10
    run(step,spec.moves.WN16.windows[1][1])
    assert w.rechallenge and all(s.actors[1].hp==0 for s in parties)
    step()
    assert w.stage=='p1' and w.charge==0 and w.primary.hp==1630
    assert all(s.kills==0 and s.returns==1 for s in parties)


def timeout_views(lua,core):
    room,parties,_,w,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    armored(lua,core,parties[0],w,spec,step)
    trial(w,spec,step)
    run(step,spec.trial.deadline-60+179)
    assert w.stage=='failure' and view(core,parties[0]).trialResult.damage is None
    for state in parties:
        spot(state,460)
    parties[1].actors[1].inv=0.5
    step()
    assert [view(core,state).trialResult.damage for state in parties]==[72,0,72,72]
    run(step,180)
    assert w.stage=='p2' and w.shield==0
    assert all(view(core,state).trialResult.resumed for state in parties)


def via_http(url):
    host,guest=[Client(url),Client(url)]
    clients=(host,guest)
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],i==0)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in clients:
        assert cross(client,950,ARENA)['weeklyBoss']['maxhp']==1630
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        states=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[ARENA]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        armored(lua,core,states[0],w,spec,step)
        spot(states[0],232);spot(states[1],742)
        w.charge=100
    assert host.frame(['encounter_interact'])['weeklyBoss']['shouki']['aim']['mine']
    rejected=guest.frame(['encounter_confirm','encounter_cancel','encounter_target:right'])['weeklyBoss']['shouki']
    assert rejected['charge']==100 and not rejected['aim']['mine'] and rejected['aim']['target']=='core'
    assert not rejected['aim']['confirmed']
    cross(host,126,HUB)
    assert 'aim' not in guest.frame()['weeklyBoss']['shouki']
    assert guest.frame(['encounter_interact'])['weeklyBoss']['shouki']['aim']['mine']
    guest.frame(['encounter_confirm'])
    a,b=advance(host,guest,1.65)
    assert b['weeklyBoss']['shouki']['shield']==75 and b['weeklyBoss']['shouki']['charge']==0
    with LOCK:
        trial(w,spec,step)
        for _ in range(spec.trial.hits):
            cast(lua,core,states[1],96)
        assert w.charge==25 and w.trialLeft==3
    cross(guest,126,HUB)
    frozen=w.clock,w.stageTick,room.tick
    advance(host,guest,.2)
    assert (w.clock,w.stageTick,room.tick)==frozen
    for client in clients:
        frame=cross(client,950,ARENA)['weeklyBoss']['shouki']
        assert frame['charge']==25 and frame['trialLeft']==3
    with LOCK:
        for i,pod in enumerate(list(w.targets.values())[1:]):
            for _ in range(spec.trial.hits):
                cast(lua,core,states[i%2],pod.x)
        spot(states[0],453);spot(states[1],550)
        core.action(states[0],'encounter_interact')
        core.action(states[0],'encounter_confirm')
        run(step,150)
        assert w.stage=='collapse' and not w.primary.invulnerable
    for client in clients:
        assert client.frame()['weeklyBoss']['shouki']['trialResult']['kind']=='core-hit'
    with LOCK:
        strike(lua,core,states[0],w.primary,30)
        strike(lua,core,states[1],w.primary)
    for i,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==1370
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    supplies(lua,core)
    terminal(lua,core)
    timeout_views(lua,core)
    wipe(lua,core)
    with lab() as url:
        via_http(url)
    result=dict(lua=dict(participants=4,uniqueBlockPickup=True,individualFloorAndFields=True,pairedMatrixOverload=True,
                         separateShieldCooldowns=True,foreignTargetAndCancelRejected=True,swapAndOfflineReleaseReservation=True,
                         launchedShotSurvivesExit=True,oldAndMultiHitInputsRejected=True,perPartyCompanionOrders=True,
                         independentPodCredit=True,podSupportQualifiesForReward=True,coreExposureTicks=600,
                         personalTimeoutDamage=True,wipeReset=True),
                http=dict(participants=2,ownerLeavesBeforeFireWithoutSpending=True,replacementShoots=True,
                          sharedTrialFrozenOutsideArena=True,sharedTrialResult=True,
                          sharedHp=1630,personalXp=EXP,personalMora=1370,ownQuestAndSaves=True))
    (ROOT/'evidence/coop-shouki-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
