"""Exercise Apep's shared defense and per-character co-op collision."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB = 'boss-29080101', 'sumeru-hub'
ARENA, QUEST = 'apep-oasis-heart-arena', 'apep-weekly-commission'
LEVEL = LEVELS[67]
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
        spot(s,(105,316,652,870)[i])
        parties.append(s)
    parties[0].t,parties[1].t,parties[2].t=470,15,720
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def events(s,key):
    return [e.value for e in s.events.values() if e.kind=='apep:'+key]


def view(core,s):
    return core.frame(s).weeklyBoss.apep


def defense(lua,core,s,w,spec,step):
    strike(lua,core,s,w.primary)
    assert w.stage=='expose' and w.primary.hp==1020
    run(step,spec.moves.WP05.total)
    assert w.stage=='defense' and w.defense.progress==25
    return w.defense


def hit(lua,core,s,x,**change):
    cast=lua.table_from(dict(id=s.active,x=x,y=480,radial=True,range=56,dir=1,atk=10000,
                             mult=1,limit=1,gain=0,element='physical',color='#effdbb',playerInputAt=s.t)|change)
    core.resolveCast(s,cast)
    return cast


def queue(lua,d,step,*roles):
    d.queue=lua.table_from([{'roles':roles,'due':d.t+1,'index':1}],recursive=True)
    d.waves=lua.table_from([True,True,True])
    step()
    return list(d.units.values())


def settlement(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,observer,far=parties
    step=lambda:core.stepCoop(room,TICK)
    d=defense(lua,core,host,w,spec,step)
    run(step,60)
    assert len(d.units)==4 and all(e.maxhp==30 for e in d.units.values())
    assert len(core.coopFrame(host).enemies)==1
    left,right,other,striker=list(d.units.values())
    d.progress,d.t=96,119
    left.x,right.x,other.x,striker.x=112,830,250,447
    striker.cast=lua.table(t=59,key='WP07',move=spec.moves.WP07,done=lua.table())
    hit(lua,core,host,112)
    hit(lua,core,guest,830)
    hit(lua,core,observer,112)
    assert d.delta==6 and d.progress==96
    step()
    assert d.progress==99 and d.kills==2
    assert [events(s,'WP06:defeated') for s in parties]==[[left.id],[right.id],[],[]]
    assert all(events(s,'WP06:progress')[-1]==3 for s in parties)
    assert all(view(core,s).progress==99 and s.kills==0 for s in parties)

    d.progress,d.delta=3,-4
    step()
    assert w.stage=='failed' and w.defense is None
    core.action(guest,'encounter_interact')
    core.action(host,'encounter_interact')
    assert w.stage=='defense' and w.defense.progress==25 and len(w.defense.queue)==1


def interception(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    d=defense(lua,core,host,w,spec,step)
    seed,=queue(lua,d,step,'ranged')
    seed.x=360
    seed.cast=lua.table(t=71,key='WP07_RANGED',move=spec.moves.WP07_RANGED,done=lua.table(),target=480,targetY=455)
    for s,x in zip(parties,(420,420,740,850)):
        spot(s,x)
    before=[s.actors[1].hp for s in parties]
    run(step,30)
    assert [hp-s.actors[1].hp for s,hp in zip(parties,before)]==[spec.moves.WP07_RANGED.damage,0,0,0]
    assert not len(d.spores) and not events(host,'WP06:heart')
    spot(host,110);spot(guest,210)
    seed.cast=lua.table(t=71,key='WP07_RANGED',move=spec.moves.WP07_RANGED,done=lua.table(),target=480,targetY=455)
    before=d.progress
    run(step,30)
    assert events(host,'WP06:heart')==[seed.id] and d.progress==before+1-spec.defense.heartHit


def walls(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    d=defense(lua,core,host,w,spec,step)
    barrier,=queue(lua,d,step,'barrier')
    barrier.x=258
    early=guest.t
    run(step,120)
    left,right=list(d.walls.values())
    assert left.hp==right.hp==2
    for s,x in zip(parties,(220,310,650,734)):
        spot(s,x)
    for i,m in enumerate(members):
        m.input=lua.table(right=i%2==0,left=i%2!=0)
    run(step,17)
    assert [s.actors[1].x for s in parties]==[241,289,671,719]
    members[1].input=lua.table(left=True,jump=True)
    core.action(guest,'jump')
    run(step,38)
    assert guest.actors[1].x<241 and host.actors[1].x==241
    for m in members:
        m.input=None
    core.action(host,'encounter_target:wall1')
    core.action(guest,'encounter_target:wall2')
    assert [v.index for v in view(core,host).walls.values() if v.selected]==[1]
    assert [v.index for v in view(core,guest).walls.values() if v.selected]==[2]
    assert left.acceptsAutoTarget(host,host.actors[2]) and not left.acceptsAutoTarget(guest,guest.actors[2])
    hit(lua,core,guest,left.x,playerInputAt=early)
    hit(lua,core,guest,left.x,id=2,playerInputAt=None,growthAI=True,startedAt=guest.t)
    assert left.hp==2
    first=hit(lua,core,host,left.x,id=2,playerInputAt=None,growthAI=True,startedAt=host.t)
    core.resolveCast(host,first)
    assert left.hp==1 and right.hp==2
    hit(lua,core,guest,left.x)
    assert left.hp==0 and d.wallOrders[host] is None and d.wallOrders[guest].wall.id==right.id
    hit(lua,core,host,barrier.x,range=15)
    assert right.hp==0 and d.wallOrders[guest] is None


def shelter(w,spec,step):
    w.defense.delta=spec.defense.max-w.defense.progress
    step()
    assert w.stage=='rebirth' and w.defense is None
    run(step,spec.moves.WP13.total)
    assert w.stage=='prime' and w.primary.hp==1020
    w.normal,w.rest=spec.dome.normalBetween,0
    step()
    assert w.stage=='shelter' and w.wave.t==0


def domes(lua,core,wipe=False):
    room,parties,_,w,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    defense(lua,core,parties[0],w,spec,step)
    shelter(w,spec,step)
    if wipe:
        for s in parties:
            spot(s,330)
            s.actors[1].hp=1
        run(step,240)
        assert w.rechallenge and w.wave is None and all(s.actors[1].hp==0 for s in parties)
        step()
        assert w.stage=='dark' and w.primary.hp==1580 and all(s.returns==1 for s in parties)
        return
    for s,(x,y) in zip(parties,((132,480),(828,480),(236,480),(132,355))):
        spot(s,x,y)
    run(step,60)
    for s,is_safe in zip(parties,(True,True,False,False)):
        assert view(core,s).protected==is_safe and len(view(core,s).domes)==3
    before=[s.actors[1].hp for s in parties]
    run(step,spec.dome.expires-60)
    assert w.stage=='weak' and w.wave is None
    assert [events(s,'WP17:protected') for s in parties]==[[1,2,3,4],[1,2,3,4],[],[]]
    assert [events(s,'WP17:hit') for s in parties]==[[],[],[1,2,3,4],[1,2,3,4]]
    assert [s.actors[1].hp==hp for s,hp in zip(parties,before)]==[True,True,False,False]
    run(step,spec.dome.exposureStart)
    assert all(view(core,s).exposure==480 for s in parties)
    host,guest=parties[:2]
    spot(host,435);spot(guest,530)
    strike(lua,core,host,w.primary,32)
    strike(lua,core,guest,w.primary)
    assert [s.kills for s in parties]==[1,1,0,0]
    assert [(s.progression.killXp,s.mora) for s in parties[:2]]==[(EXP,1500)]*2


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
        assert cross(client,780,ARENA)['weeklyBoss']['maxhp']==1580
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        states=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[ARENA]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        d=defense(lua,core,states[0],w,spec,step)
        run(step,60)
        left,right=list(d.units.values())[:2]
        for state,e,dir in zip(states,(left,right),(1,-1)):
            spot(state,e.x-dir*34)
            state.actors[1].atk=1000
            state.actors[1].dir=dir
    host.frame(['normal'])
    guest.frame(['normal'])
    a,b=advance(host,guest,.22)
    count=a['weeklyBoss']['apep']['dead']
    assert 2<=count<=4 and b['weeklyBoss']['apep']['dead']==count
    assert a['weeklyBoss']['apep']['progress']==b['weeklyBoss']['apep']['progress']==26+3*count
    assert all(any(e['kind']=='apep:WP06:defeated' for e in f['events']) for f in (a,b))
    for client in clients:
        cross(client,58,HUB)
    frozen=d.t,d.progress,room.tick
    advance(host,guest,.16)
    assert (d.t,d.progress,room.tick)==frozen
    for client in clients:
        assert cross(client,780,ARENA)['weeklyBoss']['apep']['dead']==count
    with LOCK:
        shelter(w,spec,step)
        spot(states[0],132);spot(states[1],400)
        run(step,60)
    assert host.frame()['weeklyBoss']['apep']['protected']
    assert not guest.frame()['weeklyBoss']['apep']['protected']
    with LOCK:
        run(step,spec.dome.expires-w.wave.t+spec.dome.exposureStart)
        spot(states[0],435);spot(states[1],525)
        strike(lua,core,states[0],w.primary,32)
        strike(lua,core,states[1],w.primary)
    for i,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==1500
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    settlement(lua,core)
    interception(lua,core)
    walls(lua,core)
    domes(lua,core)
    domes(lua,core,wipe=True)
    with lab() as url:
        via_http(url)
    result=dict(lua=dict(participants=4,oneSpawnScheduleAndHp=True,oneNetProgressPerTick=True,sharedRetry=True,
                         oneSporeContact=True,interceptionProtectsHeart=True,wallCollisionPerActor=True,
                         independentWallOrders=True,oldAndRepeatedWallHitsRejected=True,wallClearsWithSource=True,
                         innerSafeAndHighPlatformUnsafe=True,oneHitPerActorPerPulse=True,exposure=480,wipeReset=True),
                http=dict(participants=2,normalInputsShareDefense=True,frozenAndResumedDefense=True,
                          separateProtection=True,sharedHp=1580,personalXp=EXP,personalMora=1500,ownQuestAndSaves=True))
    (ROOT/'evidence/coop-apep-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
