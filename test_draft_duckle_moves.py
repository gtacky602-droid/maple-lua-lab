"""Play the optional repair interruption and verify the exact discharge and repair clocks."""

import json
from math import isclose

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import hits, share
from test_coop_sumeru_field import attack
from test_draft_nod_boss_balance import SAVES, SPECS
from test_earned_branch_quests import Journey, core as comparison_core, lua as comparison_lua
from test_earned_snezhnaya_bosses import Trial


SPEC = SPECS['knuckleDuck']
SAVE = SAVES/'earned-lv122.json'
CASE = (SPEC.id, SPEC.hub, 'nod-field', SPEC.quest)
SKILLS = ('SK21', 'SK09', 'SK10')


def at_discharge(trial,tick):
    cast=trial.slot.cast
    return cast and cast.move.id=='FDK03' and cast.tick==tick


def earned(engine,previous):
    browser=Journey(SAVE,engine=engine)
    slots=[[id] for id in SKILLS]+[[] for _ in range(8-len(SKILLS))]
    assert browser.core.configure(browser.state,browser.lua.table_from(slots,recursive=True))[0]
    (ROOT/'work/earned-duckle-ready.json').write_text(
        json.dumps(browser.snapshot(),ensure_ascii=False)+'\n',encoding='utf8')
    prior=Trial(SPEC,False,file=SAVE,engine=previous).finish(normal=True,ticks=12000)
    alternate=Trial(SPEC,False,file=SAVE,engine=engine).finish(normal=True,ticks=12000)
    t=Trial(SPEC,False,file=SAVE,engine=engine,skills=SKILLS)
    t.until(lambda: at_discharge(t,76))
    cast=t.slot.cast
    units=sorted(cast.summons.values(),key=lambda unit:abs(t.trip.actor.x-unit.x))
    assert t.trip.frame().fieldBoss.repairWard is None and len(units)==2
    assert t.boss.duckWard==0
    opened=t.trip.snapshot()
    record=opened['fieldBosses'][SPEC.id]
    assert 0<record['hp']<record['maxHp']==4250000
    for lua,core in (engine,previous):
        restored=core.restore(lua.table_from(opened,recursive=True),12)
        assert restored.fieldSlots[SPEC.id].cast is None
        assert validate_save(native(core.checkpoint(restored)))['fieldBosses'][SPEC.id]==record
    kills,mora=t.trip.state.kills,t.trip.state.mora
    for unit in units:
        t.until(lambda: unit.hp==0,normal=True,skills=SKILLS,aim=unit,ticks=190)
    t.until(lambda: cast.broken,ticks=5)
    assert t.boss.form=='down' and cast.broken<=300 and cast.defeatedRepairs==2
    assert t.trip.state.kills==kills and t.trip.state.mora==mora
    interrupted=t.finish(normal=True,ticks=10000)

    escape=Trial(SPEC,False,file=SAVE,engine=engine)
    escape.trip.state.actors[2].hp=0
    escape.until(lambda: at_discharge(escape,64))
    walk=escape.trip
    wave=escape.slot.cast
    walk.approach(wave.right+20,480,'局所放電の線の外側')
    assert walk.actor.x-10>wave.right and wave.tick<340
    hp=walk.actor.hp
    walk.tick(360-wave.tick)
    assert walk.actor.hp==hp and not wave.seen[1][1] and not wave.broken
    escape.until(lambda: at_discharge(escape,384))
    seq=walk.state.seq
    escape.until(lambda: any(e.seq>seq and e.kind=='hit' and e.actor==1 and e.target==escape.boss.id
                             for e in walk.state.events.values()),normal=True,ticks=127)
    assert 384<=wave.tick<528 and escape.slot.cast.move.id=='FDK03'

    for result in (alternate,interrupted):
        for name in ('commission','killXpAndMora','maxHp','partyAttack'):
            assert result[name]==prior[name]
    return dict(level=122,previous=prior,alternateNormal=alternate,alternateInterrupted=interrupted,
                interruptionTick=cast.broken,checkpointBossHp=record['hp'],checkpointBothProfiles=True,
                avoidedDischarge=True,counterTick=wave.tick,dischargeTrialCompanionInactive=True)


def position(states,boss,side):
    for s in states:
        place(s,boss.x+side*86)


