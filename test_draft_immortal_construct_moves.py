"""Verify the fixed bloom sequence, counter window, and both earned fight routes."""

import json
from math import isclose

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import party, share
from test_coop_sumeru_field import attack, hurt
from test_earned_branch_quests import Journey, core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import ENCOUNTERS, Trial


SPEC=ENCOUNTERS['immortalConstruct']
CASE=(SPEC.id,SPEC.hub,'snezhnaya-field',SPEC.quest)
SAVE=ROOT/'work/snez-fresh-route-draft/train-save.json'
SIGNATURE='IC03'


def packet(lua,state,boss,**changes):
    return lua.table_from(dict(id=1,atk=100,x=boss.x,y=480,dir=1,radial=True,range=24,limit=1,
        mult=1,critRate=0,color='#ffce71',gain=0,element='physical',startedAt=state.t,targetId=boss.id)|changes)


def next_tick(state,cast):
    cast.next,cast.remaining,cast.interval=state.t+1/60,1,.1
    state.pending[len(state.pending)+1]=cast


def face(states,boss,side):
    for state in states:
        place(state,boss.x+side*88)


def lock_bloom(room,states,step,side):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    face(states,boss,side)
    wait_cast(step,slot,SIGNATURE,1)
    face(states,boss,side)
    wait_cast(step,slot,SIGNATURE,48)
    cast=slot.cast
    assert cast.dir==side
    for wave,(far,height,damage) in zip(cast.waves.values(),((2.20,.68,22),(2.20,.68,22),(2.60,.72,32))):
        x1,x2=cast.origin+side*.10*88,cast.origin+side*far*88
        assert isclose(wave.left,min(x1,x2)) and isclose(wave.right,max(x1,x2))
        assert wave.height==height and wave.damage==damage
    return cast


def natural(lua,core):
    room,states,step=share(core,CASE)
    host,guest,observer,safe=states
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    guest.t=19.5
    assert boss.hp==boss.maxhp==6500000
    base=attack(lua,core,host,boss,atk=100)
    face(states,boss,1)
    wait_cast(step,slot,'IC02',1)
    face(states,boss,1)
    wait_cast(step,slot,'IC02',48)
    neutral=slot.cast
    assert list(neutral.centers.values())==[neutral.origin+u*88 for u in (.85,2.15)]
    cast=lock_bloom(room,states,step,1)
    before=boss.hp
    wait_cast(step,slot,SIGNATURE,60)
    assert boss.form=='life' and boss.hp==before and boss.lifeUnits==0 and boss.y==480
    frame=core.frame(host).fieldBoss
    assert frame.draftMoves and not frame.immortalConstruct.hitsLeft
    wait_cast(step,slot,SIGNATURE,119)
    old=packet(lua,guest,boss)
    opening=packet(lua,host,boss,startedAt=host.t+1/60)
    next_tick(guest,old)
    next_tick(host,opening)
    step()
    assert cast.tick==120 and old.impactEvent==opening.impactEvent==1
    assert cast.bloomRemaining==2 and boss.hp==before-base*2 and boss.form=='life'

    for state,u in zip(states,(1.1,1.4,2.45,-.6)):
        place(state,cast.origin+u*88)
    seq=[state.seq for state in states]
    hp=boss.hp
    wait_cast(step,slot,SIGNATURE,144)
    assert [hurt(s,mark,boss) for s,mark in zip(states,seq)]==[[(22,'pyro')],[(22,'pyro')],[],[]]
    assert boss.hp==hp and boss.form=='life' and cast.bloomRemaining==2
    wait_cast(step,slot,SIGNATURE,225)
    assert attack(lua,core,host,boss,atk=100,startedAt=host.t)==base and cast.bloomRemaining==1
    assert boss.form=='life'
    place(host,cast.origin-.6*88)
    wait_cast(step,slot,SIGNATURE,228)
    assert hurt(guest,seq[1],boss)==[(22,'pyro'),(22,'pyro')]
    assert boss.form=='life'
    place(guest,cast.origin-.6*88)
    wait_cast(step,slot,SIGNATURE,240)
    assert boss.form=='chant'
    wait_cast(step,slot,SIGNATURE,299)
    late=packet(lua,guest,boss)
    next_tick(guest,late)
    hp=boss.hp
    step()
    assert cast.tick==300 and late.impactEvent==1 and cast.bloomRemaining==1
    assert boss.hp==hp-base and not cast.breakRequested and boss.form=='chant'
    assert not core.frame(guest).fieldBoss.immortalConstruct.hitsLeft
    hp=boss.hp
    wait_cast(step,slot,SIGNATURE,324)
    assert hurt(observer,seq[2],boss)==[(32,'pyro')] and not hurt(safe,seq[3],boss)
    assert boss.hp==hp and boss.form=='bloom'
    wait_cast(step,slot,SIGNATURE,360)
    assert boss.form=='recover' and boss.y==480 and boss.hp==hp
    wait_cast(step,slot,SIGNATURE,503)
    step()
    assert slot.cast is None and slot.delay==0
    face(states,boss,1)
    wait_cast(step,slot,'IC01',1)
    return dict(participants=4,openingAt120AndPreviousCastRejected=True,
        baseDamageAcrossForms=base,noSelfCostOrHealing=True,partialProgressKeptBothWaves=True,
        deadlineAt300BodyDamageStillApplies=True,naturalHitsAt=[144,228,324],naturalRecoveryTicks=144)


