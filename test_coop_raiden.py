"""Verify shared Raiden armor, special objects, protection and personal clears."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS = 'boss-29060201'
HUB, ARENA, QUEST = 'inazuma-town', 'raiden-thunder-echo-arena', 'raiden-weekly-commission'
LEVEL = LEVELS[47]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core,state,accepted=False):
    core.grantExp(state,LEVEL['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,HUB)
    if accepted:
        core.action(state,'story_accept:'+QUEST)
        assert state.story.quests[QUEST].status=='active'
    state.actors[2].hp=0


def match(core):
    states=[]
    for i in range(4):
        state=core.new(12)
        core.action(state,'story_start')
        prepare(core,state,i==0)
        core.enterStoryNode(state,ARENA)
        spot(state,150+220*i)
        states.append(state)
    states[0].t,states[1].t,states[2].t=300,12,800
    room=core.newCoop(states[0])
    for state in states:
        core.attachCoop(room,state)
    return room,states,*core.currentWeeklyBoss(states[0])


def events(s,key):
    return [e.value for e in s.events.values() if e.kind=='raiden:'+key]


def casts(lua,core,party,x,**options):
    cast=lua.table_from(dict(id=party.active,x=x,y=480,range=100,radial=True,limit=4,
                             atk=3,mult=1,gain=0,color='#e0c8ff',dir=1,element='physical',
                             playerInputAt=party.t,critRate=0)|options)
    core.resolveCast(party,cast)
    return cast


def awaken(step,slot,spec):
    slot.omen=spec.omen.max
    step()
    assert slot.stage=='awaken'
    run(step,spec.moves.WR09.total)
    assert slot.stage=='armored' and slot.armor==100 and slot.primary.hp==1500


def flower(step,slot,spec):
    slot.cast=None
    slot.rest,slot.sinceFlower=0,spec.armor.firstFlowerAfter
    step()
    cast=slot.cast
    assert cast.id=='WR14' and cast.location==480
    return cast


def ordinary_objects(lua,core):
    room,states,slot,spec=match(core)
    host,guest=states[:2]
    step=lambda:core.stepCoop(room,TICK)
    slot.normalIndex[1],slot.rest=3,0
    step()
    assert slot.cast.id=='WR05'
    run(step,spec.moves.WR05.locks[1])
    eye=slot.objects[1]
    for p in (host,guest):
        spot(p,eye.x)
        casts(lua,core,p,eye.x)
    assert eye.charges==2
    casts(lua,core,host,eye.x)
    assert eye.charges==2
    run(step,spec.objects.cooldown)
    for p in (host,guest):
        casts(lua,core,p,eye.x)
    assert not len(slot.objects) and slot.cast.downUntil>slot.cast.t

    slot.cast,slot.weapon,slot.normalIndex[2],slot.rest=None,2,3,0
    step()
    assert slot.cast.id=='WR06'
    run(step,spec.objects.shadeReady)
    spot(host,816);spot(guest,144)
    assert {t.x for t in core.frame(host).weeklyBoss.targets.values() if t.selected}=={816}
    assert {t.x for t in core.frame(guest).weeklyBoss.targets.values() if t.selected}=={144}
    casts(lua,core,host,480,range=500)
    assert events(host,'WR06:choice')==[4] and sum(e.hp>0 for e in slot.objects.values())==3
    casts(lua,core,guest,480,range=500)
    assert events(guest,'WR06:choice')==[1] and len(slot.objects)==0 and slot.cast.downUntil


def armor_and_protection(lua,core):
    room,states,slot,spec=match(core)
    host,guest,watcher,other=states
    step=lambda:core.stepCoop(room,TICK)
    awaken(step,slot,spec)
    x=slot.primary.x
    for state in states:
        spot(state,x)
    casts(lua,core,watcher,x,element='pyro',playerInputAt=watcher.t-.1)
    assert slot.armor==100
    first=casts(lua,core,host,x,element='pyro')
    core.resolveCast(host,first)
    casts(lua,core,host,x,element='pyro')
    casts(lua,core,guest,x,element='cryo')
    casts(lua,core,other,x,element='pyro')
    assert slot.armor==96 and [events(s,'WR18:hit') for s in states]==[[2],[2],[],[]]
    trial=flower(step,slot,spec)
    run(step,59)
    early=guest.t
    run(step,2)
    assert core.frame(host).weeklyBoss.flower.ready
    casts(lua,core,guest,480,element='electro',playerInputAt=early)
    casts(lua,core,watcher,480,element='electro',playerInputAt=None)
    casts(lua,core,watcher,480,element='electro',reaction=True)
    assert trial.charges==0
    old=casts(lua,core,host,480)
    casts(lua,core,guest,480)
    casts(lua,core,host,480)
    assert trial.charges==2
    run(step,spec.objects.cooldown)
    core.resolveCast(host,old)
    assert trial.charges==2
    for state in (host,guest,host):
        casts(lua,core,state,480)
        run(step,spec.objects.cooldown)
    assert trial.charges==5
    assert [events(s,'WR14:charge') for s in states]==[[1,3,5],[2,4],[],[]]
    armor,elapsed=slot.armor,slot.armorTime
    run(step,spec.moves.WR14.total-trial.t)
    assert slot.cast.id=='WR15' and slot.cast.charges==5
    for state,x in zip(states,(445,520,235,820)):
        spot(state,x)
    before=[s.actors[1].hp for s in states]
    run(step,65)
    assert [n-s.actors[1].hp for n,s in zip(before,states)]==[0,0,62,62]
    assert [events(s,'WR15:protected') for s in states]==[[0],[0],[],[]]
    assert [events(s,'WR15:hit') for s in states]==[[],[],[1],[1]]
    assert all(events(s,'WR15:drain')==[30] for s in states)
    assert slot.armor==armor-30 and slot.armorTime==elapsed
    run(step,spec.moves.WR15.total-slot.cast.t)
    slot.armor=0
    step()
    assert slot.stage=='collapse' and slot.primary.invulnerable
    run(step,spec.moves.WR16.recovery)
    assert all(core.frame(s).weeklyBoss.down==480 for s in states)
    spot(host,480);spot(guest,500)
    strike(lua,core,host,slot.primary,30)
    strike(lua,core,guest,slot.primary)
    assert [s.kills for s in states]==[1,1,0,0] and slot.phase=='respawn'
    assert [(s.progression.killXp,s.mora) for s in states[:2]]==[(EXP,980)]*2
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None


def wipe(core):
    room,states,slot,spec=match(core)
    step=lambda:core.stepCoop(room,TICK)
    awaken(step,slot,spec)
    flower(step,slot,spec)
    run(step,spec.moves.WR14.total)
    for state in states:
        spot(state,480)
        state.actors[1].hp=10
    run(step,60)
    assert slot.rechallenge and not slot.cast and not len(slot.objects)
    assert all(s.actors[1].hp==0 and s.kills==0 for s in states)
    step()
    assert not slot.rechallenge and slot.stage=='normal' and slot.omen==slot.armor==0
    assert slot.primary.hp==1500 and all(s.returns==1 for s in states)


def via_http(url):
    clients=[Client(url),Client(url)]
    host,guest=clients
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],i==0)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in clients:
        assert cross(client,1305,ARENA)['weeklyBoss']['maxhp']==1500
    with LOCK:
        env=SESSIONS[host.sid]
        core,lua=env['core'],env['lua']
        states=[SESSIONS[client.sid]['state'] for client in clients]
        room=env['coop_room'].worlds[ARENA]
        slot,spec=core.currentWeeklyBoss(states[0])
        step=lambda:core.stepCoop(room,TICK)
        awaken(step,slot,spec)
        f=flower(step,slot,spec)
        run(step,60)
        spot(states[0],425);spot(states[1],535)
        states[0].actors[1].dir=1
        states[1].actors[1].dir=-1
    host.frame(['normal'])
    guest.frame(['normal'])
    a,b=advance(host,guest,.15)
    assert a['weeklyBoss']['flower']['value']==b['weeklyBoss']['flower']['value']==2
    assert len(a['coop']['enemies'])==len(b['coop']['enemies'])==1
    for client in clients:
        assert cross(client,126,HUB)['coop']['code']==code
    now=room.tick,f.t
    advance(host,guest,.15)
    assert (room.tick,f.t)==now
    for client in clients:
        assert cross(client,1305,ARENA)['weeklyBoss']['flower']['value']==2
    with LOCK:
        run(step,spec.objects.cooldown)
        casts(lua,core,states[0],480,element='electro')
        assert f.charges==5
        run(step,spec.moves.WR14.total-f.t+spec.moves.WR15.total)
        slot.armor=0
        run(step,spec.moves.WR16.recovery+1)
        spot(states[0],slot.primary.x-40);spot(states[1],slot.primary.x+40)
        strike(lua,core,states[0],slot.primary,30)
        strike(lua,core,states[1],slot.primary)
    for index,client in enumerate(clients):
        saved=client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp']==0 and saved['weeklyBosses'][BOSS]['waitTicks']>0
        assert saved['progression']['killXp']==EXP and saved['mora']==980
        assert saved['endgame']['bosses'][BOSS]['clears']==1
        assert (saved['story']['quests'].get(QUEST) or {}).get('count')==(1 if index==0 else None)


if __name__=='__main__':
    lua,core=runtime()
    ordinary_objects(lua,core)
    armor_and_protection(lua,core)
    wipe(core)
    with lab() as url:
        via_http(url)
    result=dict(lua=dict(participants=4,independentActorIDs=True,eyeShared=True,shadeSelectsFromOwnPosition=True,
                         armorSharedCap=4,oldAndNonManualHitsRejected=True,flowerCountsPerActor=True,
                         protected=2,hitOutside=2,drainAppliedOnce=30,downTicks=480,wipeResets=True),
                http=dict(participants=2,normalAttacksShared=True,unoccupiedArenaFreezes=True,
                          flowerProgressPreserved=True,personalClearXp=EXP,personalMora=980,
                          sameBossHp=1500,acceptedQuestAndSavesVerified=True))
    (ROOT/'evidence/coop-raiden-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
