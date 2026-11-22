"""Exercise Heretic's shared trial, per-actor defenses, and contribution records."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB, ARENA = 'boss-29150101', 'sumeru-hub', 'sumeru-heretic-lattice'
QUEST, LEVEL = 'heretic-weekly-commission', LEVELS[143]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core,state,accepted=False):
    core.grantExp(state,LEVEL['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,HUB)
    if accepted:
        core.action(state,'story_accept:'+QUEST)
        assert state.story.quests[QUEST].status=='active'
    state.actors[2].hp=0


def match(core):
    parties=[]
    for i in range(4):
        state=core.new(12)
        core.action(state,'story_start')
        prepare(core,state,i==0)
        core.enterStoryNode(state,ARENA)
        spot(state,711)
        state.t=i*111
        parties.append(state)
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,state) for state in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def view(core,state):
    return core.frame(state).weeklyBoss.heretic


def events(state,key):
    return [e.value for e in state.events.values() if e.kind=='heretic:'+key]


def reach_trial(lua,core,state,step,w,spec):
    strike(lua,core,state,w.primary,power=10000)
    assert (w.form,w.primary.hp,w.cast.key)==(1,2250,'WH10')
    run(step,spec.moves.WH10.total)
    assert (w.form,w.cast.key,w.cast.t)==(2,'WH11',0)
    run(step,spec.moves.WH11.total+1+spec.moves.WH13.spawn_tick)
    assert w.cast.key=='WH13' and len(w.anchors)==2
    return w.cast


def pulse(lua,core,state,x,resolve=True,**opts):
    cast=lua.table_from(dict(id=state.active,atk=16,x=x,y=480,dir=1,radial=True,range=90,
                            limit=2,mult=1,element='physical',color='#fff3c2',gain=0)|opts)
    if resolve:
        core.resolveCast(state,cast)
    return cast


def walls_and_mimics(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,high,safe=parties
    step=lambda:core.stepCoop(room,TICK)
    c=reach_trial(lua,core,host,step,w,spec)
    for s in parties: spot(s,711)
    run(step,137)
    assert c.child.key=='WH14' and not c.child.gap.upper
    assert all(view(core,s).hole.bottom==480 and s.actors[1].x==711 for s in parties)
    for s in (high,safe): spot(s,711,339)
    run(step,360)
    assert c.child.key=='WH14' and c.child.gap.upper
    assert all(math.isclose(s.actors[1].x,680.2) for s in (host,guest))
    assert all(s.actors[1].x==711 and s.actors[1].y==339 for s in (high,safe))
    assert [events(s,'WH14:push') for s in parties]==[[30.8],[30.8],[],[]]
    assert all(s.actors[1].hp==s.actors[1].maxhp for s in parties)
    for s in parties[:3]: pulse(lua,core,s,w.anchors[1].x)
    step()
    assert c.brokenAt and c.child is None
    assert all(not len(view(core,s).anchors) and view(core,s).open for s in parties)
    run(step,spec.trial.childGap)
    assert c.child.key=='WH15' and not len(c.child.shots)
    run(step,107)
    for s in (host,guest): spot(s,211)
    for s in (high,safe): spot(s,211,339)
    step()
    assert c.child.shots[1].kind=='king'
    assert [events(s,'WH15:hit') for s in parties]==[[41],[41],[],[]]
    run(step,143)
    for s in (host,guest): spot(s,750)
    for s in (high,safe): spot(s,750,339)
    step()
    assert c.child.shots[1].kind=='queen'
    assert [events(s,'WH15:hit') for s in parties]==[[41,41],[41,41],[],[]]
    assert len(room.enemies)==1 and all(core.frame(s).weeklyBoss.gate is None for s in parties)


def inclusive_chant(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,other,safe=parties
    step=lambda:core.stepCoop(room,TICK)
    c=reach_trial(lua,core,host,step,w,spec)
    for state in parties: state.actors[1].inv=45
    a,b=w.anchors[1],w.anchors[2]
    cast=pulse(lua,core,host,a.x)
    assert not a.onCastContact(host,cast,a,1,'#fff','physical')
    pulse(lua,core,host,a.x)
    pulse(lua,core,guest,a.x)
    assert a.hp==1 and b.hp==3
    pulse(lua,core,other,a.x)
    pulse(lua,core,safe,b.x)
    pulse(lua,core,host,w.primary.x)
    assert a.hp==0 and b.hp==3 and w.primary.hp==2250 and c.chant==24
    step()
    assert c.brokenAt and c.chant==24 and len(room.enemies)==1
    run(step,1)
    pulse(lua,core,safe,w.primary.x,reaction=True)
    assert c.chant==24
    for n in range(22):
        if n%3==0: run(step,12)
        state=parties[n%3]
        pulse(lua,core,state,w.primary.x)
        pulse(lua,core,state,w.primary.x)  # A different cast cannot bypass the same actor's interval.
    assert c.chant==2 and w.primary.hp==2250
    run(step,1799-c.t)
    for s in (host,guest):
        s.pending[1]=pulse(lua,core,s,w.primary.x,resolve=False,next=s.t+TICK,remaining=1,interval=0)
    step()
    assert w.cast.key=='WH19' and c.resolutionTick==1800 and c.chant==0
    assert all(events(s,'WH13:chant')==list(range(23,-1,-1)) and not events(s,'WH18') for s in parties)
    run(step,59)
    assert not any(view(core,s).exposure for s in parties)
    step()
    assert all(view(core,s).exposure==720 for s in parties)
    for s in (host,guest,other,safe): spot(s,480)
    pulse(lua,core,other,w.primary.x)
    strike(lua,core,host,w.primary,power=10000)
    assert [s.kills for s in parties]==[1,1,1,0]
    assert [s.progression.killXp for s in parties]==[EXP,EXP,EXP,0]
    assert w.primary.coopHits is None
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None


def retry_and_wipe(lua,core):
    room,parties,_,w,spec=match(core)
    host,*_=parties
    step=lambda:core.stepCoop(room,TICK)
    c=reach_trial(lua,core,host,step,w,spec)
    run(step,1800-c.t)
    assert w.cast.key=='WH18' and len(w.anchors)==0
    run(step,spec.moves.WH18.windows[1][1]-1)
    for s in parties: spot(s,480)
    step()
    assert all(events(s,'WH18:hit')==[125] for s in parties)
    for s in parties: s.actors[1].inv=45
    run(step,spec.moves.WH18.total-w.cast.t+spec.restTicks+1)
    assert w.cast.key=='WH16'
    run(step,spec.moves.WH16.total+spec.restTicks+1)
    assert w.cast.key=='WH17'
    run(step,spec.moves.WH17.total+spec.restTicks+1)
    assert w.cast.key=='WH13' and w.trialId==2 and w.primary.hp==2250
    assert all(core.frame(s).weeklyBoss.primal is None for s in parties)
    run(step,spec.moves.WH13.total+spec.moves.WH18.windows[1][1]-1)
    for s in parties:
        spot(s,480)
        s.actors[1].hp=1
    step()
    assert w.rechallenge and all(s.actors[1].hp==0 for s in parties)
    step()
    assert (w.primary.hp,w.form,w.trialId)==(3900,1,0) and len(room.enemies)==1
    assert not any(s.kills for s in parties)


def via_http(url):
    host,guest=clients=[Client(url) for _ in range(2)]
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],i==0)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in clients:
        assert cross(client,222,ARENA)['weeklyBoss']['maxhp']==1650
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        room=env['coop_room'].worlds[ARENA]
        states=[SESSIONS[c.sid]['state'] for c in clients]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        c=reach_trial(lua,core,states[0],step,w,spec)
        obj=w.anchors[1]
        for state,d in zip(states,(1,-1)):
            spot(state,obj.x-d*65)
            state.actors[1].dir=d
    for client in clients: client.frame(['normal'])
    a,b=advance(host,guest,.13)
    assert all(f['weeklyBoss']['heretic']['anchors'][0]['hp']==1 for f in (a,b))
    assert all(f['coop']['enemies'][0]['maxhp']==3900 and len(f['coop']['enemies'])==1 for f in (a,b))
    for client in clients: cross(client,80,HUB)
    frozen=(room.tick,w.clock,c.t)
    advance(host,guest,.18)
    assert (room.tick,w.clock,c.t)==frozen
    for client in clients:
        assert cross(client,222,ARENA)['weeklyBoss']['heretic']['anchors'][0]['hp']==1
    with LOCK:
        run(step,12)
        pulse(lua,core,states[0],obj.x)
        run(step,2)
        for _ in range(12):
            run(step,12)
            for s in states:
                pulse(lua,core,s,w.primary.x)
        step()
        assert w.cast.key=='WH19'
        run(step,60)
        for s in states: spot(s,480)
        strike(lua,core,states[0],w.primary,power=10000)
    for i,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['progression']['killXp'],saved['mora'])==(EXP,6600)
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    walls_and_mimics(lua,core)
    inclusive_chant(lua,core)
    retry_and_wipe(lua,core)
    with lab() as url:
        via_http(url)
    proof=dict(lua=dict(participants=4, hp=[1650,2250], wallPushPerActor=30.8, harmlessWall=True,
                        upperOpening=True, sharedCores=True, independentIntervals=True, repeatImpactRejected=True,
                        sameTickMultipleActors=True, noCopiedEncounterState=True, mimicHitsPerActor=True,
                        chantHits=24, deadlineInclusive=1800, exposureTicks=720, wipeResetsTrial=True),
               http=dict(participants=2, roomFreezesOnRetreat=True, normalHitsShareCore=True,
                         bothSaved=True, personalXp=EXP, personalMora=6600, onlyOwnQuest=True))
    (ROOT/'evidence/coop-heretic-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
