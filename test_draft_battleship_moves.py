"""Exercise the cooling plate, local discharge, and earned progression."""

import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import hits, share
from test_draft_nod_boss_balance import SAVES, SPECS
from test_earned_branch_quests import Journey, core as comparison_core, lua as comparison_lua
from test_earned_snezhnaya_bosses import Trial


SPEC = SPECS['battleship']
SAVE = SAVES/'earned-lv128.json'
CASE = (SPEC.id, SPEC.hub, 'nod-field', SPEC.quest)
SKILLS = ('SK21','SK22','SK09')


def at_cast(trial, tick):
    c = trial.slot.cast
    return c and c.move.id == 'FBT03' and c.tick == tick


def earned(engine, previous):
    browser = Journey(SAVE, engine=engine)
    slots = [[key] for key in SKILLS] + [[] for _ in range(8-len(SKILLS))]
    assert browser.core.configure(browser.state,browser.lua.table_from(slots,recursive=True))[0]
    (ROOT/'work/earned-battleship-ready.json').write_text(
        json.dumps(browser.snapshot(),ensure_ascii=False)+'\n',encoding='utf8')

    baseline = Trial(SPEC,False,file=SAVE,engine=previous).finish(normal=True,ticks=12000)
    alternate = Trial(SPEC,False,file=SAVE,engine=engine).finish(normal=True,ticks=12000)
    t = Trial(SPEC,False,file=SAVE,engine=engine,skills=SKILLS)
    t.until(lambda: at_cast(t,60))
    cast = t.slot.cast
    assert cast.plateLayers == 5 and t.boss.heat == t.boss.iceWard == 0
    t.until(lambda: 0<cast.plateLayers<5,normal=True,skills=SKILLS,aim=cast.plate,ticks=120)
    snapshot=t.trip.snapshot()
    assert 0<snapshot['fieldBosses'][SPEC.id]['hp']<t.max_hp
    t.until(lambda: t.boss.form == 'down',normal=True,skills=SKILLS,aim=cast.plate,ticks=245)
    assert cast.broken <= 300 and t.boss.hp>0 and not cast.plate
    assert t.trip.frame().fieldBoss.label == '冷却板を破壊・反撃の隙'
    interrupted = t.finish(normal=True,ticks=10000)

    escape = Trial(SPEC,False,file=SAVE,engine=engine)
    # Isolate the player's movement and prevent companion projectiles from opening the plate.
    escape.trip.state.actors[2].hp=0
    escape.until(lambda: at_cast(escape,60))
    cast2 = escape.slot.cast
    walk = escape.trip
    walk.approach(cast2.right+22,480,'冷却放出の外側')
    assert cast2.tick<324 and walk.actor.x-10>cast2.right
    hp = walk.actor.hp
    walk.tick(342-cast2.tick)
    assert walk.actor.hp == hp and not cast2.seen[1][1] and not cast2.plate
    escape.until(lambda: at_cast(escape,360))
    assert walk.frame().fieldBoss.label == '反撃の隙'
    seq = walk.state.seq
    escape.until(lambda: any(event.seq>seq and event.kind=='hit' and event.actor==1
                             and event.target==escape.boss.id for event in walk.state.events.values()),
                 normal=True,ticks=120)
    assert 360 <= cast2.tick < 504 and escape.slot.cast.move.id=='FBT03'

    for proof in (alternate,interrupted):
        for key in ('maxHp','partyAttack','commission','killXpAndMora'):
            assert proof[key] == baseline[key]
    return dict(level=128,previous=baseline,alternateNormal=alternate,alternateInterrupted=interrupted,
                interruptionTick=cast.broken,avoidedDischarge=True,counterTick=cast2.tick,
                dischargeTrialCompanionInactive=True),snapshot


def pulse(lua,core,state,boss,**overrides):
    options=dict(id=1,atk=100,x=boss.x,y=480,dir=1,radial=True,range=18,limit=1,mult=1,
                 color='#f1fcff',element='physical',gain=0,critRate=0,startedAt=state.t)
    cast=lua.table_from(options|overrides)
    core.resolveCast(state,cast)
    return cast


