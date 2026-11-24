"""Compare the two-element Flugel relay and both responses to the wind orb."""

import json
from math import isclose

from runtime import ROOT, runtime
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import share
from test_coop_sumeru_field import attack, hurt
from test_earned_branch_quests import Journey, core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import ENCOUNTERS, Trial


SPEC=ENCOUNTERS['flugel']
CASE=(SPEC.id,SPEC.hub,'snezhnaya-field',SPEC.quest)
SAVE=ROOT/'work/snez-fresh-route-draft/train-save.json'
SIGNATURE='FL03'


def at_tick(trial,tick):
    cast=trial.slot.cast
    return cast and cast.move.id==SIGNATURE and cast.tick==tick


def packet(lua,state,x,**options):
    return lua.table_from(dict(id=1,atk=100,x=x,y=480,dir=1,radial=True,range=2,vertical=2,
        limit=1,mult=1,critRate=0,color='#52e3c1',gain=0,element='physical',startedAt=state.t)|options)


def next_tick(state,cast):
    cast.next,cast.remaining,cast.interval=state.t+1/60,1,.1
    state.pending[len(state.pending)+1]=cast


def lock_relay(room,states,step,side):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    for state in states:
        place(state,boss.x+side*88)
    wait_cast(step,slot,SIGNATURE,1)
    for state in states:
        place(state,boss.x+side*88)
    wait_cast(step,slot,SIGNATURE,60)
    cast=slot.cast
    assert cast.dir==side
    for lane,distance in zip(cast.waves.values(),(2.40,2.70)):
        x1,x2=cast.origin+side*.1*88,cast.origin+side*distance*88
        assert isclose(lane.left,min(x1,x2)) and isclose(lane.right,max(x1,x2))
    return cast


def natural(lua,core):
    room,states,step=share(core,CASE)
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    assert boss.hp==boss.maxhp==6000000 and boss.ward==0
    base=attack(lua,core,states[0],boss,atk=100)
    assert base>0 and boss.form=='idle'
    for state in states:
        place(state,boss.x+88)
    wait_cast(step,slot,'FL02',88)
    dive=slot.cast
    assert boss.form=='airborne' and boss.y==480
    wait_cast(step,slot,'FL02',106)
    assert boss.y==boss.hitBottom==392
    wait_cast(step,slot,'FL02',123)
    assert boss.y<480
    step()
    assert dive.tick==124 and boss.x==dive.center and boss.y==boss.hitBottom==480

    cast=lock_relay(room,states,step,1)
    bolt,wind=list(cast.waves.values())
    for state,x in zip(states,((bolt.left+bolt.right)/2,cast.origin-60,wind.right+55,wind.right+90)):
        place(state,x)
    seq=[state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,132)
    assert [hurt(state,start,boss) for state,start in zip(states,seq)]==[[(25,'electro')],[],[],[]]
    wait_cast(step,slot,SIGNATURE,191)
    assert not cast.relayOrb and boss.mode=='electro' and boss.y==480
    step()
    orb=cast.relayOrb
    assert cast.tick==192 and boss.mode=='anemo' and boss.y==480 and len(room.enemies)==1
    assert isclose(orb.x,cast.origin+1.25*88) and isclose(orb.hitTop,480-.80*88)
    assert isclose(orb.x-orb.hitHalfWidth,cast.origin+.90*88)
    assert isclose(orb.x+orb.hitHalfWidth,cast.origin+1.60*88)
    assert attack(lua,core,states[0],boss,atk=100)==base
    wait_cast(step,slot,SIGNATURE,323)
    assert orb.layers==2 and isclose(orb.x,cast.origin+1.25*88)
    expired=packet(lua,states[0],orb.x)
    next_tick(states[0],expired)
    step()
    assert cast.tick==324 and expired.impactEvent==1 and orb.layers==2
    assert not cast.relayOrb and not cast.broken and cast.absorbedFrom==orb.x
    assert any(draw.motionOnly and draw.color=='#52e3c1' for draw in core.frame(states[0]).draws.values())
    assert [hurt(state,start,boss) for state,start in zip(states,seq)]==[[(25,'electro')],[],[],[]]
    place(states[0],cast.origin-70)
    place(states[1],wind.right-5)
    wait_cast(step,slot,SIGNATURE,348)
    hits=[hurt(state,start,boss) for state,start in zip(states,seq)]
    assert hits==[[(25,'electro')],[(34,'anemo')],[],[]]
    wait_cast(step,slot,SIGNATURE,384)
    assert boss.form=='recover' and boss.y==480
    wait_cast(step,slot,SIGNATURE,527)
    step()
    assert slot.cast is None and slot.delay==0
    return dict(participants=4,airTicks=36,bodyDamageAcrossForms=base,received=hits,
                windOrbClosedAt=324,absorptionCausesNoDamage=True,naturalRecoveryTicks=144,restAfterRecovery=0)