def interrupt(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    cast=lock_bloom(room,states,step,-1)
    wait_cast(step,slot,SIGNATURE,120)
    first=packet(lua,host,boss)
    core.resolveCast(host,first)
    core.resolveCast(host,first)
    for changes in (dict(reaction=True),dict(persistentTarget=boss),dict(startedAt=guest.t-1),
                    dict(x=boss.x+200)):
        core.resolveCast(guest,packet(lua,guest,boss,**changes))
    assert cast.bloomRemaining==2 and boss.form=='life'
    boss.invulnerable=True
    core.resolveCast(guest,packet(lua,guest,boss))
    boss.invulnerable=False
    assert cast.bloomRemaining==2
    core.resolveCast(guest,packet(lua,guest,boss))
    assert cast.bloomRemaining==1 and boss.form=='life'
    face(states,boss,-1)
    wait_cast(step,slot,SIGNATURE,143)
    seq=[s.seq for s in states]
    hp=boss.hp
    third=packet(lua,host,boss)
    next_tick(host,third)
    step()
    assert cast.tick==cast.broken==144 and boss.form=='recover' and third.impactEvent==1
    assert not any(hurt(s,mark,boss) for s,mark in zip(states,seq))
    base=hp-boss.hp
    assert base>0 and attack(lua,core,host,boss,atk=100)==base
    wait_cast(step,slot,SIGNATURE,287)
    assert boss.form=='recover'
    step()
    assert slot.cast is None and slot.delay==0

    for state in states:
        core.healActor(state,state.actors[1],state.actors[1].maxhp)
    cast=lock_bloom(room,states,step,1)
    face(states,boss,-1)
    wait_cast(step,slot,SIGNATURE,299)
    core.resolveCast(host,packet(lua,host,boss))
    core.resolveCast(host,packet(lua,host,boss))
    assert cast.bloomRemaining==1
    core.resolveCast(guest,packet(lua,guest,boss))
    assert cast.breakRequested==299
    step()
    assert cast.broken==299 and boss.form=='recover'
    return dict(threeDistinctHitsFromTwoParties=True,multihitReactionDoTMissAndImmuneExclude=True,
        lastContactAcceptedAt299=True,cancelledFirstWaveAt144=True,interruptRecoveryTicks=144)


def retreat_and_save(lua,core):
    state=party(core,CASE,accepted=True)
    slot=state.fieldSlots[SPEC.id]
    boss=slot.enemy
    idle=lua.table()
    step=lambda:core.step(state,1/60,idle)
    place(state,boss.x+88)
    wait_cast(step,slot,'IC02',325)
    step()
    boss.x=1517
    place(state,1574)
    wait_cast(step,slot,SIGNATURE,48)
    old=slot.cast
    assert boss.form=='reposition' and old.reposition<old.origin and not old.waves
    wait_cast(step,slot,SIGNATURE,120)
    phase=slot.cast
    assert not lua.eval('rawequal')(old,phase) and phase.origin<old.origin
    assert phase.waves[3].right+10+.10*88<=state.worldwidth-20
    stale=packet(lua,state,boss,startedAt=old.startTime+2)
    core.resolveCast(state,stale)
    assert phase.bloomRemaining==3
    core.resolveCast(state,packet(lua,state,boss))
    assert phase.bloomRemaining==2
    saved=validate_save(native(core.checkpoint(state)))
    stored=saved['fieldBosses'][SPEC.id]
    assert stored['hp']==boss.hp and stored['maxHp']==6500000 and 'flags' not in stored
    for engine,engine_core in ((lua,core),(prior_lua,prior_core)):
        restored=engine_core.restore(engine.table_from(saved,recursive=True),12)
        local_slot=restored.fieldSlots[SPEC.id]
        assert local_slot.cast is None and local_slot.enemy.hp==stored['hp']
    boss.hp=1
    core.resolveCast(state,packet(lua,state,boss))
    assert slot.phase=='respawn' and slot.cast is None and not phase.breakRequested
    return dict(wallRepositionRecreatesCast=True,staleBeforeRetryExcluded=True,
        checkpointKeepsHpWithoutCounter=True,hpZeroWins=True)


def earned(short):
    route=Journey(SAVE,engine=(prior_lua,prior_core))
    route.warp(SPEC.hub)
    assert route.state.progression.level==145
    (ROOT/'work/earned-immortal-short-ready.json').write_text(
        json.dumps(route.snapshot(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    prior=Trial(SPEC,False,file=SAVE,engine=(prior_lua,prior_core)).finish(normal=True,ticks=12000)
    alternate=Trial(SPEC,False,file=SAVE,engine=short).finish(normal=True,ticks=12000)
    breaker=Trial(SPEC,False,file=SAVE,engine=short)
    breaker.until(lambda: breaker.slot.cast and breaker.slot.cast.move.id==SIGNATURE,normal=True)
    breaker.until(lambda: breaker.slot.cast.broken,normal=True,ticks=300)
    interrupted_at=breaker.slot.cast.broken
    broken=breaker.finish(normal=True,ticks=12000)

    retreat=Trial(SPEC,False,file=SAVE,engine=short)
    retreat.until(lambda: retreat.slot.cast and retreat.slot.cast.move.id==SIGNATURE and retreat.slot.cast.tick==60,
                  normal=True)
    retreat.trip.state.actors[2].hp=0
    cast=retreat.slot.cast
    outer=cast.waves[3]
    dest=outer.right+40 if cast.dir>0 else outer.left-40
    retreat.trip.approach(dest,480,'開花の予告範囲外')
    hp=retreat.trip.actor.hp
    assert cast.tick<144
    retreat.trip.tick(360-cast.tick)
    assert retreat.boss.form=='recover' and retreat.trip.actor.hp==hp and not cast.broken
    seq=retreat.trip.state.seq
    retreat.until(lambda: any(e.seq>seq and e.kind=='hit' and e.actor==1 and e.target==retreat.boss.id
                               for e in retreat.trip.state.events.values()),normal=True,ticks=144)
    counter_at=cast.tick
    assert counter_at<504
    evaded=retreat.finish(normal=True,ticks=12000)
    for row in (alternate,broken,evaded):
        for key in ('commission','killXpAndMora','maxHp','partyAttack'):
            assert row[key]==prior[key]
    return dict(level=145,previous=prior,short=alternate,interrupted=broken,evaded=evaded,
                interruptedAt=interrupted_at,groundEvasionAndCounterAt=counter_at)


def main():
    short=runtime(draft_field_moves=True)
    data=natural(*short)|interrupt(*short)|retreat_and_save(*short)|earned(short)
    (ROOT/'evidence/draft-immortal-construct-moves-lua.json').write_text(
        json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: fixed bloom, opening and expiry, three-hit cancellation, both paths and earned commission verified.')


if __name__=='__main__':
    main()
