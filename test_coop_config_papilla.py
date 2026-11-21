"""Verify shared collector eligibility and the Papilla's continuous health state."""
import json
import math

from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption, check_air, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack

DEVICE = ('boss-24090201', 'natlan-hub', 'natlan-field', 'config-device-commission')
PAPILLA = ('boss-22120101', 'natlan-hub', 'natlan-field', 'papilla-commission')


def direct(lua, state, target, **settings):
    params = dict(id=1, startedAt=state.t, atk=20, x=target.x, y=480, dir=1, radial=True,
                  range=120, limit=1, mult=1, element='physical', color='#fff0ac', gain=2,
                  critRate=0, targetId=target.id)
    return lua.table_from(params | settings)


def check_device(lua, core):
    room, states, step = share(core, DEVICE)
    host, guest, observer, spectator = states
    # Parties can have played for very different durations before entering the room.
    room.time = host.t = 200
    guest.t, observer.t, spectator.t = 2, 920, 40
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1020
    place_all(states, boss.x, (-85,-91,145,241))
    wait_cast(step, slot, 'FSC01', 170)
    assert [hits(s,boss) for s in states] == [[18,18],[18,18],[],[]]

    wait_cast(step, slot, 'FSC02', 54)
    beam = slot.cast
    place(host, beam.origin-89)
    place(guest, beam.origin+89)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FSC02', 121)
    place(host, beam.origin+89)
    place(guest, beam.origin-89)
    wait_cast(step, slot, 'FSC02', 178)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[19],[19],[],[]]

    wait_cast(step, slot, 'FSC03', 59)
    charge, collector = slot.cast, slot.cast.summon
    assert collector.underground and collector.hp == 3
    early_host = direct(lua, host, collector)
    early_observer = direct(lua, observer, collector)
    core.resolveCast(host, early_host)
    step()
    assert not collector.underground and charge.openedAt == room.time
    core.resolveCast(host, early_host)
    core.resolveCast(observer, early_observer)
    core.resolveCast(guest, direct(lua, guest, collector, reaction=True))
    assert collector.hp == 3
    gauges = [s.gauge for s in states]
    first = direct(lua, host, collector)
    core.resolveCast(host, first)
    core.resolveCast(host, first)
    assert collector.hp == 2
    step()
    assert guest.t < charge.openedAt
    core.resolveCast(guest, direct(lua, guest, collector))
    assert collector.hp == 1
    bounds = {'left': charge.left, 'right': charge.right}
    for s in states:
        frame = core.frame(s, 'sprite')
        assert native(frame.fieldBoss.cannonBounds) == bounds and frame.fieldBoss.summon.hp == 1
        pips = [d for d in frame.draws.values() if d.y==375 and d.w==11 and d.h==4]
        assert [d.color for d in pips] == ['#ffb44d','#53606a','#53606a']
    wait_cast(step, slot, 'FSC03', 299)
    core.resolveCast(observer, direct(lua, observer, collector))
    assert collector.hp == 0 and [s.gauge for s in states] == gauges
    assert all((s.kills,s.mora,s.progression.killXp)==(0,0,0) for s in states)
    place_all(states, (charge.left+charge.right)/2, (0,18,110,-115))
    marks = [s.seq for s in states]
    step()
    assert charge.brokenAt == 300 and len(room.enemies) == 1
    wait_cast(step, slot, 'FSC03', 479)
    assert all(hits(s,boss,mark) == [] for s,mark in zip(states,marks))
    assert all(core.frame(s).fieldBoss.form == 'down' and core.frame(s).fieldBoss.cannonBounds is None for s in states)
    step()
    assert boss.form == 'stand'
    wait_cast(step, slot, 'FSC03', 503)
    step()
    assert boss.form == 'hover' and math.isclose(boss.rearmAt-room.time, 20)

    for s in states:
        s.actors[1].hp = s.actors[1].maxhp
    place_all(states,boss.x,(-82,-91,153,218))
    wait_cast(step,slot,'FSC03',60)
    rearm=slot.cast
    assert not rearm.summon and rearm.collectorX and room.time < boss.rearmAt
    place_all(states,(rearm.left+rearm.right)/2,(0,15,122,-131))
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FSC03',341)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[34],[34],[],[]]
    finish(lua,core,DEVICE,slot,states)
    check_adoption(core,DEVICE,'FSC01',102,18)
    return dict(participants=4, hp=1020, differentPartyClocks=True,
                preopeningAndReactionRejected=True, threeDistinctPlayersCanInterrupt=True,
                repeatedPulseCountsOnce=True, lastTickCancelsCannon=True, sharedRearmTimer=True,
                noCollectorRewardsOrGauge=True, individualRewards=True, soloHitPreservedOnJoin=True)


