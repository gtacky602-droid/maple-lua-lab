"""Exercise Knave's shared encounter with per-actor contracts and repayment."""
import json
from math import isclose
from time import monotonic, sleep

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB = 'boss-29091001', 'fontaine-hub'
ARENA, QUEST = 'knave-crimson-court', 'knave-weekly-commission'
LEVEL = LEVELS[87]
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
        spot(s,(44,44,916,916)[i])
        parties.append(s)
    parties[0].t,parties[1].t,parties[2].t=470,15,720
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def events(s,key):
    return [e.value for e in s.events.values() if e.kind=='knave:'+key]


def view(core,s):
    return core.frame(s).weeklyBoss.knave


def ledger(w,s,index=None):
    return w.actors[s.actors[index or s.active]]


def declare(w,spec,step):
    w.primary.hp=spec.secondHp+(spec.hp-spec.secondHp)*.69
    w.rest=0
    step()
    assert w.cast.key=='WK07'
    run(step,120)


def move(w,spec,step,key):
    order=spec.first if w.form==1 else spec.second
    w.cast,w.rest,w.index=None,0,list(order.values()).index(key)+1
    w.lastDeclaration=w.clock
    step()
    assert w.cast.key==key
    return w.cast


def switch(core,s):
    ally=s.actors[2]
    ally.hp=ally.maxhp
    core.action(s,'swap')
    assert s.active==2


