"""Verify shared elemental records, star backlash, and the lion's two forms."""
import json

from runtime import ROOT, native, runtime
from test_coop_anemo import place, wait_cast
from test_coop_inazuma_flight import check_adoption
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, exp, finish, hits, share, SPECS


VIGIL = ('boss-24111101', 'dornman-camp', 'dornman-camp', 'fallen-vigil-commission')
FLUGEL = ('boss-26310501', 'snezhnaya-hub', 'snezhnaya-field', 'flugel-commission')


def cast(lua, state, target, **options):
    return lua.table_from(dict(id=1, atk=1, x=target.x, y=480, dir=1, radial=True, range=24,
                               limit=1, mult=1, color='#ffd685', gain=0, element='physical',
                               startedAt=state.t, critRate=0, targetId=target.id) | options)


def strike(lua, core, state, target, **options):
    hp = target.hp
    core.resolveCast(state, cast(lua, state, target, **options))
    return hp-target.hp


def positions(states, center, offsets=(-89, -94, 155, 232)):
    for state, offset in zip(states, offsets):
        place(state, center+offset)


def check_vigil(lua, core):
    room, states, step = share(core, VIGIL)
    host, guest, observer, _ = states
    room.time, host.t, guest.t, observer.t = 300, 300, 2, 960
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    positions(states, boss.x)
    wait_cast(step, slot, 'FV01', 185)
    assert [hits(s, boss) for s in states] == [[14, 14], [14, 14], [], []]
    wait_cast(step, slot, 'FV02', 54)
    positions(states, slot.cast.center, (0, 14, -138, 160))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FV02', 191)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[18, 18], [18, 18], [], []]

    wait_cast(step, slot, 'FV03', 60)
    monitor = slot.cast
    for state in (guest, host):
        strike(lua, core, state, boss, element='pyro', startedAt=state.t-1)
        strike(lua, core, state, boss, element='pyro', reaction=True)
    assert monitor.counts.pyro is None
    repeated = cast(lua, guest, boss, element='pyro')
    core.resolveCast(guest, repeated)
    core.resolveCast(guest, repeated)
    strike(lua, core, host, boss, element='pyro')
    assert monitor.counts.pyro == 3 and monitor.records[1] == 'pyro' and monitor.recorded
    wait_cast(step, slot, 'FV03', 240)
    for state in (host, guest, guest, host, guest):
        strike(lua, core, state, boss, element='pyro')
    assert monitor.counts.pyro == 5 and monitor.records[2] == 'none' and not monitor.recorded
    for state in (guest, host, host):
        strike(lua, core, state, boss, element='hydro')
    assert monitor.records[2] == 'hydro' and monitor.recorded

    wait_cast(step, slot, 'FV03', 420)
    left, right = monitor.summons[1], monitor.summons[2]
    for state in states:
        f = core.frame(state).fieldBoss
        assert native(f.vigil.records) == ['pyro', 'hydro']
        assert [(u.element, u.hp) for u in f.summons.values()] == [('pyro', 3), ('hydro', 3)]
    strike(lua, core, guest, left, element='hydro', startedAt=guest.t-1)
    strike(lua, core, guest, left, element='hydro', reaction=True)
    strike(lua, core, guest, left, element='pyro')
    assert left.hp == 3
    repeated = cast(lua, guest, left, element='hydro')
    core.resolveCast(guest, repeated)
    core.resolveCast(guest, repeated)
    assert left.hp == 1
    hp, mark = boss.hp, host.seq
    strike(lua, core, host, left)
    step()
    assert boss.hp == hp-30 and len(room.enemies) == 2
    assert any(e.seq>mark and e.kind=='hit' and e.target==boss.id and e.value==30
               for e in host.events.values())
    assert all(core.frame(s).fieldBoss.summons[1].id == right.id for s in states)

    positions(states, boss.x, (-90, 82, -256, 265))
    for state in states:
        state.actors[1].hp = state.actors[1].maxhp
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FV03', 946)
    assert all(not hits(s, boss, mark) for s, mark in zip(states, marks))
    wait_cast(step, slot, 'FV03', 1025)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[26], [26], [], []]
    assert all(s.kills == s.mora == s.progression.killXp == 0 for s in states)
    # Preserve one eligible contributor and let the final star's breaker leave.
    strike(lua, core, host, boss)
    strike(lua, core, guest, right, element='pyro')
    strike(lua, core, guest, right)
    assert right.hp == 0
    boss.hp = 1
    core.detachCoop(guest.coopMember)
    step()
    assert slot.phase == 'respawn' and boss.hp == 0 and len(room.enemies) == 1
    assert [(s.kills,s.mora,s.progression.killXp) for s in states] == [(1,155,exp(SPECS[VIGIL[0]]))]+[(0,0,0)]*3
    assert host.story.quests[VIGIL[-1]].count == 1
    check_adoption(core, VIGIL, 'FV01', 104, 14)
    return dict(participants=4, sharedRecords=['pyro','hydro'], distinctPartyClocks=True,
                prewindowAndReactionRejected=True, repeatElementThreshold=6,
                starHitsDeduplicated=True, backlashAttributedToBreaker=True,
                onlyRemainingWaveHits=True, departingBreakerDoesNotDuplicateRewards=True)


