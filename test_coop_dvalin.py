"""Exercise one shared weekly attempt across Lua and the local HTTP surface."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, ENTITY = 'boss-29010101', 29010101
TOWN, ROAD, ARENA = 'mond-town', 'mond-road', 'dvalin-sky-arena'
QUEST = 'dvalin-weekly-commission'
SPEC = json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses'][0]
LEVEL = LEVELS[SPEC['level'] - 1]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core, state, node, accepted=False):
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, TOWN)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
        assert state.story.quests[QUEST].status == 'active'
    core.enterStoryNode(state, node)
    place(state, 436)


def party(core, accepted=False):
    state = core.new(12)
    core.action(state, 'story_start')
    prepare(core, state, ARENA, accepted)
    return state


def attack(lua, core, state, part, power, height=480):
    cast = lua.table_from(dict(id=1, atk=power, x=part.x, y=height, dir=1, radial=True,
                               range=110, limit=8, mult=1, gain=0, color='#51ddda',
                               element='physical', critRate=0))
    core.resolveCast(state, cast)


def move(lua, slot, name):
    slot.phase = 'combat'
    slot.cast = lua.table_from(dict(move=SPEC['moves'][name], tick=0, seen=[{}, {}, {}],
                                    bolts={}, dir=1), recursive=True)


def reset_positions(states, offsets):
    for s, x in zip(states, offsets):
        s.actors[1].hp = s.actors[1].maxhp
        place(s, x)


def received(state, since):
    return [e.value for e in state.events.values()
            if e.seq > since and e.kind == 'hurt' and e.target == ENTITY]


def exact_hits(states, marks, expected):
    assert [received(s, mark) for s, mark in zip(states, marks)] == expected


def knock_down(lua, core, states, slot, step):
    host, guest = states[:2]
    hp, guard_hits, breaks = slot.primary.hp, slot.guardHits, slot.breaks
    move(lua, slot, 'WD02')
    wait_cast(step, slot, 'WD02', 120)
    attack(lua, core, host, slot.parts[1], 4)
    attack(lua, core, guest, slot.parts[2], 4)
    assert slot.primary.hp == hp and slot.guard == 18 and slot.guardHits == guard_hits + 2
    assert all(core.frame(s).weeklyBoss.guard == 18 for s in states)
    attack(lua, core, host, slot.parts[1], 40)
    step()
    assert slot.breaks == breaks + 1 and slot.cast.move.id == 'WD08'


def crystal_strike(lua, core, state, slot, power):
    place(state, slot.crystalX)
    state.actors[1].y = 420
    attack(lua, core, state, slot.parts[4], power, height=420)


def test_lua(lua, core):
    states = [party(core, i == 0) for i in range(4)]
    host, guest, seated, outsider = states
    host.t, guest.t, seated.t = 120, 5, 500
    room = core.newCoop(host)
    members = [core.attachCoop(room, state) for state in states]
    same = lua.eval('rawequal')
    slot = room.weeklySlot
    assert slot.primary.hp == 600 and len(room.enemies) == 4
    assert all(same(core.currentWeeklyBoss(s)[0], slot) for s in states)
    assert all(not same(s.weeklySlots[BOSS], slot) for s in states)
    step = lambda:core.stepCoop(room, TICK)

    move(lua, slot, 'WD06')
    reset_positions(states, (431, 447, 175, 682))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'WD06', 191)
    exact_hits(states, marks, [[28], [28], [], []])
    assert slot.cast.zone == 2
    assert all(core.frame(s).weeklyBoss.tick == 191 for s in states)

    move(lua, slot, 'WD04')
    reset_positions(states, (436, 439, 170, 690))
    wait_cast(step, slot, 'WD04', 54)
    target = slot.cast.targets[1]
    reset_positions(states, (target - 2, target + 2, 170, 690))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'WD04', 170)
    exact_hits(states, marks, [[16, 16], [16, 16], [], []])

    move(lua, slot, 'WD03')
    reset_positions(states, (436, 436, 170, 690))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'WD03', 236)
    exact_hits(states, marks, [[12, 12], [12, 12], [], []])

    move(lua, slot, 'WD05')
    reset_positions(states, (431, 447, 175, 682))
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'WD05', 179)
    for _ in range(65):
        step()
    exact_hits(states, marks, [[10, 10], [10, 10], [], []])
    assert slot.hazard.zone == 2

    reset_positions(states, (431, 447, 175, 682))
    knock_down(lua, core, states, slot, step)
    wait_cast(step, slot, 'WD08', 42)
    assert all(same(s.platforms, room.platforms) and s.platforms[4].y == 420 for s in states)
    attack(lua, core, guest, slot.parts[4], 1000)
    assert slot.primary.hp == 600
    crystal_strike(lua, core, host, slot, 24)
    crystal_strike(lua, core, guest, slot, 24)
    for state in (host, guest):
        view = core.frame(state).weeklyBoss.crystal
        assert view.remaining == 420 and view.damage == 600-slot.primary.hp
    assert all(core.frame(s).weeklyBoss.hp == 556 for s in states)
    assert validate_save(native(core.checkpoint(host)))['weeklyBosses'][BOSS]['hp'] == 600

    core.detachCoop(members[1])
    assert core.currentWeeklyBoss(guest)[0].primary.hp == 600
    assert len(guest.platforms) == 3 and slot.primary.hp == 556
    core.attachCoop(room, guest, members[1])
    assert core.currentWeeklyBoss(guest)[0].primary.hp == 556 and guest.platforms[4].y == 420
    wait_cast(step, slot, 'WD08', 461)
    for s in states[:2]:
        place(s, slot.crystalX)
        s.actors[1].y = 420
    for _ in range(73):
        step()
    assert all(s.actors[1].y == 480 and len(s.platforms) == 3 for s in states[:2])

    reset_positions(states, (436, 438, 175, 680))
    knock_down(lua, core, states, slot, step)
    wait_cast(step, slot, 'WD08', 42)
    crystal_strike(lua, core, guest, slot, 1000)
    assert slot.waitUntil and slot.phase == 'respawn' and len(room.enemies) == 0
    assert [s.kills for s in states] == [1, 1, 0, 0]
    assert [s.mora for s in states] == [300, 300, 0, 0]
    assert [s.progression.killXp for s in states] == [EXP, EXP, 0, 0]
    assert host.story.quests[QUEST].count == 1 and guest.story.quests[QUEST] is None
    assert host.endgame.bosses[BOSS].clears == guest.endgame.bosses[BOSS].clears == 1
    assert host.endgame.bosses[BOSS].bestTicks == guest.endgame.bosses[BOSS].bestTicks
    for state in states[:2]:
        saved = validate_save(native(core.checkpoint(state)))
        assert saved['weeklyBosses'][BOSS]['hp'] == 0
        assert saved['weeklyBosses'][BOSS]['waitTicks'] == 3600
        reload = core.restore(lua.table_from(saved, recursive=True), 12)
        assert reload.weeklySlots[BOSS].waitUntil and reload.weeklySlots[BOSS].primary.hp == 0
    assert core.frame(seated).weeklyBoss.phase == 'respawn'
    assert seated.weeklySlots[BOSS].waitUntil is None
    room.time = slot.waitUntil-TICK
    step()
    assert slot.generation == 2 and slot.primary.hp == 600 and len(room.enemies) == 4
    # The cleared parties can help in a new room, but their cooldown still applies.
    for member in members:
        core.detachCoop(member)
    fresh = core.newCoop(seated)
    for state in states:
        core.attachCoop(fresh, state)
    slot = fresh.weeklySlot
    step = lambda:core.stepCoop(fresh, TICK)
    reset_positions(states, (436, 438, 175, 680))
    knock_down(lua, core, states, slot, step)
    wait_cast(step, slot, 'WD08', 42)
    crystal_strike(lua, core, host, slot, 1000)
    assert [s.kills for s in states] == [1, 1, 0, 0]


def check_adoption(lua, core):
    solo, guest = party(core), party(core)
    slot = solo.weeklySlots[BOSS]
    move(lua, slot, 'WD06')
    wait_cast(lambda:core.step(solo, TICK), slot, 'WD06', 180)
    assert received(solo, 0) == [28]
    room = core.newCoop(solo)
    for state in (solo, guest):
        core.attachCoop(room, state)
        place(state, 436)
    marks = [solo.seq, guest.seq]
    core.stepCoop(room, TICK)
    exact_hits((solo, guest), marks, [[], [28]])


def test_http(url):
    players = [Client(url), Client(url)]
    for i, client in enumerate(players):
        client.frame(['story_start'])
        with LOCK:
            info = SESSIONS[client.sid]
            prepare(info['core'], info['state'], TOWN, i == 0)
        cross(client, 1380, ROAD)
    code = players[0].frame(['coop_create'])['coop']['code']
    assert players[1].frame(['coop_join:' + code])['coop']['code'] == code
    for client in players:
        assert cross(client, 1280, ARENA)['weeklyBoss']['maxhp'] == 600
    with LOCK:
        a,b = [SESSIONS[c.sid] for c in players]
        lua,core = a['lua'],a['core']
        states = [a['state'],b['state']]
        room = a['coop_room'].worlds[ARENA]
        slot = room.weeklySlot
        step = lambda:core.stepCoop(room,TICK)
        reset_positions(states, (436, 439))
        knock_down(lua, core, states, slot, step)
        wait_cast(step, slot, 'WD08', 42)
        crystal_strike(lua, core, states[0], slot, 24)
    for client in players:
        frame = client.frame()
        assert frame['weeklyBoss']['hp'] == 578 and frame['weeklyBoss']['exposed']
        assert frame['coop']['enemies'] == [{'id':ENTITY,'hp':578,'maxhp':600}]
        assert cross(client, 35, ROAD)['coop']['code'] == code
    frozen = room.tick, slot.cast.tick
    advance(*players, .2)
    assert (room.tick, slot.cast.tick) == frozen
    for client in players:
        assert cross(client, 1280, ARENA)['weeklyBoss']['hp'] == 578
    with LOCK:
        for state in states:
            place(state, slot.crystalX)
        crystal_strike(lua, core, states[0], slot, 24)
        crystal_strike(lua, core, states[1], slot, 1000)
    for i, client in enumerate(players):
        save = client.frame(checkpoint=True)['checkpoint']
        assert save['weeklyBosses'][BOSS]['hp'] == 0
        assert save['endgame']['bosses'][BOSS]['clears'] == 1
        assert save['progression']['killXp'] == EXP and save['mora'] == 300
        assert (save['story']['quests'].get(QUEST) or {}).get('count') == (1 if i == 0 else None)
    return {'participants':2, 'emptyArenaFreezesExposure':True, 'sharedCrystalHpOnReturn':True,
            'separateWeeklyProgressAndReward':True}


if __name__ == '__main__':
    lua,core = runtime()
    fixture = core.new(12)
    core.action(fixture, 'story_start')
    prepare(core, fixture, TOWN)
    data = validate_save(native(core.checkpoint(fixture)))
    (ROOT/'work/dvalin-weekly-fixture.json').write_text(json.dumps(data),encoding='utf8')
    fixture.story.quests['amber-join'] = lua.table_from(
        {'status':'complete', 'count':4, 'cycles':1,
         'recovered':{'basket':True, 'toolbox':True, 'crate':True}}, recursive=True)
    fixture.actors[2].hp = fixture.actors[2].maxhp
    browser_fixture = validate_save(native(core.checkpoint(fixture)))
    (ROOT/'work/dvalin-weekly-party-fixture.json').write_text(json.dumps(browser_fixture), encoding='utf8')
    test_lua(lua, core)
    check_adoption(lua,core)
    result = {'lua':dict(participants=4, sharedPostureAndCrystal=True, perPartyFootingAndDamage=True,
                         independentWindPairsAndBreathCooldownAndFloor=True, soloHitPreservedOnAdoption=True,
                         sharedRespawnAndSeparateCooldown=True, guardContributionEarnsReward=True)}
    del lua,core
    with lab() as url:
        result['http'] = test_http(url)
    (ROOT/'evidence/coop-dvalin-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
