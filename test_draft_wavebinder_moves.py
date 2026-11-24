"""Verify anchor travel, both drinks counters, and the natural triple sweep."""

import json
from math import isclose

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import party, share
from test_coop_sumeru_field import attack, hurt
from test_earned_branch_quests import Journey, core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import ENCOUNTERS, Trial


SPEC=ENCOUNTERS['wavebinder']
CASE=(SPEC.id,SPEC.hub,'novokichev-depth',SPEC.quest)
SAVE=ROOT/'work/snez-fresh-route-draft/white-pass-save.json'
SIGNATURE='WB03'


def packet(lua,state,boss,**options):
    return lua.table_from(dict(id=1,atk=100,x=boss.x,y=480,dir=1,radial=True,range=24,
        limit=1,mult=1,critRate=0,color='#37d8ff',gain=0,element='physical',startedAt=state.t,targetId=boss.id)|options)


def next_tick(state,cast):
    cast.next,cast.remaining,cast.interval=state.t+1/60,1,.1
    state.pending[len(state.pending)+1]=cast


def face(states,boss,side,distance=88):
    for state in states:
        place(state,boss.x+side*distance)


def lock_drink(room,states,step,side):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    face(states,boss,side)
    wait_cast(step,slot,SIGNATURE,1)
    face(states,boss,side)
    wait_cast(step,slot,SIGNATURE,48)
    cast=slot.cast
    assert cast.dir==side and not cast.reposition
    x1,x2=cast.origin+side*.1*88,cast.origin+side*2.3*88
    assert isclose(cast.left,min(x1,x2)) and isclose(cast.right,max(x1,x2))
    return cast


def anchor_and_natural(lua,core):
    room,states,step=share(core,CASE)
    host,guest,observer,safe=states
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    assert boss.maxhp==6800000
    base=attack(lua,core,host,boss,atk=100)
    face(states,boss,1,168)
    wait_cast(step,slot,'WB02',1)
    face(states,boss,1,168)
    wait_cast(step,slot,'WB02',54)
    throw=slot.cast
    assert isclose(throw.center,throw.origin+168)
    assert isclose(throw.left,throw.center-.80*88) and isclose(throw.right,throw.center+.80*88)
    assert isclose(throw.pullLeft,throw.origin-.14*88) and isclose(throw.pullRight,throw.center+.14*88)
    for state,x in zip(states,(throw.center,throw.origin+28,throw.center+55,throw.origin-55)):
        place(state,x)
    xpos=[state.actors[1].x for state in states]
    seq=[state.seq for state in states]
    wait_cast(step,slot,'WB02',101)
    anchor=core.frame(host).fieldBoss.wavebinder.anchor
    assert isclose(anchor.x,(throw.origin+throw.center)/2) and isclose(anchor.y,480-.8*88)
    assert not anchor.returning
    wait_cast(step,slot,'WB02',126)
    anchor=core.frame(host).fieldBoss.wavebinder.anchor
    assert anchor.x==throw.center and anchor.y==480 and not anchor.returning
    assert [hurt(s,mark,boss) for s,mark in zip(states,seq)]==[[(23,'hydro')],[],[(23,'hydro')],[]]
    wait_cast(step,slot,'WB02',199)
    anchor=core.frame(host).fieldBoss.wavebinder.anchor
    assert anchor.returning and isclose(anchor.x,(throw.origin+throw.center)/2)
    wait_cast(step,slot,'WB02',204)
    received=[hurt(s,mark,boss) for s,mark in zip(states,seq)]
    assert received==[[(23,'hydro'),(23,'hydro')],[(23,'hydro')],[(23,'hydro')],[]]
    assert [state.actors[1].x for state in states]==xpos
    wait_cast(step,slot,'WB02',218)
    assert core.frame(host).fieldBoss.wavebinder.anchor is None

    for state in states:
        core.healActor(state,state.actors[1],state.actors[1].maxhp)
    cast=lock_drink(room,states,step,-1)
    wait_cast(step,slot,SIGNATURE,59)
    old=packet(lua,host,boss,element='electro')
    next_tick(host,old)
    opened=packet(lua,guest,boss,element='electro',startedAt=guest.t+1/60)
    next_tick(guest,opened)
    step()
    assert cast.tick==60 and boss.form=='drinking' and cast.hits==2
    assert old.impactEvent==opened.impactEvent==1 and not boss.valiant
    for state,u in zip(states,(1.20,-.7,2.7,3.1)):
        place(state,cast.origin+cast.dir*u*88)
    seq=[state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,239)
    core.resolveCast(guest,packet(lua,guest,boss))
    assert cast.hits==3
    late=packet(lua,guest,boss,element='electro')
    next_tick(guest,late)
    hp=boss.hp
    step()
    assert cast.tick==240 and cast.hits==3 and not cast.broken and boss.form=='valiant'
    assert late.impactEvent==1 and boss.hp<hp
    view=core.frame(host).fieldBoss.wavebinder
    assert view.valiant and not view.drinkOpen and view.courage is None
    assert attack(lua,core,guest,boss,atk=100)==base
    for t,n in ((288,1),(354,2),(420,3)):
        wait_cast(step,slot,SIGNATURE,t)
        assert [hurt(s,mark,boss) for s,mark in zip(states,seq)]==[[(26,'physical')]*n,[],[],[]]
    wait_cast(step,slot,SIGNATURE,456)
    assert boss.form=='recover' and not core.frame(host).fieldBoss.wavebinder.valiant
    wait_cast(step,slot,SIGNATURE,599)
    step()
    assert slot.cast is None and slot.delay==0
    face(states,boss,1)
    wait_cast(step,slot,'WB01',1)
    assert slot.cast.move.damage==21 and len(slot.cast.move.active)==2
    return dict(participants=4,flightMidpointAt101=True,returnMidpointAt199=True,anchorHits=received,
        noForcedMotion=True,acceptedAt60=True,deadlineAt240BodyDamageStillApplies=True,
        naturalHitsAt=[288,354,420],baseDamageAcrossForms=base,naturalRecoveryTicks=144,
        nextMoveUsesNormalDamage=True)


