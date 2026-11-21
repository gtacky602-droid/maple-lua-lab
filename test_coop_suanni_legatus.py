"""Exercise shared wind/water hit windows and a shared breakable resonator."""
import json
import math

from runtime import ROOT, native, runtime
from test_coop_anemo import place, wait_cast
from test_coop_inazuma_flight import check_adoption, check_air, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack


SUANNI = ('boss-26190101', 'chenyu-camp', 'chenyu-depth', 'suanni-commission')
LEGATUS = ('boss-26140101', 'fontaine-hub', 'nostoi-castle-approach', 'legatus-commission')


def check_suanni(lua, core):
    room, states, step = share(core, SUANNI)
    host, guest, observer, _ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 738
    place_all(states, boss.x, (-68, 108, 170, -220))
    wait_cast(step, slot, 'FSU01', 48)
    assert slot.cast.dir == -1
    wait_cast(step, slot, 'FSU01', 100)
    assert [hits(s, boss) for s in states] == [[16], [], [], []]
    place(guest, boss.x+92)
    place(host, boss.x-68)
    wait_cast(step, slot, 'FSU01', 176)
    assert [hits(s, boss) for s in states] == [[16], [16], [], []]

    wait_cast(step, slot, 'FSU02', 48)
    blades = slot.cast
    place_all(states, blades.origin, (85*blades.dir, 97*blades.dir, -100*blades.dir, -220*blades.dir))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FSU02', 129)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[16], [16], [], []]
    place(guest, blades.origin-95*blades.dir)
    wait_cast(step, slot, 'FSU02', 198)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[16,16], [16], [], []]

    place_all(states, boss.x, (-111, -127, 152, 223))
    wait_cast(step, slot, 'FSU03', 60)
    fall = slot.cast
    dest, direction = fall.dest, fall.dir
    place_all(states, fall.origin, (-52, -108, 116, 200))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FSU03', 117)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[17], [], [], []]
    place_all(states, dest, (0, 19, 108*direction, -148*direction))
    wait_cast(step, slot, 'FSU03', 174)
    assert math.isclose(boss.y, 409.6)
    assert attack(lua, core, guest, boss, atk=1000) == 0
    assert attack(lua, core, guest, boss, y=boss.y) == 19
    check_air(core, states, boss, dest, 'suanni-field-poses-source-v1.png', 142, 0)
    for s in states:
        frame = core.frame(s, 'sprite')
        mark = next(d for d in frame.draws.values() if d.text == '2' and d.color == '#91d6ff')
        assert math.isclose(mark.x + frame.camera, dest)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FSU03', 192)
    assert boss.x == dest and boss.y == 480
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[20], [20], [], []]
    place(host, dest+100*direction)
    place(guest, dest-110*direction)
    wait_cast(step, slot, 'FSU03', 227)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[20], [20], [20], []]
    assert fall.seen[2][host.actors[1]] and fall.seen[2][observer.actors[1]]
    step()
    assert boss.form == 'resting'
    finish(lua, core, SUANNI, slot, states)
    check_adoption(core, SUANNI, 'FSU01', 96, 16)
    return dict(participants=4, hp=738, lockedFrontAndRearHits=True,
                eachWaterBladeCanHitMultiplePlayers=True, fixedLandingAndAirHurtbox=True,
                sharedLandingAndWaveHitOncePerPlayer=True, waveStillHitsMissedPlayer=True,
                individualRewards=True, soloHitPreservedOnJoin=True)


def check_legatus(lua, core):
    room, states, step = share(core, LEGATUS)
    host, guest, *_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 1010
    place_all(states, boss.x, (-93, -107, 160, 242))
    wait_cast(step, slot, 'FLG01', 108)
    assert [hits(s, boss) for s in states] == [[20], [20], [], []]
    wait_cast(step, slot, 'FLG02', 54)
    dash = slot.cast
    place_all(states, dash.origin, (92*dash.dir, dash.dest-dash.origin, -104*dash.dir, -236*dash.dir))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FLG02', 126)
    assert all(core.frame(s).fieldBoss.destinationX==dash.dest for s in states)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[21], [], [], []]
    wait_cast(step, slot, 'FLG02', 150)
    assert math.isclose(boss.x, dash.dest)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[21], [21], [], []]

    normal = attack(lua, core, host, boss)
    place_all(states, boss.x, (-84, -105, 160, 209))
    wait_cast(step, slot, 'FLG03', 54)
    signal, device = slot.cast, slot.cast.summon
    assert len(room.enemies)==2 and boss.form=='resonating' and device.hp==14
    same = lua.eval('rawequal')
    assert all(same(s.enemies[2],device) for s in states)
    assert attack(lua,core,guest,boss)==math.floor(normal*.55)
    wait_cast(step,slot,'FLG03',129)
    assert attack(lua,core,host,device,atk=10)>0
    assert 0<device.hp<14
    for s in states:
        frame=core.frame(s,'sprite')
        assert frame.fieldBoss.form=='resonating' and frame.fieldBoss.summon.hp==device.hp
        bar=next(d for d in frame.draws.values() if d.y==415 and d.color=='#ffb464' and d.h==5)
        assert math.isclose(bar.x+17+frame.camera,device.x) and math.isclose(bar.w,34*device.hp/14)
    wait_cast(step,slot,'FLG03',165)
    assert attack(lua,core,guest,device,atk=10)>0 and device.hp==0
    assert all((s.kills,s.mora,s.progression.killXp)==(0,0,0) for s in states)
    for s in states:
        place(s,signal.resonatorX)
    marks=[s.seq for s in states]
    step()
    assert signal.interrupted and signal.ends==166+144 and len(room.enemies)==1
    assert attack(lua,core,host,boss)==normal
    wait_cast(step,slot,'FLG03',181)
    for s,mark in zip(states,marks):
        view=core.frame(s).fieldBoss
        assert view.form=='staggered' and view.summon is None and not hits(s,boss,mark)

    # The next resonator can still fire if the party leaves it intact.
    place_all(states,boss.x,(-86,-99,140,219))
    wait_cast(step,slot,'FLG03',54)
    signal=slot.cast
    place_all(states,signal.resonatorX,(-12,18,160,-160))
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FLG03',175)
    assert not signal.interrupted and signal.summon is None
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[24],[24],[],[]]
    place_all(states,boss.x,(-86,-99,135,200))
    wait_cast(step,slot,'FLG03',54)
    device=slot.cast.summon
    finish(lua,core,LEGATUS,slot,states)
    assert device.hp==0 and len(room.enemies)==1
    check_adoption(core,LEGATUS,'FLG01',99,20)
    return dict(participants=4,hp=1010,sharedDashPathAndSummonHp=True,
                twoPlayersBreakOnLastTick=True,noRewardForResonator=True,
                uninterruptedFlameHitsPerPlayer=True,armorAndFlameStopTogether=True,
                bossDefeatRemovesResonator=True,soloHitPreservedOnJoin=True)


if __name__ == '__main__':
    lua,core=runtime()
    result={'suanni':{'lua':check_suanni(lua,core)},'legatus':{'lua':check_legatus(lua,core)}}
    with lab() as url:
        result['suanni']['http']=check_http(url,SUANNI,'FSU03',173,'destinationX',207,gate=1310)
        result['legatus']['http']=check_http(url,LEGATUS,'FLG03',90,'summon',140,gate=1050)
    (ROOT/'evidence/coop-suanni-legatus-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