def contact_and_boundaries(lua,core):
    room,states,step=share(core,CASE)
    host,guest,observer,other=states
    host.t,guest.t,observer.t,other.t=91,3,163,8
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    assert boss.maxhp==4500000 and len(room.enemies)==1
    for state in states:
        place(state,boss.x-90)
    wait_cast(step,slot,'FBT03',59)
    c=slot.cast
    old=pulse(lua,core,host,boss,x=c.origin+c.dir*.6*88,range=18)
    assert c.plate is None and boss.iceWard==0
    step()
    plate=c.plate
    assert c.tick==60 and c.plateLayers==5 and plate is not None
    core.resolveCast(host,old)
    assert c.plateLayers==5
    pulse(lua,core,host,boss,x=plate.x,reaction=True)
    pulse(lua,core,host,boss,x=plate.x,y=350,vertical=12)
    pulse(lua,core,host,boss,x=plate.x,range=18,homing=True)
    assert c.plateLayers==5
    old_health=boss.hp
    pulse(lua,core,host,boss)
    assert old_health-boss.hp==95 and c.plateLayers==5
    after_body=boss.hp
    used=pulse(lua,core,guest,boss,x=plate.x,range=18)
    core.resolveCast(guest,used)
    assert boss.hp==after_body and c.plateLayers==4
    touch_both=pulse(lua,core,observer,boss,x=plate.x,range=88,element='pyro')
    assert boss.hp==after_body-95 and c.plateLayers==2
    core.resolveCast(observer,touch_both)
    assert boss.hp==after_body-190 and c.plateLayers==2
    wait_cast(step,slot,'FBT03',299)
    pulse(lua,core,other,boss,x=plate.x,range=18,element='pyro')
    assert c.plateLayers==0
    step()
    assert c.broken==300 and boss.form=='down' and c.plate is None
    wait_cast(step,slot,'FBT03',467)
    assert boss.form=='down' and not c.seen[1][host.actors[1]]
    step()
    assert boss.form=='standing'
    wait_cast(step,slot,'FBT03',491)
    step()
    assert boss.form=='idle' and slot.cast is None

    for state in states:
        place(state,boss.x-90)
    wait_cast(step,slot,'FBT03',60)
    wait_cast(step,slot,'FBT03',299)
    natural=slot.cast
    assert natural.plateLayers==5
    left,right=natural.left,natural.right
    step()
    assert natural.plate is None and natural.broken is None
    for state,x in zip(states,((left+right)/2,right+30,left-30,right+68)):
        place(state,x)
    marks=[state.seq for state in states]
    wait_cast(step,slot,'FBT03',323)
    assert not any(hits(s,boss,m) for s,m in zip(states,marks))
    step()
    assert [hits(s,boss,m) for s,m in zip(states,marks)]==[[33],[],[],[]]
    wait_cast(step,slot,'FBT03',360)
    assert (natural.left,natural.right)==(left,right)
    assert all(core.frame(s).fieldBoss.label=='反撃の隙' for s in states)
    wait_cast(step,slot,'FBT03',503)
    step()
    assert slot.cast is None

    room,states,step=share(core,CASE)
    slot,boss,host=room.fieldSlot,room.fieldSlot.enemy,states[0]
    wait_cast(step,slot,'FBT03',60)
    last=slot.cast
    for _ in range(2):
        pulse(lua,core,host,boss,x=last.plate.x,range=18,element='pyro')
    assert last.plateLayers==1
    pulse(lua,core,host,boss,x=last.plate.x,range=88,atk=10**8)
    assert boss.hp==0 and last.broken is None and slot.cast is None
    return dict(maxHp=4500000,participants=4,plateOnlyNoDamage=True,bodyOnlyNoPlate=True,
                overlapDamageOncePerPulse=True,deduplicatedPlateContactAcrossPulses=True,oldAndReactionExcluded=True,
                lastAcceptedTick=299,interruptedOnTick=300,downTicks=168,standTicks=24,
                naturalDischargeDamage=[33,0,0,0],naturalRecoveryTicks=144,bossDeathWinsSameTick=True)


if __name__=='__main__':
    short=runtime(draft_field_moves=True)
    previous=comparison_lua,comparison_core
    completion,snapshot=earned(short,previous)
    for key in ('previous','alternateNormal','alternateInterrupted'):
        print(key,completion[key]['elapsedSeconds'],flush=True)
    geometry=contact_and_boundaries(*short)
    record=snapshot['fieldBosses'][SPEC.id]
    for lua,core in (short,previous):
        restored=core.restore(lua.table_from(snapshot,recursive=True),12)
        assert restored.fieldSlots[SPEC.id].cast is None
        assert validate_save(native(core.checkpoint(restored)))['fieldBosses'][SPEC.id]==record
    proof=dict(earned=completion,cooling=geometry,restoredBossHp=record['hp'],reloadedInBothProfiles=True)
    (ROOT/'evidence/draft-battleship-moves-lua.json').write_text(
        json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Cooling plate, distinct hit regions, cutoff, local discharge, and four-player clocks passed.')