def check_flugel(lua, core):
    room, states, step = share(core, FLUGEL)
    host, guest, observer, _ = states
    room.time, host.t, guest.t, observer.t = 210, 210, 3, 900
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    positions(states, boss.x)
    wait_cast(step, slot, 'FL01', 185)
    assert [hits(s, boss) for s in states] == [[21, 21], [21, 21], [], []]
    wait_cast(step, slot, 'FL02', 111)
    assert boss.form == 'airborne' and all(core.frame(s).fieldBoss.y==boss.y for s in states)
    positions(states, slot.cast.center, (0, 16, -144, 169))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FL02', 221)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[24,24], [24,24], [], []]

    positions(states, boss.x, (-83, 88, 234, 251))
    wait_cast(step, slot, 'FL03', 174)
    assert slot.cast.move.kind == 'thunder' and boss.ward == 8
    repeated = cast(lua, guest, boss, element='cryo')
    core.resolveCast(guest, repeated)
    core.resolveCast(guest, repeated)
    strike(lua, core, host, boss, element='pyro', reaction=True)
    assert boss.ward == 6
    for state, element in ((host,'pyro'),(guest,'cryo'),(host,'dendro')):
        strike(lua, core, state, boss, element=element)
    marks = [s.seq for s in states]
    step()
    step()
    assert boss.form == 'down' and boss.downReason == 'ward' and slot.cast is None
    assert all(not hits(s,boss,mark) for s,mark in zip(states,marks))
    for state in states:
        state.actors[1].hp=state.actors[1].maxhp
    for _ in range(178):
        step()
    assert boss.mode == 'anemo' and boss.ward == 0
    wait_cast(step, slot, 'FL03', 104)
    gale = slot.cast
    assert gale.move.kind == 'gale' and len(room.enemies) == 6
    first, second, third = [gale.summons[i] for i in (1,2,3)]
    strike(lua, core, guest, first, element='pyro', startedAt=guest.t-1)
    strike(lua, core, guest, first, element='pyro', reaction=True)
    assert first.hp == 2
    strike(lua, core, guest, first, element='pyro')
    strike(lua, core, host, second, element='hydro')
    wait_cast(step, slot, 'FL03', 459)
    assert gale.brokenOrbs == 2 and gale.summons[5].x != gale.summons[5].home
    views = [native(core.frame(s).fieldBoss.summons) for s in states]
    assert len(views[0]) == 3 and all(v == views[0] for v in views)
    strike(lua, core, guest, third, element='cryo')
    step()
    assert gale.broken == 460 and gale.absorbed is None and boss.downReason == 'orbs'
    assert len(room.enemies) == 1
    for _ in range(180):
        step()
    assert boss.mode == 'electro' and boss.ward == 8
    for state in (guest, observer):
        strike(lua, core, state, boss, element='cryo', startedAt=state.t-1)
    assert boss.ward == 8
    strike(lua, core, guest, boss, element='cryo')
    assert boss.ward == 6
    positions(states,boss.x,(-70,70,-440,449))
    finish(lua, core, FLUGEL, slot, states)
    check_adoption(core, FLUGEL, 'FL01', 104, 21)
    return dict(participants=4, separateAreaHits=True, sharedFlight=True, oneWardAcrossParties=True,
                wardBreakStopsThunder=True, sharedOrbPositions=True, thirdOrbCancelsGaleAtBoundary=True,
                rearmedWardRejectsOldCasts=True, individualRewards=True)


if __name__ == '__main__':
    lua, core = runtime()
    result = {'vigil': {'lua': check_vigil(lua, core)}, 'flugel': {'lua': check_flugel(lua, core)}}
    del lua, core
    with lab() as url:
        result['vigil']['http'] = check_http(url, VIGIL, 'FV03', 60, 'vigil', 422, gate=970)
    with lab() as url:
        result['flugel']['http'] = check_http(url, FLUGEL, 'FL03', 104, 'flugel', 110, gate=440)
    (ROOT/'evidence/coop-vigil-flugel-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