def timings(lua,core):
    room,states,step=share(core,CASE)
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    same=lua.eval('rawequal')
    position(states,boss,1)
    assert all(same(s.enemies[1],boss) for s in states) and boss.hp==boss.maxhp==4250000

    wait_cast(step,slot,'FDK02',92)
    jump=slot.cast
    wait_cast(step,slot,'FDK02',110)
    assert boss.form=='airborne' and isclose(boss.y,480-.83*88)
    assert isclose(boss.x,(jump.origin+jump.dest)/2)
    wait_cast(step,slot,'FDK02',128)
    assert boss.y==480 and boss.x==jump.dest

    position(states,boss,1)
    wait_cast(step,slot,'FDK03',64)
    cast=slot.cast
    assert cast.dir==1 and cast.summons is None
    early=attack(lua,core,states[0],boss,atk=100)
    wait_cast(step,slot,'FDK03',76)
    units=list(cast.summons.values())
    starts=[cast.origin+cast.dir*offset*88 for offset in (1.3,2.5)]
    assert [unit.x for unit in units]==starts and all(unit.maxhp==55000 for unit in units)
    assert attack(lua,core,states[0],boss,atk=100)==early and early>0
    wait_cast(step,slot,'FDK03',94)
    assert [unit.x for unit in units]==starts
    wait_cast(step,slot,'FDK03',197)
    destination=cast.origin+cast.dir*.65*88
    assert all(isclose(unit.x,(x+destination)/2) for unit,x in zip(units,starts))
    wait_cast(step,slot,'FDK03',299)
    hp=boss.hp
    assert all(unit.hp>0 and unit.resolved is None for unit in units)
    step()
    assert all(unit.resolved=='arrived' and unit.x==destination for unit in units)
    assert cast.defeatedRepairs==0 and cast.broken is None and len(room.enemies)==1
    assert boss.hp==hp and boss.duckWard==0

    left,right=cast.left,cast.right
    for s,x in zip(states,((left+right)/2,right+30,left-30,right+60)):
        place(s,x)
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FDK03',339)
    assert not any(hits(s,boss,mark) for s,mark in zip(states,marks))
    step()
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[32],[],[],[]]
    wait_cast(step,slot,'FDK03',384)
    assert all(core.frame(s).fieldBoss.label=='反撃の隙' for s in states)
    assert (cast.left,cast.right)==(left,right)
    wait_cast(step,slot,'FDK03',527)
    step()
    assert slot.cast is None
    return dict(participants=4,maxHp=boss.maxhp,airTicks=36,repairStarts=starts,repairDestination=destination,
                arrivalsAtTick=300,bossHpUnchangedOnArrival=True,damageWithAndWithoutMechas=[early,early],
                releaseDamageByParticipant=[32,0,0,0],naturalRecoveryTicks=144)


def interrupt_deadline(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    position(states,boss,-1)
    wait_cast(step,slot,'FDK03',1)
    position(states,boss,-1)
    wait_cast(step,slot,'FDK03',76)
    cast=slot.cast
    first,second=cast.summons.values()
    assert second.x<first.x<boss.x
    assert attack(lua,core,host,first,atk=100000)==first.maxhp
    step()
    assert cast.defeatedRepairs==1 and cast.broken is None and not first.hp
    wait_cast(step,slot,'FDK03',299)
    assert attack(lua,core,guest,second,atk=100000)==second.maxhp
    step()
    assert cast.broken==300 and cast.defeatedRepairs==2 and len(room.enemies)==1
    wait_cast(step,slot,'FDK03',443)
    assert boss.form=='down'
    step()
    assert boss.form=='stand'
    wait_cast(step,slot,'FDK03',467)
    step()
    assert boss.form=='idle' and slot.cast is None

    position(states,boss,-1)
    wait_cast(step,slot,'FDK03',76)
    later=slot.cast
    a,b=later.summons.values()
    assert {a.id,b.id}.isdisjoint({first.id,second.id})
    assert not core.defeatEnemy(host,first,1)
    assert core.defeatEnemy(host,a,None)
    assert attack(lua,core,guest,b,atk=100000)==b.maxhp
    step()
    assert later.defeatedRepairs==1 and later.broken is None
    wait_cast(step,slot,'FDK03',340)
    assert later.summons is None and later.broken is None and all(s.kills==0 for s in states)

    room,states,step=share(core,CASE)
    slot,boss,host=room.fieldSlot,room.fieldSlot.enemy,states[0]
    wait_cast(step,slot,'FDK03',76)
    end=slot.cast
    for unit in end.summons.values():
        assert attack(lua,core,host,unit,atk=100000)==unit.maxhp
    assert attack(lua,core,host,boss,atk=10**8)>0
    assert boss.hp==0 and end.broken is None and slot.cast is None and len(room.enemies)==1
    return dict(lastAcceptedTick=299,interruptedOnTick=300,downTicks=144,standTicks=24,
                uniqueAcrossCasts=True,unattributedRemovalDoesNotCount=True,bossDeathWinsSameTick=True)


if __name__=='__main__':
    short=runtime(draft_field_moves=True)
    completion=earned(short,(comparison_lua,comparison_core))
    for key in ('previous','alternateNormal','alternateInterrupted'):
        print(key,completion[key]['elapsedSeconds'],flush=True)
    proof=dict(earned=completion,timings=timings(*short),deadline=interrupt_deadline(*short))
    (ROOT/'evidence/draft-duckle-moves-lua.json').write_text(
        json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Repair positions, shared HP, deadline, local discharge and cleanup passed.')
