"""Verify the one-use coffin, exact cast windows and both earned responses."""

from copy import deepcopy
import json
from math import isclose

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import party, share
from test_coop_sumeru_field import attack, hurt
from test_earned_branch_quests import Journey, core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import ENCOUNTERS, Trial


SPEC=ENCOUNTERS['driftingSnow']
CASE=(SPEC.id,SPEC.hub,'snezhnaya-field',SPEC.quest)
SAVE=ROOT/'work/snez-fresh-route-draft/white-pass-save.json'
SIGNATURE='FDS03'
THRESHOLD=2750000


def packet(lua,state,boss,**changes):
    return lua.table_from(dict(id=1,atk=100,x=boss.x,y=480,dir=1,radial=True,range=24,limit=1,
        mult=1,critRate=0,color='#60dfff',gain=0,element='physical',startedAt=state.t,targetId=boss.id)|changes)


def next_tick(state,cast):
    cast.next,cast.remaining,cast.interval=state.t+1/60,1,.1
    state.pending[len(state.pending)+1]=cast


def start(room,states,step):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    for state in states:
        place(state,boss.x+77)
    wait_cast(step,slot,'FDS01',56)
    boss.hp=THRESHOLD
    step()
    assert slot.cast.move.id==SIGNATURE and slot.cast.tick==0 and boss.coffinUsed
    return slot.cast