def check_papilla(lua, core):
    room, states, step = share(core,PAPILLA)
    host,guest,*_ = states
    slot=room.fieldSlot
    boss=slot.enemy
    assert boss.maxhp==1050
    place_all(states,boss.x,(-94,-99,145,224))
    wait_cast(step,slot,'FMP01',14)
    assert boss.form=='morphing' and boss.pose=='idle'
    assert attack(lua,core,host,boss,element='hydro')==19
    aura=boss.aura.expires
    before=boss.hp
    guest.pending[1]=direct(lua,guest,boss,remaining=1,next=guest.t+40*TICK,interval=.1)
    wait_cast(step,slot,'FMP01',49)
    assert boss.pose=='stem-ready' and boss.hp==before
    assert boss.aura.element=='hydro' and boss.aura.expires==aura
    same=lua.eval('rawequal')
    assert all(len(s.enemies)==1 and same(s.enemies[1],boss) for s in states)
    wait_cast(step,slot,'FMP01',55)
    assert boss.hp==before-19
    wait_cast(step,slot,'FMP01',143)
    assert [hits(s,boss) for s in states]==[[21],[21],[],[]]
    wait_cast(step,slot,'FMP01',280)
    assert boss.form=='returning' and boss.hp==before-19

    wait_cast(step,slot,'FMP02',60)
    wing=slot.cast
    place_all(states,wing.origin,(-91,-105,145,224))
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FMP02',196)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[18,18],[18,18],[],[]]

    place_all(states,boss.x,(-140,-113,145,207))
    wait_cast(step,slot,'FMP03',60)
    land=slot.cast.dest
    place_all(states,land,(0,25,-137,153))
    wait_cast(step,slot,'FMP03',114)
    assert math.isclose(boss.y,406.96) and boss.form=='airborne'
    check_air(core,states,boss,land,'papilla-field-poses-source-v1.png',154,0)
    assert attack(lua,core,guest,boss)==0 and attack(lua,core,guest,boss,y=boss.y)==19
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FMP03',143)
    assert boss.x==land and boss.y==480
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[26],[26],[],[]]
    wait_cast(step,slot,'FMP03',300)
    assert all(core.frame(s).fieldBoss.form=='returning' for s in states)
    finish(lua,core,PAPILLA,slot,states)
    check_adoption(core,PAPILLA,'FMP01',132,21)
    return dict(participants=4,hp=1050,sameReceiverThroughMorphs=True,
                auraAndPendingCastPreserved=True, independentlyHitByStemAndWing=True,
                sharedLandingAndAirHurtbox=True, individualRewards=True, soloHitPreservedOnJoin=True)


if __name__=='__main__':
    lua,core=runtime()
    result={'config':{'lua':check_device(lua,core)},'papilla':{'lua':check_papilla(lua,core)}}
    with lab() as url:
        result['config']['http']=check_http(url,DEVICE,'FSC03',78,'summon',137,gate=435)
        result['papilla']['http']=check_http(url,PAPILLA,'FMP03',114,'destinationX',144,gate=235)
    (ROOT/'evidence/coop-config-papilla-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
