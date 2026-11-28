"""Verify the Emperor's facing and the Seahorse's shared pearl state."""
import json
import math

from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack


EMPEROR = ('boss-26160302', 'fontaine-hub', 'fontaine-field', 'emperor-commission')
SEAHORSE = ('boss-26180101', 'fontaine-hub', 'fontaine-field', 'seahorse-commission')


def check_emperor(lua, core):
    room, states, step = share(core, EMPEROR)
    host, guest, observer, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 980
    place_all(states, boss.x, (-102, -105, 143, 235))
    wait_cast(step, slot, 'FEC01', 42)
    assert slot.cast.dir == -1 and boss.form == 'guarded'
    front = attack(lua, core, host, boss, x=boss.x-55, range=125, atk=100)
    rear = attack(lua, core, guest, boss, x=boss.x+55, range=125, atk=100)
    assert 0 < front < rear and abs(front/rear-.72) < .02
    place(guest, boss.x+104)
    wait_cast(step, slot, 'FEC01', 112)
    assert [hits(s, boss) for s in states] == [[21], [], [], []]
    place(guest, boss.x-96)
    wait_cast(step, slot, 'FEC01', 120)
    assert [hits(s, boss) for s in states] == [[21], [21], [], []]

    wait_cast(step, slot, 'FEC02', 48)
    points = native(slot.cast.points)
    place(host, points[0])
    place(guest, points[1])
    marks = [s.seq for s in states]
    for s in states:
        frame = core.frame(s, 'sprite')
        assert native(frame.fieldBoss.firePoints) == points
        bars = [d for d in frame.draws.values() if d.color == '#ffad66' and d.y == 476 and d.h == 2]
        assert len(bars) == 2
        assert all(math.isclose(d.x+d.w/2+frame.camera,x) for d,x in zip(bars,points))
        numbered = [d for d in frame.draws.values() if d.kind == 'text' and d.color == '#fff1b0']
        assert [d.text for d in numbered] == ['1','2']
        assert all(math.isclose(d.x+frame.camera,x) for d,x in zip(numbered,points))
    wait_cast(step, slot, 'FEC02', 166)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[19], [19], [], []]

    place_all(states, boss.x, (-97, 91, 211, -227))
    wait_cast(step, slot, 'FEC03', 119)
    guest.actors[1].y, guest.actors[1].ground = 390, False
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FEC03', 167)
    assert boss.form == 'guarded'
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[24], [], [], []]
    step()
    assert boss.form == 'exposed'
    for s in states:
        frame = core.frame(s, 'sprite')
        assert frame.fieldBoss.form == 'exposed'
        assert frame.fieldBoss.exposureTicks == 144 and frame.fieldBoss.recovering
        sprite = next(d for d in frame.draws.values() if d.source == 'emperor-field-poses-source-v1.png')
        assert sprite.h == 91
    assert attack(lua, core, host, boss, x=boss.x-55, range=125, atk=100) == rear
    assert attack(lua, core, guest, boss, x=boss.x+55, range=125, atk=100) == rear
    wait_cast(step, slot, 'FEC03', 311)
    step()
    assert boss.form == 'guarded'
    finish(lua, core, EMPEROR, slot, states)
    check_adoption(core, EMPEROR, 'FEC01', 102, 21)
    return dict(participants=4, hp=boss.maxhp, guardedDamage=dict(front=front,rear=rear),
                matchingFireMarkers=True, independentClawAndFireHits=True,
                simultaneousExposure=True, sameDamageOnBothSidesDuringExposure=True,
                soloHitPreservedOnJoin=True, individualRewards=True)


