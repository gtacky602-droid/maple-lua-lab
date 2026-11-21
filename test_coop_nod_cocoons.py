"""Exercise per-player cocoons and the shared Moonstone Anchor in co-op."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, exp, finish, hits, party, share, SPECS
from test_coop_sumeru_field import attack


FLY = ('boss-26301101', 'nod-town', 'nod-field', 'moonfly-commission')
GECKO = ('boss-26302101', 'nod-town', 'nod-field', 'moongecko-commission')


def frame(core, state):
    return core.frame(state, 'sprite')


def arrange(states, boss):
    for party, offset in zip(states, (-88, 105, 156, 260)):
        place(party, boss.x+offset)
        party.actors[1].hp = party.actors[1].maxhp


def check_fly(lua, core):
    room, states, step = share(core, FLY)
    lead, guest, rejoin, observer = states
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    arrange(states, boss)
    wait_cast(step, slot, 'FMF03', 60)
    arrange(states, boss)
    marks = [party.seq for party in states]
    wait_cast(step, slot, 'FMF03', 96)
    assert [hits(s, boss, mark) for s, mark in zip(states, marks)] == [[12], [12], [12], []]
    for party in states[:3]:
        marks = frame(core, party).radiantCocoons
        assert marks[1].actor == 1 and marks[1].bound and marks[2] is None
    peer_view = frame(core, observer)
    assert peer_view.radiantCocoons is None
    assert sum(d.text == '集光の繭' for d in peer_view.draws.values()) == 3
    assert core.healActor(lead, lead.actors[1], 10) == 7
    core.healActor(lead, lead.actors[1], 30)
    step()
    assert not frame(core, lead).radiantCocoons[1].bound
    assert frame(core, guest).radiantCocoons[1].bound
    assert attack(lua, core, lead, boss, atk=24) == 27
    assert attack(lua, core, guest, boss, atk=24) == 17
    assert attack(lua, core, observer, boss, atk=24) == 22
    place(observer, boss.x+440)

    member = rejoin.coopMember
    core.detachCoop(member)
    assert frame(core, rejoin).radiantCocoons is None
    core.attachCoop(room, rejoin, member)
    assert frame(core, rejoin).radiantCocoons is None
    assert frame(core, guest).radiantCocoons[1].bound
    wait_cast(step, slot, 'FMF03', 170)
    assert all(frame(core, s).fieldBoss.element == 'pyro' for s in states)
    attack(lua, core, guest, boss, element='hydro')
    assert all(frame(core, s).fieldBoss.element == 'dendro' for s in states)
    finish(lua, core, FLY, slot, states)
    assert all(frame(core, party).radiantCocoons is None for party in states)
    return dict(participants=4, bindingsAndHealingArePerActor=True, visiblePartyEffects=True,
                escapeDamage=[27, 17, 22], mapExitClearsOnlyLeaver=True,
                sharedWingElement=True, defeatClearsEveryCocoon=True)


def anchor_cast(lua, party, unit, **options):
    return lua.table_from(dict(id=1, atk=24, x=unit.x, y=480, dir=1, radial=True, range=24,
                               limit=1, mult=1, color='#fff1bc', gain=0, element='physical',
                               startedAt=party.t, critRate=0, targetId=unit.id) | options)


def check_gecko(lua, core):
    room, states, step = share(core, GECKO)
    host, guest, observer, _ = states
    room.time, host.t, guest.t, observer.t = 300, 300, 2, 960
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    arrange(states, boss)
    wait_cast(step, slot, 'FMG03', 60)
    arrange(states, boss)
    wait_cast(step, slot, 'FMG03', 112)
    cast, hp = slot.cast, boss.hp
    unit = cast.summon
    assert all(frame(core, s).fieldBoss.summon.hp == 5 for s in states)
    for party in states:
        core.resolveCast(party, anchor_cast(lua, party, unit, startedAt=party.t-1))
        core.resolveCast(party, anchor_cast(lua, party, unit, reaction=True))
    assert unit.hp == 5
    repeated = anchor_cast(lua, host, unit)
    core.resolveCast(host, repeated)
    core.resolveCast(host, repeated)
    core.resolveCast(guest, anchor_cast(lua, guest, unit, element='geo'))
    assert all(frame(core, s).fieldBoss.summon.hp == 2 for s in states)
    marks = [s.seq for s in states]
    core.resolveCast(guest, anchor_cast(lua, guest, unit, element='geo'))
    step()
    events = [[e.value for e in s.events.values() if e.seq>mark and e.kind=='hit' and e.target==boss.id]
              for s, mark in zip(states, marks)]
    assert events == [[], [34], [], []] and boss.hp == hp-34 and boss.form == 'down'
    assert len(room.enemies) == 1 and cast.summon is None
    assert all(s.kills == s.mora == s.progression.killXp == 0 for s in states)

    core.healActor(guest, guest.actors[1], 40)
    step()
    assert all(frame(core, s).fieldBoss.geoExposureTicks == 480 for s in states)
    assert frame(core, host).radiantCocoons[1].bound and not frame(core, guest).radiantCocoons[1].bound
    assert attack(lua, core, guest, boss, element='geo', atk=24) == 24
    assert attack(lua, core, states[3], boss, element='geo', atk=24) == 20
    # Restore the comparison actor's exclusion from settlement.
    place(states[3], boss.x+440)
    finish(lua, core, GECKO, slot, states)
    assert all(frame(core, party).radiantCocoons is None for party in states)
    return dict(participants=4, rejectsOldCastsAndReactions=True, sharedAnchorLayers=[5, 2, 0],
                backlashAttributedToBreaker=True, sharedGeoExposureTicks=480,
                personalEscapeBonus=True, individualRewards=True)


def check_disconnected_breaker(lua, core):
    room, states, step = share(core, GECKO)
    host, breaker, *_ = states
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    arrange(states, boss)
    wait_cast(step, slot, 'FMG03', 60)
    arrange(states, boss)
    wait_cast(step, slot, 'FMG03', 112)
    unit = slot.cast.summon
    assert attack(lua, core, host, boss)>0
    for _ in range(3):
        core.resolveCast(breaker, anchor_cast(lua, breaker, unit, element='geo'))
    assert unit.hp == 0
    boss.hp = 1
    core.detachCoop(breaker.coopMember)
    step()
    assert slot.phase == 'respawn' and boss.hp == 0 and len(room.enemies) == 1
    assert [(s.kills,s.mora,s.progression.killXp) for s in states] == [(1,495,exp(SPECS[GECKO[0]]))]+[(0,0,0)]*3
    assert host.story.quests[GECKO[-1]].count == 1


def write_fixture(core, case, key, attack_skill):
    state = party(core, case)
    core.enterStoryNode(state, case[1])
    # A low-level flower gives a single healing field room to recover a missed jump.
    assert core.giveArtifact(state, 1, 68, 3)
    core.action(state, 'artifact_equip:1')
    assert 440 <= state.actors[1].maxhp <= 510
    saved = validate_save(native(core.checkpoint(state)))
    saved['companion'] = 'wanderer'
    saved['loadout'][0] = ['SK18']
    saved['loadout'][1] = [attack_skill]
    (ROOT/'work'/f'coop-{key}-fixture.json').write_text(json.dumps(saved), encoding='utf8')


if __name__ == '__main__':
    lua, core = runtime()
    result = {'moonfly': {'lua': check_fly(lua, core)}, 'moongecko': {'lua': check_gecko(lua, core)}}
    check_disconnected_breaker(lua, core)
    result['moongecko']['lua']['lethalBacklashAfterBreakerLeavesSettlesOnce'] = True
    write_fixture(core, FLY, 'moonfly', 'SK17')
    write_fixture(core, GECKO, 'moongecko', 'SK05')
    del lua, core
    with lab() as url:
        result['moonfly']['http'] = check_http(url, FLY, 'FMF03', 96, 'label', 114, gate=180)
    with lab() as url:
        result['moongecko']['http'] = check_http(url, GECKO, 'FMG03', 112, 'summon', 140, gate=1260)
    (ROOT/'evidence/coop-nod-cocoons-lua-http.json').write_text(
        json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
