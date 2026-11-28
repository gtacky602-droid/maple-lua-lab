"""Exercise the Spiritspeaker's shared attack lanes through Lua and HTTP."""
import json

from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, party, share
from test_coop_sumeru_field import attack


CASE = ('boss-25520101', 'natlan-hub', 'natlan-field', 'spiritspeaker-commission')
ART = 'spiritspeaker-field-poses-source-v1.png'


def center(lane):
    return (lane.left + lane.right) / 2


def layout(core, state):
    frame = core.frame(state, 'sprite')
    boss = frame.fieldBoss
    assert boss.echoesVisible and not boss.underground and not boss.summons
    lanes = native(boss.echoLanes)
    sprites = [d for d in frame.draws.values() if d.source == ART]
    assert len(sprites) == 3 and sprites[-1].opacity is None
    assert all(0 < sprite.opacity < 1 and
               abs(sprite.x + frame.camera - (lane['left'] + lane['right']) / 2) < .001
               for sprite, lane in zip(sprites[:2], lanes))
    return lanes


def check_echoes(lua, core):
    room, states, step = share(core, CASE)
    host, guest, observer, spectator = states
    room.time, host.t, guest.t, observer.t, spectator.t = 200, 200, 2, 920, 40
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.hp == boss.maxhp == 1060
    for state in states[:2]:
        place(state, boss.x - 93)
    for state in states[2:]:
        place(state, boss.x + 230)
    wait_cast(step, slot, 'FSP01', 115)
    assert [hits(s, boss) for s in states] == [[19], [19], [], []]
    wait_cast(step, slot, 'FSP02', 54)
    for state in states[:2]:
        place(state, center(slot.cast.lanes[1]))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FSP02', 125)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[21], [21], [], []]

    wait_cast(step, slot, 'FSP03', 64)
    cast = slot.cast
    assert len(room.enemies) == 1
    initial = layout(core, host)
    assert all(layout(core, s) == initial for s in states)
    for state, x in zip(states, (center(cast.lanes[1]), center(cast.lanes[2]), boss.x+220, boss.x+240)):
        place(state, x)
    marks = [s.seq for s in states]
    damage = attack(lua, core, host, boss)
    assert damage>0 and boss.hp==1060-damage and all(core.frame(s).fieldBoss.hp==boss.hp for s in states)
    wait_cast(step, slot, 'FSP03', 154)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[22], [], [], []]

    member = spectator.coopMember
    core.detachCoop(member)
    core.attachCoop(room, spectator, member)
    assert layout(core, spectator) == initial
    place(spectator, center(cast.lanes[2]))
    wait_cast(step, slot, 'FSP03', 225)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[22], [22], [], [22]]
    wait_cast(step, slot, 'FSP03', 240)
    for state in states:
        view = core.frame(state).fieldBoss
        assert view.recoveryTicks == 144 and view.echoLanes is None
    assert len(room.enemies)==1
    finish(lua, core, CASE, slot, states)
    return dict(participants=4, sharedHp=1060, sharedLanes=True, bodyDamageDuringEchoes=damage,
                perPlayerHitGroups=True, preservesLanesOnRejoin=True, individualRewards=True)


def check_adopted_echo(core):
    host, guest = party(core, CASE), party(core, CASE)
    slot = host.fieldSlots[CASE[0]]
    step = lambda: core.step(host, TICK)
    wait_cast(step, slot, 'FSP03', 120)
    cast = slot.cast
    x = center(cast.lanes[1])
    place(host, x)
    wait_cast(step, slot, 'FSP03', 144)
    assert hits(host, slot.enemy)[-1:] == [22]
    room = core.newCoop(host)
    for state in (host, guest):
        core.attachCoop(room, state)
        place(state, x)
    mark = host.seq
    core.stepCoop(room, TICK)
    assert hits(host, slot.enemy, mark) == []
    assert hits(guest, slot.enemy) == [22]
    assert layout(core, host) == layout(core, guest)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'lua': check_echoes(lua, core)}
    check_adoption(core, CASE, 'FSP01', 104, 19)
    check_adopted_echo(core)
    result['lua']['adoptionPreservesBodyAndEchoHits'] = True
    with lab() as url:
        result['http'] = check_http(url, CASE, 'FSP03', 64, 'echoLanes', 240, gate=850)
    (ROOT/'evidence/coop-spiritspeaker-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
