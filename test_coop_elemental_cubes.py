"""Exercise the shared ice, fire and water Hypostasis attacks and rewards."""
import json
import math

from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, party, share
from test_coop_sumeru_field import SPECS, attack


CRYO = ('boss-20040501', 'dragonspine-camp', 'dragonspine-depth', 'cryo-hypostasis-commission')
PYRO = ('boss-20040601', 'inazuma-town', 'inazuma-town', 'pyro-hypostasis-commission')
HYDRO = ('boss-20040401', 'inazuma-port', 'watatsumi-landing', 'hydro-hypostasis-commission')


def around(states, center, offsets):
    for state, offset in zip(states, offsets):
        place(state, center + offset)


def since(states, boss, marks):
    return [hits(state, boss, mark) for state, mark in zip(states, marks)]


def adopt(core, case, move, tick, damage):
    solo, guest = party(core, case), party(core, case)
    slot = solo.fieldSlots[case[0]]
    boss = slot.enemy
    wait_cast(lambda: core.step(solo, TICK), slot, move, tick)
    assert hits(solo, boss) == [damage]
    room = core.newCoop(solo)
    for state in (solo, guest):
        core.attachCoop(room, state)
        place(state, boss.x)
    mark = solo.seq
    core.stepCoop(room, TICK)
    assert hits(solo, boss, mark) == [] and hits(guest, boss) == [damage]


def check_roll(core, states, step, slot, move):
    boss = slot.enemy
    around(states, boss.x, (-100, -96, 100, 180))
    wait_cast(step, slot, move['id'], move['lock'])
    cast = slot.cast
    dest = cast.dest
    assert all(core.frame(s).fieldBoss.destinationX == dest for s in states)
    around(states, cast.origin, (-50, -90, 107, 170))
    marks = [s.seq for s in states]
    wait_cast(step, slot, move['id'], move['active'][0][1]-1)
    assert boss.x == dest and since(states, boss, marks) == [[18], [18], [], []]


def check_marks(core, states, step, slot, move, color):
    boss = slot.enemy
    around(states, boss.x, (-94, -90, 125, 215))
    wait_cast(step, slot, move['id'], move['lock'])
    locked = list(slot.cast.points.values())
    marks = [s.seq for s in states]
    for state, point in zip(states, locked + [boss.x + 190]):
        place(state, point)
    wait_cast(step, slot, move['id'], move['lock']+7)
    for state in states:
        frame = core.frame(state)
        cues = [d.x+state.camera for d in frame.draws.values() if d.kind == 'text' and d.color == color]
        assert len(cues) == 3 and all(math.isclose(x,y) for x,y in zip(cues,locked))
        assert list(frame.fieldBoss.fallPoints.values()) == locked
    wait_cast(step, slot, move['id'], move['active'][-1][1]-1)
    assert since(states, boss, marks) == [[12], [12], [12], []]
    wait_cast(step, slot, move['id'], move['recover'])
    assert all(core.frame(s).fieldBoss.recovering for s in states)


def check_jump(lua, core, states, step, slot, move, source, offset):
    boss = slot.enemy
    around(states, boss.x, (-95, -90, 115, 225))
    wait_cast(step, slot, move['id'], 54)
    dest = slot.cast.dest
    around(states, dest, (0, 22, -113, 123))
    wait_cast(step, slot, move['id'], 96)
    assert boss.y == 368 and attack(lua,core,states[1],boss,atk=5000) == 0
    assert attack(lua,core,states[1],boss,y=boss.y) == 19
    for state in states:
        frame = core.frame(state, 'sprite')
        view = frame.fieldBoss
        assert view.destinationX == dest and view.flying and view.y == boss.y
        art = next(d for d in frame.draws.values() if d.source == source)
        assert math.isclose(art.y, boss.y-offset) and math.isclose(art.x+state.camera,boss.x)
    before = [s.seq for s in states]
    wait_cast(step, slot, move['id'], 125)
    assert boss.x == dest and boss.y == 480 and not core.frame(states[0]).fieldBoss.flying
    assert since(states, boss, before) == [[23], [23], [], []]


