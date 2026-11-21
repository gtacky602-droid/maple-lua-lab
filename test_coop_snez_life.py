"""Check the shared coffin, resurrection guard, and bloom healing budget."""
import json

from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, party, share


SNOW = ('boss-25135202', 'snezhnaya-hub', 'snezhnaya-field', 'drifting-snow-commission')
BEAST = ('boss-25140101', 'snezhnaya-hub', 'snezhnaya-field', 'immortal-construct-commission')


def cast(lua, state, target, **options):
    return lua.table_from(dict(id=1, atk=1, x=target.x, y=480, dir=1, radial=True, range=24,
                               limit=1, mult=1, color='#ffce71', gain=0, element='physical',
                               startedAt=state.t, critRate=0, targetId=target.id) | options)


def strike(lua, core, state, target, **options):
    core.resolveCast(state, cast(lua, state, target, **options))


def trigger_coffin(lua, core, state, boss):
    strike(lua, core, state, boss, atk=570)
    assert 0 < boss.hp <= 660


def opening(core, states, step, slot, prefix):
    boss=slot.enemy
    place_all(states,boss.x,(-89,-94,163,228))
    wait_cast(step,slot,prefix+'01',185)
    assert [hits(s,boss) for s in states] == [[21,21],[21,21],[],[]]
    wait_cast(step,slot,prefix+'02',48)
    place(states[0],slot.cast.centers[1])
    place(states[1],slot.cast.centers[2])
    marks=[s.seq for s in states]
    wait_cast(step,slot,prefix+'02',223)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[23],[23],[],[]]


def check_coffin(lua, core):
    room,states,step=share(core,SNOW)
    host,guest,observer,_=states
    room.time,host.t,guest.t,observer.t=210,210,3,900
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    opening(core,states,step,slot,'FDS')
    trigger_coffin(lua,core,host,boss)
    wait_cast(step,slot,'FDS03',60)
    assert boss.coffinUsed and boss.coffinLayers == 8
    for state in (host,guest):
        strike(lua,core,state,boss,element='pyro',startedAt=state.t-TICK)
        strike(lua,core,state,boss,element='pyro',reaction=True)
    strike(lua,core,guest,boss,element='cryo')
    assert boss.coffinLayers == 8
    first=cast(lua,guest,boss,element='pyro')
    core.resolveCast(guest,first)
    core.resolveCast(guest,first)
    strike(lua,core,host,boss,element='anemo')
    strike(lua,core,guest,boss,element='electro')
    assert all(core.frame(s).fieldBoss.driftingSnow.layers==2 for s in states)
    place_all(states,boss.x,(-230,250,270,282))
    wait_cast(step,slot,'FDS03',419)
    phase=slot.cast
    remaining=boss.hp
    strike(lua,core,host,boss,element='pyro')
    step()
    assert phase.failed is None and phase.healed is None
    assert boss.hp==remaining-1 and boss.form=='down' and slot.cast is None
    assert all(core.frame(s).fieldBoss.driftingSnow.coffinUsed for s in states)
    for _ in range(180):
        step()
    assert boss.form=='idle' and boss.coffinUsed
    finish(lua,core,SNOW,slot,states)
    check_adoption(core,SNOW,'FDS01',104,21)

    room,states,step=share(core,SNOW)
    host=states[0]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    place_all(states,boss.x,(-93,80,260,290))
    trigger_coffin(lua,core,host,boss)
    wait_cast(step,slot,'FDS03',419)
    remaining=boss.hp
    step()
    assert all(native(core.frame(s).fieldBoss.driftingSnow)['healed']==96 for s in states)
    wait_cast(step,slot,'FDS03',550)
    assert boss.hp==remaining+96
    return dict(participants=4, independentSlashesAndSeeds=True, sharedLayerCount=True,
                distinctPartyClocks=True, oldCastReactionAndMultihitRejected=True,
                finalTickBreakPreventsHeal=True, unbrokenCoffinHealsOnce=96, individualRewards=True)


def check_coffin_adoption(lua,core):
    solo=party(core,SNOW,True)
    slot=solo.fieldSlots[SNOW[0]]
    trigger_coffin(lua,core,solo,slot.enemy)
    wait_cast(lambda:core.step(solo,TICK),slot,'FDS03',60)
    room=core.newCoop(solo)
    member=core.attachCoop(room,solo)
    saved=native(core.checkpoint(solo))['fieldBosses'][SNOW[0]]
    assert saved['flags']['coffinUsed'] and saved['hp']==658
    core.detachCoop(member)
    personal=solo.fieldSlots[SNOW[0]]
    assert personal.enemy.coffinUsed and personal.enemy.coffinLayers==0
    place(solo,personal.enemy.x-90)
    wait_cast(lambda:core.step(solo,TICK),personal,'FDS01',1)