def check_seahorse(lua, core):
    room, states, step = share(core, SEAHORSE)
    host, guest, observer, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1010
    wait_cast(step, slot, 'FSH01', 42)
    assert slot.cast.dir == -1
    place_all(states, boss.x, (-93,-105,170,235))
    wait_cast(step, slot, 'FSH01', 112)
    assert [hits(s, boss) for s in states] == [[21], [21], [], []]

    wait_cast(step, slot, 'FSH02', 48)
    c=slot.cast
    place_all(states,c.origin,(92*c.dir,-94*c.dir,-130*c.dir,-205*c.dir))
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FSH02',118)
    assert c.shots[1] and not c.shots[2]
    place(host,c.origin-100*c.dir)
    place(guest,c.origin+92*c.dir)
    wait_cast(step,slot,'FSH02',168)
    assert c.shots[2]
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[16],[16],[],[]]

    place_all(states,boss.x,(-143,-98,135,238))
    wait_cast(step,slot,'FSH03',54)
    first=slot.cast
    assert first.dest!=first.origin
    assert attack(lua,core,host,boss,x=boss.x,y=392,vertical=8,element='hydro')>0
    assert boss.weakpoint.hits==0 and boss.aura.element=='hydro'
    place_all(states,first.dest,(0,21,102,-118))
    wait_cast(step,slot,'FSH03',114)
    assert boss.y==410 and boss.flying and boss.weakpoint is None and boss.aura.element=='hydro'
    assert attack(lua,core,guest,boss,atk=5000)==0
    assert attack(lua,core,guest,boss,y=boss.y)>0
    marks=[s.seq for s in states]
    for s in states:
        view=core.frame(s,'sprite').fieldBoss
        assert (view.destinationX,view.flying,view.y)==(first.dest,True,boss.y)
    wait_cast(step,slot,'FSH03',134)
    assert boss.y==480 and boss.x==first.dest
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[24],[24],[],[]]

    place_all(states,boss.x,(-96,-94,133,205))
    wait_cast(step,slot,'FSH03',54)
    interrupted,point=slot.cast,boss.weakpoint
    assert point.required==2 and point.hits==0
    for state in states:
        view=core.frame(state,'sprite').fieldBoss
        assert view.coreWindowTicks==42 and view.destinationX==interrupted.dest
    strike=lua.table_from(dict(id=1,atk=20,x=point.x,y=480,dir=1,radial=True,range=125,limit=2,
                              mult=1,color='#fff0ac',gain=0,element='physical',critRate=0))
    core.resolveCast(host,strike)
    core.resolveCast(host,strike)
    assert attack(lua,core,host,boss,x=point.x,reaction=True)>0
    for s in states:
        assert native(core.frame(s).fieldBoss.weakpoint)==native(point) and point.hits==1
    assert attack(lua,core,guest,boss,x=point.x)>0
    assert interrupted.interrupted and interrupted.tick==168 and boss.weakpoint is None
    for s in states:
        view=core.frame(s,'sprite').fieldBoss
        assert view.form=='dim' and view.destinationX is None and view.label=='真珠が消灯・反撃'
        assert view.recovering and view.exposureTicks==144 and view.coreWindowTicks is None
        place(s,interrupted.dest)
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FSH03',311)
    assert boss.y==480 and boss.x==interrupted.origin
    assert all(not hits(s,boss,mark) for s,mark in zip(states,marks))
    step()
    assert boss.form=='pearl' and slot.cast is None
    finish(lua,core,SEAHORSE,slot,states)
    check_adoption(core,SEAHORSE,'FSH01',96,21)
    return dict(participants=4,hp=boss.maxhp,sharedPearlProgress=True,
                separatePlayersCanInterrupt=True,sameCastAndReactionDoNotAdvance=True,
                landingAndHurtboxFollowFlight=True,interruptedDiveDoesNotLand=True,
                soloHitPreservedOnJoin=True,individualRewards=True)


if __name__ == '__main__':
    lua,core=runtime()
    result={'emperor':{'lua':check_emperor(lua,core)},'seahorse':{'lua':check_seahorse(lua,core)}}
    with lab() as url:
        result['emperor']['http']=check_http(url,EMPEROR,'FEC03',169,'form',190,gate=510)
        result['seahorse']['http']=check_http(url,SEAHORSE,'FSH03',57,'weakpoint',144,gate=985)
    (ROOT/'evidence/coop-fontaine-weakpoints-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