def opening_and_interrupt(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    assert boss.maxhp==5000000
    guest.t=17.5
    for state in states:
        place(state,boss.x+82)
    baseline=attack(lua,core,host,boss,atk=100)
    ice=attack(lua,core,host,boss,atk=100,element='cryo')
    assert baseline>ice>0
    wait_cast(step,slot,'FDS02',1)
    for state in states:
        place(state,boss.x+82)
    wait_cast(step,slot,'FDS02',48)
    neutral=slot.cast
    assert neutral.dir==1 and list(neutral.centers.values())==[neutral.origin+u*88 for u in (.85,2.15)]
    wait_cast(step,slot,'FDS02',250)
    boss.hp=THRESHOLD+1
    step()
    assert neutral.tick==251 and not boss.coffinUsed
    assert attack(lua,core,host,boss,atk=1)==1 and boss.hp==THRESHOLD
    wait_cast(step,slot,'FDS02',325)
    assert not boss.coffinUsed and boss.form=='recover'
    step()
    assert slot.cast is None
    step()
    assert slot.cast.move.id==SIGNATURE and slot.cast.tick==0 and boss.coffinUsed

    cast=slot.cast
    wait_cast(step,slot,SIGNATURE,59)
    old=packet(lua,host,boss)
    core.resolveCast(host,old)
    assert cast.coffinRemaining==3 and boss.form=='preparingCoffin'
    first=packet(lua,guest,boss,element='cryo',startedAt=guest.t+1/60)
    before=boss.hp
    next_tick(guest,first)
    step()
    assert cast.tick==60 and first.impactEvent==1 and boss.form=='coffin'
    assert cast.coffinRemaining==2 and before-boss.hp==ice
    core.resolveCast(guest,first)
    for changes in (dict(reaction=True),dict(persistentTarget=boss),dict(startedAt=host.t-1)):
        core.resolveCast(host,packet(lua,host,boss,**changes))
    assert cast.coffinRemaining==2
    core.resolveCast(host,packet(lua,host,boss,element='pyro'))
    assert cast.coffinRemaining==1 and len(room.enemies)==1
    for state in states:
        place(state,cast.origin+cast.dir*75)
    wait_cast(step,slot,SIGNATURE,143)
    seq=[state.seq for state in states]
    before=boss.hp
    last=packet(lua,host,boss)
    next_tick(host,last)
    step()
    assert cast.tick==cast.broken==144 and boss.form=='recover' and last.impactEvent==1
    assert boss.hp==before-baseline and not any(hurt(state,mark,boss) for state,mark in zip(states,seq))
    assert attack(lua,core,host,boss,atk=100)==baseline
    wait_cast(step,slot,SIGNATURE,287)
    assert boss.form=='recover'
    step()
    assert slot.cast is None and slot.delay==0 and boss.coffinUsed
    for state in states:
        place(state,boss.x+83)
    wait_cast(step,slot,'FDS01',1)
    assert boss.coffinUsed
    return dict(participants=4,thresholdHp=THRESHOLD,waitedForExistingRecovery=True,
        preservedNormalOrder=True,acceptedWindowStartAt60=True,cryoHitCountsOnce=True,
        earlierMultihitReactionsAndDoTExcluded=True,cancelledFirstWaveAt144=True,
        unchangedPhysicalDamage=baseline,interruptedRecoveryTicks=144)


def natural_and_deadline(lua,core):
    room,states,step=share(core,CASE)
    host,guest,observer,safe=states
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    cast=start(room,states,step)
    wait_cast(step,slot,SIGNATURE,60)
    assert boss.form=='coffin'
    assert [round((r.right-cast.origin)/88,2) for r in cast.lanes.values()]==[2.2,2.2,2.8]
    for state,u in zip(states,(1.2,1.4,2.60,-.6)):
        place(state,cast.origin+u*88)
    seq=[s.seq for s in states]
    wait_cast(step,slot,SIGNATURE,144)
    assert [hurt(s,mark,boss) for s,mark in zip(states,seq)]==[[(25,'cryo')],[(25,'cryo')],[],[]]
    place(host,cast.origin-.5*88)
    wait_cast(step,slot,SIGNATURE,228)
    assert hurt(guest,seq[1],boss)==[(25,'cryo'),(25,'cryo')]
    wait_cast(step,slot,SIGNATURE,299)
    core.resolveCast(host,packet(lua,host,boss))
    core.resolveCast(guest,packet(lua,guest,boss,element='cryo'))
    assert cast.coffinRemaining==1
    late=packet(lua,host,boss)
    next_tick(host,late)
    hp=boss.hp
    step()
    assert cast.tick==300 and late.impactEvent==1 and cast.coffinRemaining==1
    assert boss.hp<hp and not cast.broken and boss.form=='release'
    place(guest,cast.origin-.6*88)
    wait_cast(step,slot,SIGNATURE,330)
    assert hurt(observer,seq[2],boss)==[(25,'cryo')]
    assert not hurt(safe,seq[3],boss)
    wait_cast(step,slot,SIGNATURE,366)
    assert boss.form=='recover' and boss.y==480 and boss.coffinUsed
    wait_cast(step,slot,SIGNATURE,509)
    step()
    assert slot.cast is None and slot.delay==0
    for state in states:
        place(state,boss.x+80)
    wait_cast(step,slot,'FDS02',1)
    return dict(acceptedAt299=True,deadlineAt300DamageStillApplies=True,noHealing=True,
                naturalHitsAt=[144,228,330],naturalRecoveryTicks=144,normalOrderAfterNaturalEnd=True)


def persistence_and_reposition(lua,core):
    state=party(core,CASE,accepted=True)
    slot=state.fieldSlots[SPEC.id]
    boss=slot.enemy
    idle=lua.table()
    step=lambda:core.step(state,1/60,idle)
    boss.x=1517
    place(state,1574)
    boss.hp=THRESHOLD
    for _ in range(90):
        step()
        if boss.form=='reposition':
            break
    assert boss.form=='reposition' and not boss.coffinUsed and slot.cast is None
    wait_cast(step,slot,SIGNATURE,60)
    assert boss.coffinUsed and slot.cast.origin<1517
    slot_before=slot.cast
    saved=validate_save(native(core.checkpoint(state)))
    record=saved['fieldBosses'][SPEC.id]
    assert record['flags']=={'coffinUsed':True}
    assert record['maxHp']==5000000 and record['hp']==THRESHOLD
    old=deepcopy(saved)
    del old['fieldBosses'][SPEC.id]['flags']
    original_scale=deepcopy(old)
    del original_scale['fieldBosses'][SPEC.id]['maxHp']
    original_scale['fieldBosses'][SPEC.id]['hp']=660
    explicit=deepcopy(saved)
    explicit['fieldBosses'][SPEC.id]['flags']['coffinUsed']=False
    for engine,engine_core in ((lua,core),(prior_lua,prior_core)):
        for data,expected in ((saved,True),(old,True),(original_scale,True),(explicit,False)):
            restored=engine_core.restore(engine.table_from(data,recursive=True),12)
            there=restored.fieldSlots[SPEC.id]
            assert there.cast is None and there.enemy.hp==THRESHOLD and there.enemy.coffinUsed==expected
    core.enterStoryNode(state,'snezhnaya-field')
    core.enterStoryNode(state,SPEC.arena)
    assert slot.cast is None and boss.coffinUsed and boss.hp==THRESHOLD
    place(state,boss.x-82)
    wait_cast(step,slot,'FDS01',56)
    assert slot.cast!=slot_before
    core.resolveCast(state,packet(lua,state,boss,atk=boss.hp*2))
    assert slot.phase=='respawn'
    place(state,65)
    step_many=lua.eval('function(stepCore,state,input,steps) for _=1,steps do stepCore(state,1/60,input) end end')
    step_many(core.step,state,idle,3601)
    assert slot.generation==2 and not slot.enemy.coffinUsed and slot.enemy.hp==5000000

    restart=party(core,CASE,accepted=True)
    slot=restart.fieldSlots[SPEC.id]
    boss=slot.enemy
    boss.x=1517
    boss.hp=THRESHOLD
    place(restart,1430)
    tick=lambda:core.step(restart,1/60,idle)
    wait_cast(tick,slot,SIGNATURE,12)
    consumed=slot.cast
    place(restart,1574)
    wait_cast(tick,slot,SIGNATURE,48)
    assert consumed.reposition and boss.coffinUsed and not consumed.lanes
    wait_cast(tick,slot,SIGNATURE,60)
    assert not lua.eval('rawequal')(slot.cast,consumed)
    assert boss.coffinUsed and slot.cast.origin<consumed.origin and slot.generation==1
    lethal=slot.cast
    for _ in range(2):
        core.resolveCast(restart,packet(lua,restart,boss))
    assert lethal.coffinRemaining==1
    boss.hp=1
    core.resolveCast(restart,packet(lua,restart,boss))
    assert slot.phase=='respawn' and slot.cast is None and lethal.coffinRemaining==1 and not lethal.breakRequested
    return dict(safePlacementBeforeConsumption=True,preLockRetryReplacesParent=True,
        saveWithExplicitFlagAndLegacyInference=True,legacyHpRescales=True,exitRetainsFlag=True,
        newGenerationResetsFlag=True,bossDefeatPrioritized=True)


def earned(short):
    route=Journey(SAVE,engine=(prior_lua,prior_core))
    route.warp(SPEC.hub)
    assert route.state.progression.level==160
    (ROOT/'work/earned-drifting-snow-short-ready.json').write_text(
        json.dumps(route.snapshot(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    prior=Trial(SPEC,False,file=SAVE,engine=(prior_lua,prior_core)).finish(normal=True,ticks=12000)
    alternate=Trial(SPEC,False,file=SAVE,engine=short).finish(normal=True,ticks=12000)
    breaker=Trial(SPEC,False,file=SAVE,engine=short)
    breaker.until(lambda: breaker.slot.cast and breaker.slot.cast.move.id==SIGNATURE,normal=True)
    breaker.until(lambda: breaker.slot.cast.broken,normal=True,ticks=300)
    interrupted_at=breaker.slot.cast.broken
    interrupted=breaker.finish(normal=True,ticks=12000)
    retreat=Trial(SPEC,False,file=SAVE,engine=short)
    retreat.until(lambda: retreat.slot.cast and retreat.slot.cast.move.id==SIGNATURE and retreat.slot.cast.tick==60,
                  normal=True)
    retreat.trip.state.actors[2].hp=0
    cast=retreat.slot.cast
    lane=cast.lanes[3]
    dest=lane.right+40 if cast.dir>0 else lane.left-40
    retreat.trip.approach(dest,480,'氷剣の予告範囲外')
    hp=retreat.trip.actor.hp
    assert cast.tick<144
    retreat.trip.tick(366-cast.tick)
    assert retreat.boss.form=='recover' and retreat.trip.actor.hp==hp and not cast.broken
    seq=retreat.trip.state.seq
    retreat.until(lambda: any(e.seq>seq and e.kind=='hit' and e.actor==1 and e.target==retreat.boss.id
                               for e in retreat.trip.state.events.values()),normal=True,ticks=144)
    assert cast.tick<510
    counter_at=cast.tick
    evaded=retreat.finish(normal=True,ticks=12000)
    for row in (alternate,interrupted,evaded):
        for key in ('commission','killXpAndMora','maxHp','partyAttack'):
            assert row[key]==prior[key]
    return dict(level=160,previous=prior,short=alternate,interrupted=interrupted,evaded=evaded,
                interruptedAt=interrupted_at,groundEvasionAndCounterAt=counter_at)


def main():
    short=runtime(draft_field_moves=True)
    data=opening_and_interrupt(*short)|natural_and_deadline(*short)|persistence_and_reposition(*short)|earned(short)
    (ROOT/'evidence/draft-drifting-snow-moves-lua.json').write_text(
        json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: one-use coffin, both responses, expiry, positioning and earned commission verified.')


if __name__=='__main__':
    main()