def check_life(lua,core):
    room,states,step=share(core,BEAST)
    host,guest,observer,_=states
    room.time,host.t,guest.t,observer.t=320,320,4,910
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    opening(core,states,step,slot,'IC')
    wait_cast(step,slot,'IC03',60)
    life=slot.cast
    assert boss.lifeUnits==12 and life.spent==96 and boss.hp==1164
    for state in (host,guest):
        strike(lua,core,state,boss,startedAt=state.t-1)
        strike(lua,core,state,boss,reaction=True)
    assert boss.lifeUnits==12
    pulse=cast(lua,guest,boss)
    core.resolveCast(guest,pulse)
    core.resolveCast(guest,pulse)
    strike(lua,core,host,boss)
    step()
    assert life.cancelled[1] and life.interruptions==1 and boss.lifeUnits==10
    for index in range(6):
        strike(lua,core,states[index%2],boss)
    step()
    assert life.chantStart==62 and boss.lifeUnits==4
    assert all(core.frame(s).fieldBoss.immortalConstruct.units==4 for s in states)
    parent=life.chantStart+life.move.releaseDelay
    wait_cast(step,slot,'IC03',parent-1)
    place_all(states,boss.x,(-91,87,244,280))
    for index in range(4):
        strike(lua,core,states[index%2],boss)
    marks=[s.seq for s in states]
    step()
    assert boss.form=='down' and slot.cast is None and life.healed==0
    assert all(not hits(s,boss,mark) for s,mark in zip(states,marks))
    finish(lua,core,BEAST,slot,states)

    room,states,step=share(core,BEAST)
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    place_all(states,boss.x,(-88,89,140,268))
    wait_cast(step,slot,'IC03',60)
    life=slot.cast
    place_all(states,boss.x,(-80,82,137,260))
    for state in states:
        state.actors[1].hp=state.actors[1].maxhp
    marks=[s.seq for s in states]
    wait_cast(step,slot,'IC03',153)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[22],[22],[22],[]]
    assert life.healed==54 and boss.hp==1218
    wait_cast(step,slot,'IC03',310)
    assert life.healed==72 and boss.hp==1236
    wait_cast(step,slot,'IC03',530)
    assert life.healed==72 and boss.hp==1236
    assert all(core.frame(s).fieldBoss.immortalConstruct.healed==72 for s in states)
    return dict(participants=4, independentSlashesAndSeeds=True, paidHp=96, sharedGuardUnits=12,
                oldCastReactionAndMultihitRejected=True, segmentBreakCancelsOneWave=True,
                lastUnitCancelsBloom=True, sharedHealingCap=72, individualRewards=True)


def check_live_bloom_adoption(core):
    host,guest=party(core,BEAST),party(core,BEAST)
    slot=host.fieldSlots[BEAST[0]]
    step=lambda:core.step(host,TICK)
    wait_cast(step,slot,'IC03',60)
    boss=slot.enemy
    place(host,boss.x+265)
    wait_cast(step,slot,'IC03',515)
    place(host,boss.x-60)
    host.actors[1].hp=host.actors[1].maxhp
    wait_cast(step,slot,'IC03',516)
    assert hits(host,boss)[-1]==32
    room=core.newCoop(host)
    for state in (host,guest):
        core.attachCoop(room,state)
        place(state,boss.x-60)
    mark=host.seq
    core.stepCoop(room,TICK)
    assert not hits(host,boss,mark) and hits(guest,boss)==[32]


if __name__ == '__main__':
    lua,core=runtime()
    result={'driftingSnow':{'lua':check_coffin(lua,core)},'immortalConstruct':{'lua':check_life(lua,core)}}
    check_coffin_adoption(lua,core)
    check_live_bloom_adoption(core)
    result['driftingSnow']['lua']['soloOneUseFlagPreserved']=True
    result['immortalConstruct']['lua']['soloBloomHitPreservedOnJoin']=True
    del lua,core
    with lab() as url:
        result['driftingSnow']['http']=check_http(url,SNOW,'FDS03',60,'driftingSnow',90,gate=1030,trigger=trigger_coffin)
    with lab() as url:
        result['immortalConstruct']['http']=check_http(url,BEAST,'IC03',60,'immortalConstruct',92,gate=1210)
    (ROOT/'evidence/coop-snez-life-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