def debt(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,healer,observer=parties
    step=lambda:core.stepCoop(room,TICK)
    switch(core,healer)
    healer.actors[1].hp=0
    before=[s.actors[s.active].hp for s in parties]
    declare(w,spec,step)
    assert [s.actors[s.active].hp for s in parties]==before
    assert all(isclose(ledger(w,s).debt,s.actors[s.active].maxhp*.25) for s in parties)
    assert all(len(events(s,'WK08:debt'))==1 for s in parties)
    assert ledger(w,healer,1).debt==ledger(w,host,2).debt==0
    active=healer.actors[2]
    active.hp-=20
    assert core.healActor(healer,active,ledger(w,healer).debt+8)==8
    assert ledger(w,healer).feather and ledger(w,guest).debt>0 and not ledger(w,observer).feather

    held=lua.table(interact=True)
    members[0].input=members[1].input=held
    w.rest=3000
    step()
    started=w.clock
    run(step,44)
    assert view(core,host).hold==view(core,guest).hold==1
    assert not events(host,'WK08:lamp') and not events(guest,'WK08:lamp')
    step()
    assert ledger(w,host).lastPay-started==ledger(w,guest).lastPay-started==45
    assert isclose(ledger(w,host).debt,host.actors[1].maxhp*.20)
    assert isclose(ledger(w,guest).debt,guest.actors[1].maxhp*.20)
    assert view(core,observer).hold is None and not events(observer,'WK08:lamp')
    core.action(guest,'jump')
    step()
    assert view(core,guest).hold is None and view(core,host).hold==29
    members[1].input=None
    run(step,29)
    assert len(events(host,'WK08:lamp'))==2 and len(events(guest,'WK08:lamp'))==1
    run(step,90)
    assert ledger(w,host).debt==0 and ledger(w,host).feather
    assert len(events(host,'WK08:feather'))==1 and len(events(guest,'WK08:feather'))==0

    # Form change holds the debt clock for everybody without transferring feathers.
    debt_clock=w.debtClock
    guest_hp=guest.actors[1].hp
    strike(lua,core,host,w.primary)
    assert w.cast.key=='WK11' and w.primary.hp==1320
    run(step,spec.moves.WK11.total)
    assert w.form==2 and w.debtClock==debt_clock and guest.actors[1].hp==guest_hp
    assert ledger(w,host).feather and ledger(w,healer).feather and ledger(w,guest).debt>0
    guest_record=ledger(w,guest)
    core.detachCoop(members[1])
    assert ledger(w,guest) is None and guest_record.debt>0
    core.attachCoop(room,guest,members[1])
    assert view(core,guest).actors[1].debt==0 and not view(core,guest).actors[1].feather
    assert view(core,host).actors[1].feather
    healer.actors[1].hp=healer.actors[1].maxhp
    healer.actors[2].hp=0
    step()
    assert not ledger(w,healer,2).feather and len(events(healer,'WK08:feather'))==1


def refund(lua,core):
    room,parties,_,w,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    c=move(w,spec,step,'WK10')
    assert c.spent>0 and isclose(w.primary.hp,spec.hp-c.spent)
    for s,x in zip(parties,(440,510,78,890)):
        spot(s,x)
    run(step,spec.moves.WK10.windows[1][1])
    assert c.refunded and isclose(w.primary.hp,spec.hp)
    assert [len(events(s,'WK10:hit')) for s in parties]==[1,1,0,0]
    assert [len(events(s,'WK08:debt')) for s in parties]==[1,1,0,0]
    run(step,6)
    assert [len(events(s,'WK10:hit')) for s in parties]==[1,1,0,0]
    strike(lua,core,parties[0],w.primary)
    run(step,spec.moves.WK11.total)
    assert w.form==2 and w.primary.hp==1320
    c=move(w,spec,step,'WK14')
    assert c.spent>0 and isclose(w.primary.hp,1320-c.spent)
    run(step,spec.moves.WK14.windows[1][1])
    assert c.refunded and isclose(w.primary.hp,1320)
    assert [len(events(s,'WK14:hit')) for s in parties]==[1,1,0,0]
    assert all(isclose(ledger(w,s).debt,s.actors[1].maxhp*.5) for s in parties[:2])


def answer(core,s,w):
    a=s.actors[s.active]
    spot(s,w.primary.x-63)
    a.dir,a.atk,a.lock,a.cd.normal=1,12,0,0
    core.action(s,'encounter_interact')


def interruption(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    for s in (host,guest):
        switch(core,s)
        s.actors[1].hp=0
    declare(w,spec,step)
    for s in (host,guest):
        core.healActor(s,s.actors[2],s.actors[2].maxhp)
        assert ledger(w,s,2).feather and not ledger(w,s,1).feather
    c=move(w,spec,step,'WK10')
    run(step,100)
    for s in (host,guest):
        answer(core,s,w)
        assert any(attack.knaveOrder for attack in s.pending.values())
    run(step,10)
    assert w.cast.key=='WK17' and not ledger(w,host,2).feather and ledger(w,guest,2).feather
    assert events(host,'WK09')==[1] and not events(guest,'WK09')
    assert all(len(events(s,'WK17'))==1 for s in parties)
    assert host.hits>0 and guest.hits>0
    run(step,spec.moves.WK10.windows[1][1]-c.t)
    assert not any(events(s,'WK10:hit') for s in parties) and view(core,host).exposure>0

    c=move(w,spec,step,'WK10')
    run(step,100)
    answer(core,guest,w)
    guest.actors[1].hp=guest.actors[1].maxhp
    guest.swap=0
    core.action(guest,'swap')
    assert guest.active==1 and any(attack.knaveOrder for attack in guest.pending.values())
    run(step,10)
    assert w.cast.key=='WK10' and ledger(w,guest,2).feather and not events(guest,'WK09')
    strike(lua,core,host,w.primary)
    run(step,spec.moves.WK11.total)
    spot(host,410);spot(guest,550)
    strike(lua,core,host,w.primary,26)
    strike(lua,core,guest,w.primary)
    assert [s.kills for s in parties]==[1,1,0,0]
    assert [(s.progression.killXp,s.mora) for s in parties[:2]]==[(EXP,2800)]*2
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None


def wipe(core):
    room,parties,_,w,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    move(w,spec,step,'WK10')
    for s in parties:
        spot(s,480)
        s.actors[1].hp=1
    run(step,spec.moves.WK10.windows[1][1])
    assert w.rechallenge and all(s.actors[1].hp==0 for s in parties)
    step()
    assert w.primary.hp==2400 and w.form==1 and not w.rechallenge
    assert all(s.kills==0 and s.returns==1 for s in parties)


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
        assert cross(client,186,ARENA)['weeklyBoss']['maxhp']==2400
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        states=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[ARENA]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        declare(w,spec,step)
        for s in states:
            spot(s,44)
    until=monotonic()+5
    while monotonic()<until:
        a,b=[c.frame(input={'interact':True}) for c in clients]
        if all(any(e['kind']=='knave:WK08:lamp' for e in v['events']) for v in (a,b)):
            break
        sleep(.025)
    else:
        raise AssertionError('Same-lamp holds did not reach both actors')
    paid=a['weeklyBoss']['knave']['actors'][0]['debt']
    assert 0<paid==b['weeklyBoss']['knave']['actors'][0]['debt']
    guest.frame()
    until=monotonic()+4
    while monotonic()<until:
        a=host.frame(input={'interact':True})
        b=guest.frame()
        if a['weeklyBoss']['knave']['actors'][0]['debt']<paid:
            break
        sleep(.03)
    else:
        raise AssertionError('The host stopped paying when the guest released')
    assert b['weeklyBoss']['knave']['actors'][0]['debt']==paid
    hp=b['weeklyBoss']['hp']
    cross(guest,130,HUB)
    again=cross(guest,186,ARENA)
    assert again['weeklyBoss']['hp']==hp and again['weeklyBoss']['knave']['actors'][0]['debt']==0
    with LOCK:
        strike(lua,core,states[0],w.primary)
        run(step,spec.moves.WK11.total)
        spot(states[0],425);spot(states[1],535)
        strike(lua,core,states[0],w.primary,26)
        strike(lua,core,states[1],w.primary)
    for i,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==2800
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    debt(lua,core)
    refund(lua,core)
    interruption(lua,core)
    wipe(core)
    with lab() as url:
        via_http(url)
    result=dict(lua=dict(participants=4,declarationOnlyActiveActors=True,healFirstAndIndependent=True,
                         parallelSameLamp45Then30=True,cancelsOnlyOwnHold=True,contractAndFeatherSurviveTransformation=True,
                         leaveAndDeathClearWithoutAward=True,contractRefundOncePerForm=True,simultaneousCounterOneFeather=True,
                         pendingCounterInvalidAfterSwap=True,allWipeResets=True),
                http=dict(participants=2,sameLampSimultaneousInput=True,remoteReleaseDoesNotCancel=True,
                          personalDebtClearedOnExit=True,sharedHp=2400,personalXp=EXP,personalMora=2800,ownQuestAndSaves=True))
    (ROOT/'evidence/coop-knave-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
