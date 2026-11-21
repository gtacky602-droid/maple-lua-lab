"""Exercise the shared golden feather and the two fruit impact positions."""
import json
import math

from runtime import ROOT, native, runtime
from test_coop_anemo import place, wait_cast
from test_coop_inazuma_flight import check_adoption, check_air, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack


QUCUSAUR = ('boss-26230301', 'natlan-hub', 'natlan-field', 'qucusaur-commission')
YUMKA = ('boss-26220301', 'natlan-hub', 'natlan-field', 'yumka-commission')


def check_qucusaur(lua, core):
    room, states, step = share(core, QUCUSAUR)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1020
    place_all(states, boss.x, (-101, -104, 152, 220))
    wait_cast(step, slot, 'FQT01', 107)
    assert [hits(s, boss) for s in states] == [[20], [20], [], []]

    wait_cast(step, slot, 'FQT02', 48)
    quills = slot.cast
    origin, direction = quills.origin, quills.dir
    place_all(states, origin, (103*direction, -107*direction, -125*direction, -226*direction))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FQT02', 129)
    assert quills.shots[1] and not quills.shots[2]
    place(host, origin-103*direction)
    place(guest, origin+106*direction)
    wait_cast(step, slot, 'FQT02', 182)
    assert quills.shots[2]
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[17], [17], [], []]

    place_all(states, boss.x, (-104, -86, 147, 228))
    wait_cast(step, slot, 'FQT03', 78)
    flight, feather = slot.cast, slot.cast.summon
    points = [flight.first, flight.second]
    assert feather.hp == 14 and boss.form == 'gold' and math.isclose(boss.y, 397.28)
    for s in states:
        frame = core.frame(s, 'sprite')
        assert list(frame.fieldBoss.divePoints.values()) == points
        assert frame.fieldBoss.summon.x == points[0] and frame.fieldBoss.summon.hp == 14
        markers = [d for d in frame.draws.values() if d.text in ('1', '2') and d.color == '#ffebbc']
        assert len(markers) == 2
        assert all(math.isclose(d.x+frame.camera, x) for d, x in zip(markers, points))
    assert attack(lua, core, host, boss) == 0
    assert attack(lua, core, host, boss, y=boss.y) == math.floor(19*.65)
    step()
    place(host, points[0])
    place(guest, points[1])
    place(states[2], min(points)-143)
    place(states[3], max(points)+139)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FQT03', 220)
    assert feather.hp == 0 and flight.summon is None and boss.x == points[0] and boss.y == 480
    wait_cast(step, slot, 'FQT03', 300)
    assert boss.x == points[1] and boss.y == 480
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[24], [24], [], []]

    place_all(states, boss.x, (98, 103, -130, 225))
    wait_cast(step, slot, 'FQT01', 44)
    wait_cast(step, slot, 'FQT03', 78)
    flight, feather = slot.cast, slot.cast.summon
    same = lua.eval('rawequal')
    assert all(same(s.enemies[2], feather) for s in states)
    assert attack(lua, core, host, feather, atk=10) > 0 and 0 < feather.hp < 14
    for s in states:
        assert native(core.frame(s).fieldBoss.summon)['hp'] == feather.hp
    wait_cast(step, slot, 'FQT03', 185)
    assert attack(lua, core, guest, feather, atk=10) > 0 and feather.hp == 0
    assert all((s.kills,s.mora,s.progression.killXp) == (0,0,0) for s in states)
    place(host, flight.first)
    place(guest, flight.second)
    marks = [s.seq for s in states]
    step()
    assert flight.breakAt == 186 and boss.form == 'falling' and len(room.enemies) == 1
    wait_cast(step, slot, 'FQT03', 302)
    assert boss.y == 480 and boss.x == flight.origin
    assert all(hits(s,boss,mark) == [] for s,mark in zip(states,marks))
    for s in states:
        view = core.frame(s,'sprite').fieldBoss
        assert view.flightInterrupted and view.divePoints is None and view.summon is None
    finish(lua, core, QUCUSAUR, slot, states)
    check_adoption(core, QUCUSAUR, 'FQT01', 96, 20)
    return dict(participants=4, hp=1020, sharedLockedDives=True, separateFeatherAndDiveHits=True,
                goldWardAndAirHitbox=True, bothPlayersCanBreakFeather=True,
                lastTickBreakStopsBothDives=True, noFeatherRewards=True,
                individualRewards=True, priorSoloHitSurvivesAdoption=True)


def check_yumka(lua, core):
    room, states, step = share(core, YUMKA)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1035
    place_all(states, boss.x, (-94, 92, 139, -235))
    wait_cast(step, slot, 'FYM01', 114)
    assert [hits(s,boss) for s in states] == [[21], [21], [], []]

    place_all(states, boss.x, (-108, -117, 162, 230))
    wait_cast(step, slot, 'FYM02', 60)
    landing = slot.cast.dest
    place_all(states, landing, (0, 23, -118, 125))
    wait_cast(step, slot, 'FYM02', 102)
    assert math.isclose(boss.y, 400.8)
    check_air(core, states, boss, landing, 'yumka-field-poses-source-v1.png', 154, 0)
    assert attack(lua,core,host,boss) == 0 and attack(lua,core,guest,boss,y=boss.y) > 0
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FYM02', 121)
    assert boss.x == landing and boss.y == 480
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[25], [25], [], []]

    place_all(states, boss.x, (-93, -89, 168, 231))
    wait_cast(step, slot, 'FYM03', 54)
    points = native(slot.cast.points)
    place(host, points[0])
    place(guest, points[1])
    place(states[2], max(points)+125)
    place(states[3], min(points)-135)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FYM03', 114)
    for s in states:
        frame = core.frame(s,'sprite')
        assert native(frame.fieldBoss.firePoints) == points and frame.fieldBoss.summon is None
        markers = [d for d in frame.draws.values() if d.text in ('1','2') and d.color == '#fff0c3']
        assert len(markers) == 2
        assert all(math.isclose(d.x+frame.camera, x) for d,x in zip(markers,points))
    assert all(hits(s,boss,mark) == [] for s,mark in zip(states,marks))
    wait_cast(step, slot, 'FYM03', 189)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[20], [20], [], []]
    finish(lua,core,YUMKA,slot,states)
    check_adoption(core,YUMKA,'FYM01',108,21)
    return dict(participants=4,hp=1035,sharedBellyLandingAndAirHurtbox=True,
                sharedFruitCues=True,fruitFlightCannotHit=True,
                separateFruitImpacts=True,individualRewards=True,priorSoloHitSurvivesAdoption=True)


if __name__=='__main__':
    lua,core=runtime()
    result={'qucusaur':{'lua':check_qucusaur(lua,core)},'yumka':{'lua':check_yumka(lua,core)}}
    with lab() as url:
        result['qucusaur']['http']=check_http(url,QUCUSAUR,'FQT03',100,'summon',223,gate=1030)
        result['yumka']['http']=check_http(url,YUMKA,'FYM03',114,'firePoints',137,gate=690)
    (ROOT/'evidence/coop-natlan-saurians-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
