"""Exercise two targets backed by one health pool in a shared encounter."""
import json
import math

from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_inazuma_flight import check_adoption, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, exp, hits, share
from test_coop_sumeru_field import SPECS, attack


HERD = ('bathysmal-herd', 'enkanomiya-camp', 'enkanomiya-depth', 'bathysmal-commission')
ART = {'bathysmal-field-poses-source-v1.png', 'rimebiter-idle-source-v1.png',
       'bolteater-idle-source-v1.png'}
COLORS = ('#83eeff', '#dcabff')


def check_relay_view(core, states, bodies, landing):
    for state in states:
        frame = core.frame(state, 'sprite')
        assert list(frame.fieldBoss.relayLandings.values()) == landing
        assert [(b.id, b.x, b.y) for b in frame.fieldBoss.bodies.values()] == [
            (b.id, b.x, b.y) for b in bodies]
        art = [d for d in frame.draws.values() if d.source in ART]
        assert len(art) == 2
        for sprite, body in zip(art, bodies):
            assert math.isclose(sprite.x + frame.camera, body.x) and sprite.y == body.y


def check_lua(lua, core):
    room, states, step = share(core, HERD)
    host, guest, observer, spectator = states
    slot = room.fieldSlot
    ice, lightning = slot.enemy, slot.enemy.fieldPartner
    same = lua.eval('rawequal')
    assert len(room.enemies) == 2 and ice.hp == lightning.hp == 1120
    for state in states:
        assert same(state.enemies[1], ice) and same(state.enemies[2], lightning)
    assert attack(lua, core, host, ice, element='dendro', radial=True, range=300,
                  targetId=None, limit=4) == 19
    assert (ice.aura.element, lightning.aura, lightning.hp) == ('dendro', None, 1101)
    assert attack(lua, core, guest, lightning, element='hydro') == 19
    assert (ice.aura.element, lightning.aura.element, ice.hp) == ('dendro', 'hydro', 1082)

    place_all(states, ice.x, (-98, -102, -220, 320))
    wait_cast(step, slot, 'FBH01', 105)
    assert slot.cast.chosen == 1
    assert [hits(s, ice) for s in states] == [[19], [19], [], []]
    wait_cast(step, slot, 'FBH02', 48)
    cast = slot.cast
    starts = list(cast.starts.values())
    safe = (min(starts) if cast.dir > 0 else max(starts)) - 130 * cast.dir
    for s in states:
        place(s, safe)
    marks = [s.seq for s in states]
    place(host, starts[0] + 93 * cast.dir)
    wait_cast(step, slot, 'FBH02', 135)
    assert cast.shots[1] and not cast.shots[2]
    place(host, safe)
    place(guest, starts[1] + 93 * cast.dir)
    wait_cast(step, slot, 'FBH02', 209)
    assert cast.shots[2]
    assert [hits(s, ice, mark) for s, mark in zip(states, marks)] == [[14], [], [], []]
    assert [hits(s, lightning, mark) for s, mark in zip(states, marks)] == [[], [14], [], []]

    place_all(states, ice.x, (-86, -80, 130, 241))
    wait_cast(step, slot, 'FBH03', 54)
    landing = list(slot.cast.landings.values())
    place(host, landing[0])
    place(guest, landing[0] + 20)
    place(observer, landing[1])
    place(spectator, landing[1] + 120)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FBH03', 96)
    assert (ice.y, lightning.y) == (400, 480)
    check_relay_view(core, states, (ice, lightning), landing)
    for state in states:
        frame = core.frame(state, 'sprite')
        for point, color in zip(landing, COLORS):
            cue = next(d for d in frame.draws.values() if d.color == color and d.y == 473)
            assert math.isclose(cue.x + cue.w / 2 + frame.camera, point)
    assert attack(lua, core, host, ice) == 0
    wait_cast(step, slot, 'FBH03', 125)
    assert (ice.x, ice.y) == (landing[0], 480)
    place(guest, landing[1] - 18)
    wait_cast(step, slot, 'FBH03', 216)
    assert (ice.y, lightning.y) == (480, 400)
    check_relay_view(core, states, (ice, lightning), landing)
    wait_cast(step, slot, 'FBH03', 244)
    assert (lightning.x, lightning.y) == (landing[1], 480)
    assert [hits(s, ice, mark) for s, mark in zip(states, marks)] == [[21], [21], [], []]
    assert [hits(s, lightning, mark) for s, mark in zip(states, marks)] == [[], [21], [21], []]

    assert attack(lua, core, host, ice) == 19
    assert attack(lua, core, guest, lightning, atk=5000) > 0
    assert ice.hp == lightning.hp == 0 and slot.cast is None and slot.phase == 'respawn'
    spec = SPECS[HERD[0]]
    rewards = [(s.kills, s.mora, s.progression.killXp) for s in states]
    assert rewards == [(1, 195, exp(spec)), (1, 195, exp(spec)), (0, 0, 0), (0, 0, 0)]
    assert host.story.quests[HERD[-1]].count == 1 and guest.story.quests[HERD[-1]] is None
    for state in states:
        assert not any(d.source in ART for d in core.frame(state, 'sprite').draws.values())
    room.time = slot.waitUntil - TICK
    step()
    assert slot.generation == 2 and len(room.enemies) == 2
    assert slot.enemy.hp == slot.enemy.fieldPartner.hp == 1120
    check_adoption(core, HERD, 'FBH01', 90, 19)
    return dict(participants=4, sharedHp=1120, separateAuras=True, wideHitCountedOnce=True,
                tailAndRelaysUsePerPlayerWindows=True, breathsHitSeparatePlayers=True,
                landingCuesMatchBothBodies=True, lastHitToLightningDefeatsPair=True,
                oneRewardPerContributor=True, pairedRespawn=True, soloHitSurvivesAdoption=True)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'lua': check_lua(lua, core)}
    with lab() as url:
        result['http'] = check_http(url, HERD, 'FBH03', 96, 'relayLandings', 126, gate=1375)
    (ROOT / 'evidence/coop-bathysmal-lua-http.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result))
