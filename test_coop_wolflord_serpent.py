"""Check the co-op paths, projectiles and surface state of two field bosses."""
import json
import math

from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption, check_air, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack

WOLF = ('boss-22060101', 'inazuma-port', 'tsurumi-coast', 'wolflord-commission')
SERPENT = ('boss-24010401', 'chasm-camp', 'chasm-wp-25264', 'ruin-serpent-commission')
WOLF_ART = 'wolflord-field-poses-source-v1.png'
SERPENT_ART = 'ruin-serpent-field-poses-source-v1.png'


def recent_hits(states, boss, marks):
    return [hits(state,boss,mark) for state,mark in zip(states,marks)]


def check_skull(core, states, index):
    positions = []
    for state in states:
        frame = core.frame(state,'sprite')
        skull = next(p for p in frame.fieldBoss.skulls.values() if p.index == index)
        positions.append((skull.x,skull.y))
        art = next(d for d in frame.draws.values() if d.source == WOLF_ART and d.h == 27 and
                   math.isclose(d.y,skull.y+13))
        assert math.isclose(art.x+state.camera,skull.x)
    assert positions == [positions[0]]*len(states)


def check_wolf(lua, core):
    room, states, step = share(core,WOLF)
    host, guest, observer, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1100
    place_all(states,boss.x,(-98,-95,105,200))
    wait_cast(step,slot,'FWL01',60)
    dest = slot.cast.dest
    place_all(states,dest,(0,16,-110,233))
    wait_cast(step,slot,'FWL01',102)
    assert boss.y == 410 and attack(lua,core,guest,boss,atk=5000) == 0
    assert attack(lua,core,guest,boss,y=boss.y) == 19
    check_air(core,states,boss,dest,WOLF_ART,86,44)
    marks = [s.seq for s in states]
    wait_cast(step,slot,'FWL01',155)
    assert boss.x == dest and boss.y == 480
    assert recent_hits(states,boss,marks) == [[22],[22],[],[]]

    place_all(states,boss.x,(-107,-95,130,230))
    wait_cast(step,slot,'FWL02',48)
    assert slot.cast.dir == -1
    place_all(states,boss.x,(98,94,-119,227))
    marks = [s.seq for s in states]
    wait_cast(step,slot,'FWL02',125)
    assert recent_hits(states,boss,marks) == [[20],[20],[],[]]

    place_all(states,boss.x,(-93,-121,104,200))
    wait_cast(step,slot,'FWL03',48)
    assert slot.cast.dir == -1
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FWL03',86)
    check_skull(core,states,1)
    wait_cast(step,slot,'FWL03',108)
    assert slot.cast.shots[1]
    place(host,boss.x+100)
    wait_cast(step,slot,'FWL03',122)
    check_skull(core,states,2)
    wait_cast(step,slot,'FWL03',147)
    assert slot.cast.shots[2] and recent_hits(states,boss,marks) == [[14],[14],[],[]]
    wait_cast(step,slot,'FWL03',168)
    assert len(core.frame(observer).fieldBoss.skulls) == 0
    finish(lua,core,WOLF,slot,states)
    check_adoption(core,WOLF,'FWL01',149,22,rejoin_dx=-15)
    return {'participants':4,'sharedRamAndRaisedHitbox':True,'tailBehindOnly':True,
            'movingSkullsMatchCollisionAndSeparateHits':True,'priorSoloHitSurvivesAdoption':True}


def check_serpent(lua, core):
    room, states, step = share(core,SERPENT)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 900
    place_all(states,boss.x,(-90,-93,108,208))
    wait_cast(step,slot,'FRS01',48)
    assert slot.cast.dir == -1
    place(guest,boss.x+94)
    wait_cast(step,slot,'FRS01',108)
    assert [hits(s,boss) for s in states] == [[14],[],[],[]]
    place(guest,boss.x-94)
    wait_cast(step,slot,'FRS01',131)
    assert [hits(s,boss) for s in states] == [[14],[14],[],[]]
    wait_cast(step,slot,'FRS02',54)
    burrow = slot.cast
    origin,dest = burrow.origin,burrow.dest
    assert attack(lua,core,host,boss,element='hydro') > 0
    place_all(states,dest,(0,24,-113,122))
    wait_cast(step,slot,'FRS02',96)
    assert boss.x == origin and attack(lua,core,guest,boss,atk=5000) == 0
    assert boss.aura.element == 'hydro' and boss.hitTop is None
    for state in states:
        frame = core.frame(state,'sprite')
        assert frame.fieldBoss.emergeX == dest and frame.fieldBoss.underground
        assert not any(d.source == SERPENT_ART for d in frame.draws.values())
        cue = next(d for d in frame.draws.values() if d.color == '#ed9e57' and d.h == 3)
        assert math.isclose(cue.x+cue.w/2+state.camera,dest)
    wait_cast(step,slot,'FRS02',114)
    assert boss.x == dest and core.canTargetEnemy(boss)
    assert attack(lua,core,guest,boss,range=125) > 0
    marks = [s.seq for s in states]
    wait_cast(step,slot,'FRS02',149)
    assert recent_hits(states,boss,marks) == [[18],[18],[],[]]

    place_all(states,boss.x,(-105,-95,100,178))
    wait_cast(step,slot,'FRS03',48)
    points = list(slot.cast.landings.values())
    around = [*points, boss.x+160]
    for state,x in zip(states,around):
        place(state,x)
    marks = [s.seq for s in states]
    wait_cast(step,slot,'FRS03',105)
    for state in states:
        assert list(core.frame(state).fieldBoss.bombPoints.values()) == points
    wait_cast(step,slot,'FRS03',197)
    assert recent_hits(states,boss,marks) == [[11],[11],[11],[]]
    finish(lua,core,SERPENT,slot,states)

    room, states, step = share(core,SERPENT)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    wait_cast(step,slot,'FRS02',30)
    attack(lua,core,host,boss,element='dendro')
    attack(lua,core,guest,boss,element='pyro')
    assert boss.burning
    wait_cast(step,slot,'FRS02',80)
    assert boss.underground
    place_all(states,boss.x,(-80,-92,103,195))
    marks = [s.seq for s in states]
    boss.hp = 1
    boss.burning.next = room.time+TICK
    step()
    assert slot.phase == 'respawn' and slot.cast is None
    for _ in range(100):
        step()
    assert recent_hits(states,boss,marks) == [[],[],[],[]]
    assert [s.kills for s in states] == [1,1,0,0]
    return {'participants':4,'hiddenUntargetableButAuraRemains':True,'sharedEmergenceAndBombPoints':True,
            'threeBombsCanHitThreeTravelers':True,'burningKillCancelsEmergence':True}


if __name__ == '__main__':
    lua, core = runtime()
    result={'wolflord':{'lua':check_wolf(lua,core)},'serpent':{'lua':check_serpent(lua,core)}}
    with lab() as url:
        result['wolflord']['http'] = check_http(url,WOLF,'FWL01',102,'destinationX',120,gate=1340)
        result['serpent']['http'] = check_http(url,SERPENT,'FRS02',96,'emergeX',114,gate=1360)
    (ROOT/'evidence/coop-wolflord-serpent-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