def interruptions(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    cast=lock_drink(room,states,step,1)
    wait_cast(step,slot,SIGNATURE,60)
    first=packet(lua,host,boss,element='electro')
    core.resolveCast(host,first)
    core.resolveCast(host,first)
    for changes in (dict(reaction=True),dict(persistentTarget=boss),dict(startedAt=guest.t-1),dict(x=boss.x+150)):
        core.resolveCast(guest,packet(lua,guest,boss,**changes))
    assert cast.hits==2
    base=attack(lua,core,guest,boss,atk=100)
    for state in states:
        place(state,cast.origin+82)
    marks=[state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,238)
    hp,kills,mora=boss.hp,host.kills,host.mora
    second=packet(lua,guest,boss,element='electro')
    next_tick(guest,second)
    step()
    assert cast.tick==cast.broken==239 and cast.hits==4 and boss.form=='recover'
    assert second.impactEvent==1 and boss.hp==hp-base and boss.drinkInterrupts==1
    assert attack(lua,core,host,boss,atk=100)==base and (host.kills,host.mora)==(kills,mora)
    wait_cast(step,slot,SIGNATURE,382)
    assert not any(hurt(state,mark,boss) for state,mark in zip(states,marks))
    step()
    assert slot.cast is None and slot.delay==0
    for state in states:
        core.healActor(state,state.actors[1],state.actors[1].maxhp)
    cast=lock_drink(room,states,step,-1)
    wait_cast(step,slot,SIGNATURE,60)
    for hits_so_far in range(1,5):
        core.resolveCast(host,packet(lua,host,boss))
        assert cast.hits==hits_so_far
    step()
    assert cast.broken==60 and boss.drinkInterrupts==2 and not core.frame(host).fieldBoss.wavebinder.valiant
    return dict(electroCastsRequired=2,physicalCastsRequired=4,
        multihitReactionDoTMissAndEarlierCastExcluded=True,lastContactAcceptedAt239=True,
        interruptedRecoveryTicks=144,noExtraMultiplierOrReward=True)


def checkpoint_during_sweep(lua,core):
    state=party(core,CASE,accepted=True)
    slot=state.fieldSlots[SPEC.id]
    boss=slot.enemy
    empty=lua.table()
    step=lambda:core.step(state,1/60,empty)
    place(state,boss.x+2)
    wait_cast(step,slot,'WB01',48)
    old=slot.cast
    assert boss.form=='reposition' and old.reposition<old.origin and old.left is None
    wait_cast(step,slot,'WB01',1)
    assert not lua.eval('rawequal')(slot.cast,old) and slot.cast.origin<old.origin
    assert not hurt(state,0,boss)
    place(state,boss.x+83)
    wait_cast(step,slot,SIGNATURE,1)
    wait_cast(step,slot,SIGNATURE,240)
    assert boss.form=='valiant'
    core.resolveCast(state,packet(lua,state,boss,element='electro'))
    assert slot.cast.hits==0 and boss.form=='valiant'
    saved=validate_save(native(core.checkpoint(state)))
    record=saved['fieldBosses'][SPEC.id]
    for engine,engine_core in ((lua,core),(prior_lua,prior_core)):
        restored=engine_core.restore(engine.table_from(saved,recursive=True),12)
        current=restored.fieldSlots[SPEC.id]
        assert current.enemy.hp==record['hp'] and current.cast is None and not current.enemy.valiant
    core.enterStoryNode(state,'novokichev-depth')
    assert slot.cast is None and boss.form=='idle' and boss.hp==record['hp']
    return dict(repositionsWhenInitialGroundWarningTooShort=True,
                checkpointRetainsHpWithoutTemporarySurge=True,exitCancelsTemporarySurge=True)


def at_tick(trial,tick):
    c=trial.slot.cast
    return c and c.move.id==SIGNATURE and c.tick==tick


def earned(short):
    route=Journey(SAVE,engine=(prior_lua,prior_core))
    route.travel(SPEC.hub)
    assert route.state.progression.level==160
    (ROOT/'work/earned-wavebinder-short-ready.json').write_text(
        json.dumps(route.snapshot(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    prior=Trial(SPEC,False,file=SAVE,engine=(prior_lua,prior_core)).finish(normal=True,ticks=14000)
    alternate=Trial(SPEC,False,file=SAVE,engine=short).finish(normal=True,ticks=14000)

    fighter=Trial(SPEC,False,file=SAVE,engine=short)
    fighter.until(lambda: at_tick(fighter,60))
    cast=fighter.slot.cast
    fighter.until(lambda: cast.broken,normal=True,ticks=180)
    broken_at=cast.broken
    interrupted=fighter.finish(normal=True,ticks=14000)

    escape=Trial(SPEC,False,file=SAVE,engine=short)
    escape.until(lambda: at_tick(escape,60))
    escape.trip.state.actors[2].hp=0
    wave=escape.slot.cast
    dest=wave.right+40 if wave.dir>0 else wave.left-40
    escape.trip.approach(dest,480,'三連錨の予告範囲外')
    hp=escape.trip.actor.hp
    assert wave.tick<240
    escape.trip.tick(456-wave.tick)
    assert escape.trip.actor.hp==hp and escape.boss.form=='recover' and not wave.broken
    seq=escape.trip.state.seq
    escape.until(lambda: any(e.seq>seq and e.kind=='hit' and e.actor==1 and e.target==escape.boss.id
                               for e in escape.trip.state.events.values()),normal=True,ticks=144)
    counter_at=wave.tick
    assert counter_at<600
    evaded=escape.finish(normal=True,ticks=14000)
    for row in (alternate,interrupted,evaded):
        for key in ('commission','killXpAndMora','maxHp','partyAttack'):
            assert row[key]==prior[key]
    return dict(level=160,previous=prior,short=alternate,interrupted=interrupted,evaded=evaded,
                interruptedAt=broken_at,groundEvasionAndCounterAt=counter_at)


def main():
    short=runtime(draft_field_moves=True)
    data=anchor_and_natural(*short)|interruptions(*short)|checkpoint_during_sweep(*short)|earned(short)
    (ROOT/'evidence/draft-wavebinder-moves-lua.json').write_text(
        json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: separate anchor contacts, physical and electro counters, natural sweep and earned commission verified.')


if __name__=='__main__':
    main()