def interrupt(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    cast=lock_relay(room,states,step,-1)
    wait_cast(step,slot,SIGNATURE,191)
    x=cast.origin-1.25*88
    opening=packet(lua,host,x,startedAt=host.t+1/60)
    next_tick(host,opening)
    step()
    orb=cast.relayOrb
    assert cast.tick==192 and orb.layers==1 and opening.impactEvent==1
    core.resolveCast(host,opening)
    for changes in (dict(reaction=True),dict(startedAt=guest.t-1),dict(persistentTarget=boss),
                    dict(y=orb.hitTop-20),dict(mult=0)):
        core.resolveCast(guest,packet(lua,guest,orb.x,**changes))
    assert orb.layers==1
    baseline=attack(lua,core,host,boss,atk=100)
    hp,kills,mora=boss.hp,host.kills,host.mora
    wait_cast(step,slot,SIGNATURE,323)
    core.resolveCast(guest,packet(lua,guest,orb.x,element='hydro'))
    assert orb.layers==0 and boss.hp==hp
    step()
    assert cast.broken==324 and boss.form=='recover' and not cast.relayOrb and not cast.absorbedFrom
    assert attack(lua,core,host,boss,atk=100)==baseline and host.kills==kills and host.mora==mora
    for state in states:
        place(state,cast.origin-90)
    seq=[state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,467)
    assert boss.form=='recover' and not any(hurt(state,start,boss) for state,start in zip(states,seq))
    step()
    assert slot.cast is None and slot.delay==0 and boss.mode=='electro'
    return dict(acceptedContactsAt=[192,323],rejectedDuplicateEarlierAndIndirect=True,
                cancelledWind=True,interruptRecoveryTicks=144,noBacklashOrMultiplier=True)


def edge_rehearsal(core):
    room,states,step=share(core,CASE)
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    wait_cast(step,slot,'FL02',311)
    step()
    boss.x=1517
    for state in states:
        place(state,1574)
    wait_cast(step,slot,SIGNATURE,60)
    cast=slot.cast
    origin,start=cast.origin,cast.startTime
    assert boss.form=='reposition' and cast.reposition<origin and not cast.waves
    for _ in range(75):
        step()
        if cast.tick==0:
            break
    assert cast.tick==0 and cast.origin<origin and cast.startTime>start
    wait_cast(step,slot,SIGNATURE,60)
    assert cast.waves and not cast.reposition
    edge=cast.waves[2].right+10+.1*88
    assert edge<=states[0].worldwidth-20
    return dict(unsafeOrigin=origin,restartedOrigin=cast.origin,groundEscapeX=edge)


def earned(short):
    route=Journey(SAVE,engine=(prior_lua,prior_core))
    route.warp(SPEC.hub)
    assert route.state.progression.level==145
    (ROOT/'work/earned-flugel-ready.json').write_text(
        json.dumps(route.snapshot(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    prior=Trial(SPEC,False,file=SAVE,engine=(prior_lua,prior_core)).finish(normal=True,ticks=12000)
    alternate=Trial(SPEC,False,file=SAVE,engine=short).finish(normal=True,ticks=12000)
    breaker=Trial(SPEC,False,file=SAVE,engine=short)
    breaker.until(lambda: at_tick(breaker,192))
    orb=breaker.slot.cast.relayOrb
    breaker.until(lambda: breaker.slot.cast.broken,normal=True,aim=orb,ticks=132)
    interruption=breaker.slot.cast.broken
    interrupted=breaker.finish(normal=True,ticks=12000)
    retreat=Trial(SPEC,False,file=SAVE,engine=short)
    retreat.trip.state.actors[2].hp=0
    retreat.until(lambda: at_tick(retreat,192))
    cast=retreat.slot.cast
    wave=cast.waves[2]
    dest=wave.right+40 if cast.dir>0 else wave.left-40
    retreat.trip.approach(dest,480,'風の予告範囲外')
    hp=retreat.trip.actor.hp
    assert cast.tick<348
    retreat.trip.tick(384-cast.tick)
    assert retreat.boss.form=='recover' and retreat.trip.actor.hp==hp and not cast.broken
    seq=retreat.trip.state.seq
    retreat.until(lambda: any(e.seq>seq and e.kind=='hit' and e.actor==1 and e.target==retreat.boss.id
                               for e in retreat.trip.state.events.values()),normal=True,ticks=144)
    assert cast.tick<528
    for row in (alternate,interrupted):
        for key in ('commission','killXpAndMora','maxHp','partyAttack'):
            assert row[key]==prior[key]
    return dict(level=145,previous=prior,short=alternate,interrupted=interrupted,
                interruptedAt=interruption,groundEvasionAndCounterAt=cast.tick)


def main():
    short=runtime(draft_field_moves=True)
    result=natural(*short)|interrupt(*short)|edge_rehearsal(short[1])|earned(short)
    (ROOT/'evidence/draft-flugel-moves-lua.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: Flugel relay, wind orb deadline, edge reposition, both routes and earned commission verified.')


if __name__=='__main__':
    main()