def check_cryo(lua, core):
    room, states, step = share(core, CRYO)
    slot = room.fieldSlot
    boss = slot.enemy
    moves = SPECS[CRYO[0]]['moves']
    assert boss.maxhp == 785 and attack(lua,core,states[0],boss,element='cryo') == 0
    check_roll(core, states, step, slot, moves[0])
    around(states, boss.x, (-34, -38, 87, 151))
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FHC02', 101)
    assert since(states, boss, before) == [[17], [17], [], []]
    check_marks(core, states, step, slot, moves[2], '#ffdfa6')
    finish(lua,core,CRYO,slot,states)
    adopt(core,CRYO,'FHC01',135,18)
    return {'participants':4,'iceImmune':True,'wheelAndPalmsHitEachTravelerOnce':True,
            'threeLockedIciclesAndVisibleRecovery':True,'soloHitHistorySurvivesAdoption':True}


def check_pyro(lua, core):
    room, states, step = share(core, PYRO)
    slot = room.fieldSlot
    boss = slot.enemy
    moves = SPECS[PYRO[0]]['moves']
    assert boss.maxhp == 990 and attack(lua,core,states[1],boss,element='pyro') == 0
    check_roll(core, states, step, slot, moves[0])
    around(states, boss.x, (-70, -112, -179, 190))
    wait_cast(step, slot, 'FHP02', 48)
    snake = slot.cast
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FHP02', 110)
    assert snake.shots[1]
    place(states[0], snake.origin+102)
    wait_cast(step, slot, 'FHP02', 150)
    assert snake.shots[2]
    place(states[1], snake.origin+111)
    wait_cast(step, slot, 'FHP02', 196)
    assert snake.shots[3] and since(states,boss,before) == [[12], [12], [12], []]
    check_jump(lua, core, states, step, slot, moves[2], 'pyro-hypostasis-field-poses-source-v1.png', 13)
    finish(lua,core,PYRO,slot,states)
    adopt(core,PYRO,'FHP01',126,18)
    return {'participants':4,'fireImmune':True,'threeProjectilesThreeTravelers':True,
            'airAndGroundHitboxesAndSharedLanding':True,'soloHitHistorySurvivesAdoption':True}


def check_hydro(lua, core):
    room, states, step = share(core, HYDRO)
    slot = room.fieldSlot
    boss = slot.enemy
    moves = SPECS[HYDRO[0]]['moves']
    assert boss.maxhp == 1010 and attack(lua,core,states[0],boss,element='hydro') == 0
    check_jump(lua, core, states, step, slot, moves[0], 'hydro-hypostasis-field-poses-source-v1.png', 15)
    around(states, boss.x, (-93, -97, 110, 205))
    wait_cast(step, slot, 'FHH02', 96)
    ray = slot.cast
    assert ray.dir == -1
    before = [s.seq for s in states]
    around(states, ray.origin, (-151, -155, -191, 205))
    wait_cast(step, slot, 'FHH02', 145)
    assert since(states,boss,before) == [[], [], [17], []]
    check_marks(core, states, step, slot, moves[2], '#ffdfac')
    finish(lua,core,HYDRO,slot,states)
    adopt(core,HYDRO,'FHH01',114,23)
    return {'participants':4,'waterImmune':True,'airAndGroundHitboxesAndSharedLanding':True,
            'rayAndWaveShareOneHitPerTraveler':True,'fixedRainAndRecovery':True,
            'soloHitHistorySurvivesAdoption':True}


if __name__ == '__main__':
    lua, core = runtime()
    result = {'cryo':{'lua':check_cryo(lua,core)}, 'pyro':{'lua':check_pyro(lua,core)},
              'hydro':{'lua':check_hydro(lua,core)}}
    with lab() as url:
        result['cryo']['http'] = check_http(url,CRYO,'FHC01',122,'destinationX',143,gate=1320)
        result['pyro']['http'] = check_http(url,PYRO,'FHP03',96,'destinationX',114,gate=1230)
        result['hydro']['http'] = check_http(url,HYDRO,'FHH01',96,'destinationX',114,gate=1340)
    (ROOT/'evidence/coop-elemental-cubes-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
