"""Verify that the mimics and mask stay on one shared battle clock."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_sumeru_field import SPECS, attack
from test_coop_travel import cross

OCEANID = ('boss-20050101', 'liyue-harbor', 'oceanid-approach', 'oceanid-commission')
MAGUU = ('boss-25090101', 'inazuma-port', 'maguu-approach', 'maguu-commission')


def exp(spec):
    return LEVELS[spec['level'] - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def prepare(core, state, case, node, accepted):
    boss_id, hub, _, quest = case
    level = LEVELS[SPECS[boss_id]['level'] - 1]
    core.grantExp(state, level['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if accepted:
        core.action(state, 'story_accept:' + quest)
        assert state.story.quests[quest].status == 'active'
    core.enterStoryNode(state, node)


def party(core, case, accepted=False):
    spec = SPECS[case[0]]
    state = core.new(12)
    core.action(state, 'story_start')
    prepare(core, state, case, spec['node'], accepted)
    place(state, spec['home'] - 93)
    return state


def share(core, case):
    states = [party(core, case, i == 0) for i in range(4)]
    room = core.newCoop(states[0])
    for state in states:
        core.attachCoop(room, state)
    return room, states, lambda: core.stepCoop(room, TICK)


def hits(state, enemy, since=0):
    return [e.value for e in state.events.values()
            if e.seq > since and e.kind == 'hurt' and e.target == enemy.id]


def finish(lua, core, case, slot, states):
    spec = SPECS[case[0]]
    boss = slot.enemy
    for state, offset in zip(states[:2], (-70, 70)):
        place(state, boss.x + offset)
    assert attack(lua, core, states[0], boss, x=boss.x - 70, range=125) > 0
    assert attack(lua, core, states[1], boss, x=boss.x + 70, range=125, atk=5000) > 0
    assert slot.cast is None and slot.phase == 'respawn'
    rewards = [(s.kills, s.mora, s.progression.killXp) for s in states]
    assert rewards == [(1, spec['mora'], exp(spec))] * 2 + [(0, 0, 0)] * 2
    assert states[0].story.quests[case[-1]].count == 1
    assert states[1].story.quests[case[-1]] is None


def check_oceanid(lua, core):
    room, states, step = share(core, OCEANID)
    host, guest, observer, spectator = states
    slot = room.fieldSlot
    boss = slot.enemy
    same = lua.eval('rawequal')
    assert boss.maxhp == 900 and len(room.enemies) == 1
    assert all(same(s.enemies[1], boss) for s in states)
    assert attack(lua, core, host, boss, y=247, vertical=32) == 0
    assert attack(lua, core, guest, boss, element='hydro') == 0
    place(observer, boss.x + 108)
    place(spectator, boss.x + 210)
    wait_cast(step, slot, 'FO01', 42)
    boar = slot.cast
    dest = boar.dest
    for state in states[:2]:
        place(state, boar.origin - 68)
    wait_cast(step, slot, 'FO01', 113)
    assert boss.x == dest and [hits(s, boss) for s in states] == [[14], [14], [], []]

    for state, offset in zip(states, (-60, -108, 105, 215)):
        place(state, boss.x + offset)
    wait_cast(step, slot, 'FO02', 1)
    assert attack(lua, core, host, boss, element='cryo') > 0 and boss.aura.element == 'cryo'
    aura = boss.aura
    hp = boss.hp
    wait_cast(step, slot, 'FO02', 18)
    assert boss.form == 'crane' and boss.hp == hp and same(boss.aura, aura) and same(room.enemies[1], boss)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FO02', 101)
    assert slot.cast.shots[1] and not slot.cast.shots[2]
    place(host, boss.x + 104)
    wait_cast(step, slot, 'FO02', 153)
    assert slot.cast.shots[2]
    assert [hits(s, boss, seq) for s, seq in zip(states, marks)] == [[12], [12], [], []]

    wait_cast(step, slot, 'FO03', 54)
    frog = slot.cast
    dest = frog.dest
    for state, offset in zip(states, (0, 24, -110, 120)):
        place(state, dest + offset)
    wait_cast(step, slot, 'FO03', 96)
    assert boss.y == 368 and attack(lua, core, guest, boss, atk=3000) == 0
    assert attack(lua, core, guest, boss, y=boss.y) == 19
    for state in states:
        frame = core.frame(state, 'sprite')
        view = frame.fieldBoss
        assert view.flying and view.landingX == dest and view.y == boss.y
        art = next(d for d in frame.draws.values() if d.source == 'oceanid-frog-source-v1.png')
        assert art.y == boss.y and math.isclose(art.x + state.camera, boss.x)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FO03', 125)
    assert boss.x == dest and boss.y == 480
    assert [hits(s, boss, seq) for s, seq in zip(states, marks)] == [[21], [21], [], []]
    finish(lua, core, OCEANID, slot, states)

    solo, newcomer = party(core, OCEANID), party(core, OCEANID)
    live = solo.fieldSlots[OCEANID[0]]
    wait_cast(lambda: core.step(solo, TICK), live, 'FO01', 112)
    assert hits(solo, live.enemy) == [14]
    adopted = core.newCoop(solo)
    for state in (solo, newcomer):
        core.attachCoop(adopted, state)
        place(state, live.cast.dest)
    mark = solo.seq
    core.stepCoop(adopted, TICK)
    assert hits(solo, live.enemy, mark) == [] and hits(newcomer, live.enemy) == [14]
    return {'participants': 4, 'singleHpAndAuraAcrossForms': True, 'wavesHitSeparateTravelers': True,
            'frogSpriteAndHitboxFollowLockedLanding': True, 'priorSoloHitSurvivesAdoption': True}


def check_maguu(lua, core):
    room, states, step = share(core, MAGUU)
    host, guest, observer, spectator = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 900
    place(observer, boss.x + 110)
    place(spectator, boss.x + 205)
    wait_cast(step, slot, 'FMK01', 54)
    locked = slot.cast.dir
    place(guest, boss.x + 96)
    wait_cast(step, slot, 'FMK01', 126)
    assert slot.cast.dir == locked == -1
    place(guest, boss.x - 90)
    wait_cast(step, slot, 'FMK01', 137)
    assert [hits(s, boss) for s in states] == [[22], [22], [], []]
    wait_cast(step, slot, 'FMK02', 149)
    assert [hits(s, boss) for s in states] == [[22, 13, 13]] * 2 + [[], []]
    wait_cast(step, slot, 'FMK03', 48)
    cast = slot.cast
    first_x = core.frame(host).fieldBoss.maskX
    assert cast.dir == -1 and first_x == cast.origin - 44
    place(guest, cast.origin - 165)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FMK03', 132)
    expected_x = first_x - (132 - 90) * 3 * 88 / 60
    for state in states:
        frame = core.frame(state, 'sprite')
        art = next(d for d in frame.draws.values() if d.source == 'maguu-mask-source-v1.png')
        assert math.isclose(frame.fieldBoss.maskX, expected_x)
        assert math.isclose(art.x + state.camera, expected_x)
    assert [hits(s, boss, seq) for s, seq in zip(states, marks)] == [[17], [17], [], []]
    wait_cast(step, slot, 'FMK03', 144)
    assert all(core.frame(s).fieldBoss.maskX is None for s in states)
    finish(lua, core, MAGUU, slot, states)

    solo, newcomer = party(core, MAGUU), party(core, MAGUU)
    live = solo.fieldSlots[MAGUU[0]]
    wait_cast(lambda: core.step(solo, TICK), live, 'FMK02', 84)
    adopted = core.newCoop(solo)
    for state in (solo, newcomer):
        core.attachCoop(adopted, state)
        place(state, live.enemy.x - 93)
    mark = solo.seq
    core.stepCoop(adopted, TICK)
    assert hits(solo, live.enemy, mark) == [] and hits(newcomer, live.enemy) == [13]
    wait_cast(lambda: core.stepCoop(adopted, TICK), live, 'FMK02', 144)
    assert hits(solo, live.enemy, mark) == [13] and hits(newcomer, live.enemy) == [13, 13]
    return {'participants': 4, 'fixedDirection': True, 'twoHitsPerTraveler': True,
            'oneMovingMaskForAll': True, 'priorSoloHitSurvivesAdoption': True}


def check_http(url, case, move, tick, coordinate, after, gate=1270):
    boss_id, _, entry, quest = case
    spec = SPECS[boss_id]
    clients = [Client(url), Client(url)]
    for i, client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            prepare(env['core'], env['state'], case, entry, i == 0)
    code = clients[0].frame(['coop_create'])['coop']['code']
    assert clients[1].frame(['coop_join:' + code])['coop']['code'] == code
    for client in clients:
        assert cross(client, gate, spec['node'])['coop']['code'] == code
    with LOCK:
        h, g = [SESSIONS[c.sid] for c in clients]
        lua, core = h['lua'], h['core']
        room = h['coop_room'].worlds[spec['node']]
        slot = room.fieldSlot
        boss = slot.enemy
        for env in (h, g):
            place(env['state'], boss.x - 93)
        wait_cast(lambda: core.stepCoop(room, TICK), slot, move, tick)
        coord = native(core.frame(h['state']).fieldBoss[coordinate])
        assert coord == native(core.frame(g['state']).fieldBoss[coordinate])
    for client in clients:
        assert client.frame()['fieldBoss'][coordinate] is not None
        assert cross(client, 65, entry)['coop']['code'] == code
    frozen = room.tick, slot.cast.tick, boss.x, boss.y
    advance(*clients, .2)
    assert (room.tick, slot.cast.tick, boss.x, boss.y) == frozen
    for client in clients:
        assert cross(client, gate, spec['node'])['coop']['code'] == code
    with LOCK:
        if slot.cast.tick < after:
            wait_cast(lambda: core.stepCoop(room, TICK), slot, move, after)
        for env in (h, g):
            place(env['state'], boss.x - 93)
        assert attack(lua, core, h['state'], boss) > 0
        assert attack(lua, core, g['state'], boss, atk=5000) > 0
    for i, client in enumerate(clients):
        save = client.frame(checkpoint=True)['checkpoint']
        assert save['mora'] == spec['mora'] and save['progression']['killXp'] == exp(spec)
        assert save['endgame']['bosses'][boss_id]['clears'] == 1
        assert 0 < save['fieldBosses'][boss_id]['waitTicks'] <= 3600
        if i == 0:
            assert save['story']['quests'][quest]['count'] == 1
        else:
            assert quest not in save['story']['quests']
    return {'participants': 2, 'emptyArenaPreservedLiveMove': True, 'individualRewardsAndQuestSaved': True}


if __name__ == '__main__':
    lua, core = runtime()
    result = {'oceanid': {'lua': check_oceanid(lua, core)}, 'maguu': {'lua': check_maguu(lua, core)}}
    with lab() as url:
        result['oceanid']['http'] = check_http(url, OCEANID, 'FO03', 96, 'landingX', 114)
        result['maguu']['http'] = check_http(url, MAGUU, 'FMK03', 102, 'maskX', 144)
    (ROOT/'evidence/coop-oceanid-maguu-lua-http.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result))
