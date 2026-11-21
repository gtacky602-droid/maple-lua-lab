"""Check co-op floor geometry, actor-owned Erosion and shared Primal Fire trials."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB = 'boss-29091101', 'natlan-hub'
ARENA, QUEST = 'primal-fire-sundered-forge', 'primal-fire-weekly-commission'
LEVEL = LEVELS[103]
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
        spot(s,(438,475,730,855)[i])
        parties.append(s)
    parties[0].t,parties[1].t,parties[2].t=430,17,700
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    return room,parties,members,*core.currentWeeklyBoss(parties[0])


def events(s,key):
    return [e.value for e in s.events.values() if e.kind=='primal:'+key]


def move(w,spec,step,key):
    order=spec.first if w.form==1 else spec.second
    w.index=list(order.values()).index(key)+1
    w.cast,w.rest=None,0
    step()
    assert w.cast.key==key
    return w.cast


def view(core,s):
    return core.frame(s).weeklyBoss.primal


def hit(lua,core,s,x,emit=True,**opts):
    cast=lua.table_from(dict(id=s.active,x=x,y=480,radial=True,range=90,limit=1,dir=1,atk=15,
                             mult=1,gain=0,element='physical',color='#eff9d8',playerInputAt=s.t)|opts)
    if emit:
        core.resolveCast(s,cast)
    return cast


def erosion(core):
    room,parties,members,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    for s,x in zip(parties,(463,470,770,855)):
        spot(s,x)
    w.form=2
    c=move(w,spec,step,'WG07')
    run(step,c.move.windows[1][1])
    assert [s.actors[1].maxhp-s.actors[1].hp for s in parties]==[31,31,0,0]
    assert [view(core,s).actors[1].count for s in parties]==[1,1,0,0]
    assert [events(s,'WG07:hit') for s in parties]==[[31],[31],[],[]]
    marks=[w.actors[s.actors[1]].marks[1] for s in parties[:2]]
    assert marks[0].id!=marks[1].id and marks[0].due==marks[1].due==w.clock+120
    core.healActor(host,host.actors[1],host.actors[1].maxhp)
    guest.actors[2].hp=guest.actors[2].maxhp
    core.action(guest,'swap')
    assert guest.active==2 and view(core,guest).actors[1].count==1 and view(core,guest).actors[2].count==0
    core.detachCoop(members[0])
    assert w.actors[host.actors[1]] is None
    core.attachCoop(room,host,members[0])
    assert view(core,host).actors[1].count==0
    w.cast,w.rest=None,3000
    for s,x in zip(parties,(760,800,840,870)):
        spot(s,x)
    run(step,119)
    assert not events(guest,'WG18:resolve')
    before=guest.actors[1].hp
    step()
    assert guest.actors[1].hp<before and events(guest,'WG18:resolve')==[marks[1].id]
    assert not events(host,'WG18:resolve') and view(core,guest).actors[1].count==0


def gate(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    c=move(w,spec,step,'WG05')
    run(step,spec.gate.opens)
    o=w.objects[1]
    assert o.hp==12 and w.primary.hp==2900
    assert len(core.coopFrame(host).enemies)==1
    first=hit(lua,core,host,o.x)
    core.resolveCast(host,first)
    hit(lua,core,host,o.x)
    hit(lua,core,guest,o.x)
    assert o.hp==10 and events(host,'WG05:gate')==events(guest,'WG05:gate')==[1]
    run(step,spec.gate.gap)
    core.resolveCast(host,first)
    assert o.hp==10
    hit(lua,core,host,o.x,element='pyro')
    hit(lua,core,guest,o.x,element='hydro')
    hit(lua,core,other,o.x,element='electro')
    hit(lua,core,far,o.x,element='dendro')
    assert o.hp==2
    run(step,spec.gate.gap)
    c.t=c.move.accept[2]-2
    for s in (host,guest):
        s.pending[1]=hit(lua,core,s,o.x,emit=False,next=s.t+TICK,remaining=1,interval=1)
    step()
    assert w.cast.key=='WG17' and o.hp==0 and not len(w.objects)
    assert w.primary.hp==2900 and all(len(events(s,'WG17'))==1 for s in parties)
    run(step,w.cast.move.exposure[1])
    assert all(view(core,s).exposure==480 for s in parties)


def first_cut(w,spec,step):
    w.primary.hp=spec.hp*.20
    run(step,spec.noticeTicks+1)
    assert w.cast.key=='WG08'
    run(step,spec.moves.WG08.total+spec.restTicks+1)
    assert w.cast.key=='WG09'
    run(step,spec.arena.cutTick)
    assert w.cuts==1 and w.left==128


def arena_and_pillars(lua,core):
    room,parties,members,w,spec=match(core)
    host,guest,other,far=parties
    step=lambda:core.stepCoop(room,TICK)
    first_cut(w,spec,step)
    assert all((s.platforms[1].x,s.platforms[1].w,s.platforms[2].x)==(128,792,198) for s in parties)
    run(step,spec.moves.WG09.total-spec.arena.cutTick)
    for s,x in zip(parties,(133,135,620,800)):
        spot(s,x)
    members[0].input=members[1].input=lua.table(left=True)
    before=[s.actors[1].hp for s in parties]
    for _ in range(32):
        step()
        if events(host,'WG18:fall') and events(guest,'WG18:fall'):
            break
    assert [len(events(s,'WG18:fall')) for s in parties]==[1,1,0,0]
    assert all(s.actors[1].x>=128 and s.actors[1].y==480 for s in parties[:2])
    assert [hp-s.actors[1].hp for s,hp in zip(parties,before)]==[
        int(host.actors[1].maxhp*.25),int(guest.actors[1].maxhp*.25),0,0]
    members[0].input=members[1].input=None
    for i,s in enumerate(parties):
        spot(s,420+100*i)
    for _ in range(6600):
        for s in parties:
            s.actors[1].inv=2
        step()
        if w.cuts==3:
            break
    assert all(events(s,'WG09:commit')==[128,216,304] for s in parties)
    assert all((s.platforms[1].x,s.platforms[1].w)==(304,616) for s in parties)

    c=move(w,spec,step,'WG14')
    run(step,spec.gate.opens)
    pillars=list(w.objects.values())
    assert len(pillars)==3 and all(o.hp==6 and 304<o.x<920 for o in pillars)
    hit(lua,core,host,600,range=460,limit=5)
    assert [o.hp for o in pillars]==[5,5,5]
    for s,o in zip(parties[1:],pillars):
        hit(lua,core,s,o.x,element='pyro')
    assert [o.hp for o in pillars]==[3,3,3]
    run(step,spec.gate.gap)
    for s,o in zip(parties[1:],pillars):
        hit(lua,core,s,o.x,element='hydro')
        hit(lua,core,host,o.x)
    assert all(o.hp==0 for o in pillars)
    step()
    assert w.cast.key=='WG17' and not len(w.objects) and not len(c.shots)
    run(step,w.cast.move.exposure[1])
    for i,s in enumerate(parties):
        spot(s,535+45*i)
    strike(lua,core,host,w.primary,32)
    strike(lua,core,guest,w.primary)
    assert [s.kills for s in parties]==[1,1,1,1]
    assert [(s.progression.killXp,s.mora) for s in parties]==[(EXP,3400)]*4
    assert host.story.quests[QUEST].count==1 and all(s.story.quests[QUEST] is None for s in parties[1:])


def catastrophe(lua,core):
    room,parties,_,w,spec=match(core)
    host,guest,*_=parties
    step=lambda:core.stepCoop(room,TICK)
    w.form=2
    c=move(w,spec,step,'WG16')
    run(step,spec.gate.opens)
    o=w.objects[1];o.hp=2
    c.t=c.move.accept[2]-1
    for s in (host,guest):
        s.pending[1]=hit(lua,core,s,o.x,emit=False,next=s.t+TICK,remaining=1,interval=1)
    step()
    assert w.cast.key=='WG15' and o.hp==2 and not len(w.objects)
    for s in parties:
        spot(s,530)
    run(step,spec.moves.WG15.windows[1][1])
    assert all(events(s,'WG15:hit')==[78] for s in parties)
    assert all(view(core,s).actors[1].count==1 for s in parties)
    # A later failure that downs the entire room restarts the floor and clears marks.
    c=move(w,spec,step,'WG16')
    run(step,c.move.total+spec.moves.WG15.windows[1][1]-1)
    for s in parties:
        s.actors[1].hp=1
        s.actors[1].inv=0
    step()
    assert w.rechallenge and all(s.actors[1].hp==0 for s in parties)
    step()
    assert (w.form,w.cuts,w.left,w.primary.hp)==(1,0,40,2900)
    assert all(s.returns==1 for s in parties)


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
        assert cross(client,351,ARENA)['weeklyBoss']['maxhp']==2900
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        states=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[ARENA]
        w,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        first_cut(w,spec,step)
        c=move(w,spec,step,'WG16')
        run(step,spec.gate.opens)
        obj=w.objects[1]
        for state,dir in zip(states,(1,-1)):
            spot(state,obj.x-dir*69)
            state.actors[1].dir=dir
    host.frame(['normal'])
    guest.frame(['normal'])
    a,b=advance(host,guest,.13)
    assert a['weeklyBoss']['primal']['objects'][0]['units']==b['weeklyBoss']['primal']['objects'][0]['units']==10
    assert all(f['platforms'][0]['x']==128 for f in (a,b))
    for client in clients:
        cross(client,863,HUB)
    frozen=w.clock,room.tick,c.t
    advance(host,guest,.2)
    assert (w.clock,room.tick,c.t)==frozen
    for client in clients:
        f=cross(client,351,ARENA)
        assert f['platforms'][0]['x']==128 and f['weeklyBoss']['primal']['objects'][0]['units']==10
    with LOCK:
        run(step,spec.gate.gap)
        for _ in range(3):
            hit(lua,core,states[0],obj.x,element='pyro')
            hit(lua,core,states[1],obj.x,element='hydro')
            run(step,spec.gate.gap)
            if obj.hp==0:
                break
        assert w.cast.key=='WG17'
        run(step,w.cast.move.exposure[1]-w.cast.t)
        spot(states[0],455);spot(states[1],580)
        strike(lua,core,states[0],w.primary,32)
        strike(lua,core,states[1],w.primary)
    for i,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==3400
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    erosion(core)
    gate(lua,core)
    arena_and_pillars(lua,core)
    catastrophe(lua,core)
    with lab() as url:
        via_http(url)
    result=dict(lua=dict(participants=4,oneErosionQueuePerActor=True,persistsOnSwapAndNotExit=True,threeSharedCuts=[128,216,304],
                         physicalFallsOnlyWhenOffLedge=True,gatesSharedAndCooldownPerActor=True,sameRootRejected=True,
                         closingBoundarySuccessBeforeAndFailureAtDeadline=True,sharedPillars=True,exposure=480,
                         catastropheOncePerActor=True,wipeRestoresFloorAndHp=True),
                http=dict(participants=2,normalInputsShareGate=True,cutGeometryShared=True,retreatFreezesTrial=True,
                          returnedToSameCutAndGate=True,sharedHp=2900,personalXp=EXP,personalMora=3400,ownQuestAndSaves=True))
    (ROOT/'evidence/coop-primal-fire-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
