"""Shared transformations, air hitboxes and quest credit for two Inazuma bosses."""
import json
import math

from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, party, share
from test_coop_sumeru_field import attack

ARRAY = ('boss-24021101', 'inazuma-port', 'array-approach', 'array-commission')
THUNDER = ('boss-20070101', 'inazuma-port', 'thunder-approach', 'thunder-commission')


def place_all(states, center, offsets):
    for state, offset in zip(states, offsets):
        place(state, center + offset)


def check_adoption(core, case, move, hit_tick, damage, rejoin_dx=-93):
    solo, newcomer = party(core, case), party(core, case)
    slot = solo.fieldSlots[case[0]]
    boss = slot.enemy
    wait_cast(lambda: core.step(solo, TICK), slot, move, hit_tick)
    assert hits(solo, boss) == [damage]
    room = core.newCoop(solo)
    for state in (solo, newcomer):
        core.attachCoop(room, state)
        place(state, boss.x + rejoin_dx)
    mark = solo.seq
    core.stepCoop(room, TICK)
    assert hits(solo, boss, mark) == [] and hits(newcomer, boss) == [damage]


def check_air(core, states, boss, dest, source, height, offset):
    for state in states:
        frame = core.frame(state, 'sprite')
        view = frame.fieldBoss
        assert view.flying and view.destinationX == dest and view.y == boss.y
        art = next(d for d in frame.draws.values() if d.source == source)
        assert math.isclose(art.x + state.camera, view.x)
        assert art.h == height and math.isclose(art.y, view.y - offset)


def check_array(lua, core):
    room, states, step = share(core, ARRAY)
    host, guest, observer, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 960
    place_all(states, boss.x, (-95, -94, 130, 225))
    wait_cast(step, slot, 'FPA01', 48)
    assert slot.cast.dir == -1 and core.frame(host).fieldBoss.form == 'blade'
    place(guest, boss.x + 92)
    wait_cast(step, slot, 'FPA01', 96)
    assert [hits(s,boss) for s in states] == [[18], [], [], []]
    place(guest, boss.x - 94)
    wait_cast(step, slot, 'FPA01', 107)
    assert [hits(s,boss) for s in states] == [[18], [18], [], []]
    assert attack(lua,core,host,boss,element='cryo') > 0 and boss.aura.element == 'cryo'
    aura, hp = boss.aura, boss.hp

    wait_cast(step, slot, 'FPA02', 42)
    roll = slot.cast
    assert all(core.frame(s).fieldBoss.form == 'wheel' for s in states)
    assert all(core.frame(s).fieldBoss.destinationX == roll.dest for s in states)
    assert boss.hp == hp and lua.eval('rawequal')(boss.aura,aura)
    assert lua.eval('rawequal')(room.enemies[1],boss) and len(room.enemies) == 1
    place_all(states, roll.origin, (-60, -113, 115, 210))
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FPA02', 125)
    assert boss.x == roll.dest
    assert [hits(s,boss,seq) for s,seq in zip(states,before)] == [[17], [17], [], []]

    place_all(states, boss.x, (-100, -98, 105, 191))
    wait_cast(step, slot, 'FPA03', 54)
    dest = slot.cast.dest
    place_all(states, dest, (0, 24, -110, 120))
    wait_cast(step, slot, 'FPA03', 96)
    assert boss.y == 377 and attack(lua,core,guest,boss,atk=5000) == 0
    assert attack(lua,core,guest,boss,y=boss.y) == 19
    check_air(core,states,boss,dest,'array-field-poses-source-v1.png',108,.45*88)
    assert all(core.frame(s).fieldBoss.form == 'rocket' for s in states)
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FPA03', 125)
    assert boss.x == dest and boss.y == 480
    assert [hits(s,boss,seq) for s,seq in zip(states,before)] == [[22], [22], [], []]
    wait_cast(step, slot, 'FPA03', 150)
    assert core.frame(observer).fieldBoss.form == 'core'
    finish(lua,core,ARRAY,slot,states)
    check_adoption(core,ARRAY,'FPA01',96,18)
    return {'participants':4,'sharedHpAndAuraAcrossForms':True,'sweptRollHitsEachTravelerOnce':True,
            'rocketSpriteAndHitboxFollowSharedLanding':True,'priorSoloHitSurvivesAdoption':True}


def check_thunder(lua, core):
    room, states, step = share(core, THUNDER)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 940 and attack(lua,core,host,boss,element='electro') == 0
    place_all(states, boss.x, (-92, -95, 156, 210))
    wait_cast(step, slot, 'FTM01', 113)
    assert [hits(s,boss) for s in states] == [[17], [17], [], []]
    wait_cast(step, slot, 'FTM02', 42)
    feathers = slot.cast
    assert feathers.dir == -1
    place_all(states, feathers.origin, (-62, -114, -175, 170))
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FTM02', 96)
    assert feathers.shots[1] and not feathers.shots[2]
    place(host, feathers.origin + 95)
    wait_cast(step, slot, 'FTM02', 126)
    assert feathers.shots[2] and not feathers.shots[3]
    place(guest, feathers.origin + 120)
    wait_cast(step, slot, 'FTM02', 156)
    assert feathers.shots[3]
    assert [hits(s,boss,seq) for s,seq in zip(states,before)] == [[11], [11], [11], []]

    place_all(states, boss.x, (-100, -104, 115, 185))
    wait_cast(step, slot, 'FTM03', 54)
    dash = slot.cast
    origin, dest = dash.origin, dash.dest
    place_all(states, dest, (0, 16, -124, 260))
    wait_cast(step, slot, 'FTM03', 90)
    assert boss.x == origin and boss.y == 414
    assert attack(lua,core,guest,boss,atk=5000) == 0
    assert attack(lua,core,guest,boss,y=boss.y) == 17
    check_air(core,states,boss,dest,'thunder-field-poses-source-v1.png',89,.4*88)
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FTM03', 131)
    assert boss.x == dest and boss.y == 480
    assert [hits(s,boss,seq) for s,seq in zip(states,before)] == [[22], [22], [], []]
    finish(lua,core,THUNDER,slot,states)
    check_adoption(core,THUNDER,'FTM01',96,17)
    return {'participants':4,'immuneToElectro':True,'threeFeathersCanHitThreeTravelers':True,
            'dashFlightAndHitboxFollowSharedRoute':True,'priorSoloHitSurvivesAdoption':True}


if __name__ == '__main__':
    lua, core = runtime()
    result = {'array':{'lua':check_array(lua,core)},'thunder':{'lua':check_thunder(lua,core)}}
    with lab() as url:
        result['array']['http'] = check_http(url,ARRAY,'FPA03',96,'destinationX',114)
        result['thunder']['http'] = check_http(url,THUNDER,'FTM03',90,'destinationX',108)
    (ROOT/'evidence/coop-inazuma-flight-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
