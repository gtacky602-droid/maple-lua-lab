"""Verify Jadeplume's shared attack windows, geometry and individual rewards."""
import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_sumeru_field import attack
from test_coop_travel import cross

ID, HUB, ROAD, ARENA = 'boss-26110101', 'sumeru-hub', 'sumeru-field', 'sumeru-jadeplume-grove'
ART = 'jadeplume-field-actions-source-v1.png'
SPECS = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))
SPEC = next(row for row in SPECS['fieldBosses'] if row['id'] == ID)
LEVEL = LEVELS[SPEC['level']-1]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def enter(core, state, node):
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, node)


def prepare(core):
    state = core.new(12)
    core.action(state, 'story_start')
    enter(core, state, ARENA)
    place(state, SPEC['home']-90)
    return state


def shared_view(core, states):
    frames = [core.frame(state, 'sprite') for state in states]
    def preview(frame):
        boss = frame.fieldBoss
        return (boss.move, boss.tick, boss.x, boss.y, boss.landingX, boss.flying, native(boss.warnings))
    assert all(preview(frame) == preview(frames[0]) for frame in frames)
    return frames


def damage_received(state, boss, since):
    return [e.value for e in state.events.values()
            if e.seq > since and e.kind == 'hurt' and e.target == boss.id]


def lua_check():
    lua, core = runtime()
    host, guest, third, spectator = states = [prepare(core) for _ in range(4)]
    room = core.newCoop(host)
    for state in states:
        core.attachCoop(room, state)
    slot, step = room.fieldSlot, lambda: core.stepCoop(room, TICK)
    boss = slot.enemy
    assert boss.maxhp == 800

    wait_cast(step, slot, 'FJ01', 65)
    peck = slot.cast
    for state in states[:2]:
        place(state, peck.origin-75)
    place(third, peck.origin-115)
    third.actors[1].y, third.actors[1].ground = 393, False
    place(spectator, peck.origin+125)
    marks = [s.seq for s in states]
    step()
    # The two travelers have the same local actor ID. The third is in the rounded corner.
    assert [damage_received(s, boss, seq) for s, seq in zip(states, marks)] == [[9], [9], [], []]
    place(third, peck.origin+130)
    shared_view(core, states)
    wait_cast(step, slot, 'FJ01', 107)
    for state in states[:2]:
        place(state, peck.origin-75)
    wait_cast(step, slot, 'FJ01', 113)
    assert [damage_received(s, boss, seq) for s, seq in zip(states, marks)] == [[9, 9], [9, 9], [], []]

    wait_cast(step, slot, 'FJ02', 48)
    leap = slot.cast
    landing = leap.land
    for state in states:
        place(state, landing + 91)
    wait_cast(step, slot, 'FJ02', 90)
    assert leap.land == landing and boss.y == 404 and boss.hitBottom == boss.y
    for state, frame in zip(states, shared_view(core, states)):
        assert frame.fieldBoss.flying and frame.fieldBoss.landingX == landing
        sprite = next(d for d in frame.draws.values() if d.source == ART)
        assert math.isclose(sprite.x+state.camera, boss.x) and sprite.y == boss.y
    assert attack(lua, core, guest, boss, atk=1000) == 0
    assert attack(lua, core, guest, boss, y=boss.y) == 14
    wait_cast(step, slot, 'FJ02', 107)
    for state in states[:2]:
        place(state, landing)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FJ02', 119)
    assert boss.x == landing and boss.y == boss.hitBottom == 480
    assert [damage_received(s, boss, seq) for s, seq in zip(states, marks)] == [[16], [16], [], []]

    wait_cast(step, slot, 'FJ03', 48)
    spores = slot.cast
    points = list(spores.spots.values())
    warnings = shared_view(core, states)[0].fieldBoss.warnings
    assert [w.first for w in warnings.values()] == [108, 144, 180]
    assert all(w.locked and math.isclose((w.left+w.right)/2, x) for w, x in zip(warnings.values(), points))
    marks = [s.seq for s in states]
    for state, point in zip(states, points+[points[2]+57]):
        place(state, point)
    wait_cast(step, slot, 'FJ03', 185)
    assert list(spores.spots.values()) == points
    assert [damage_received(s, boss, seq) for s, seq in zip(states, marks)] == [[10], [10], [10], []]
    for state in states:
        place(state, boss.x-60)
    assert attack(lua, core, host, boss) == 14
    assert attack(lua, core, guest, boss, atk=2000) > 0 and slot.phase == 'respawn'
    assert [(s.kills, s.progression.killXp, s.mora) for s in states] == [
        (1, EXP, SPEC['mora'])]*2+[(0, 0, 0)]*2

    solo, newcomer = prepare(core), prepare(core)
    live = solo.fieldSlots[ID]
    wait_cast(lambda: core.step(solo, TICK), live, 'FJ01', 66)
    assert damage_received(solo, live.enemy, 0) == [9]
    adopted = core.newCoop(solo)
    for state in (solo, newcomer):
        core.attachCoop(adopted, state)
        place(state, live.cast.origin-75)
    marks = [s.seq for s in (solo, newcomer)]
    core.stepCoop(adopted, TICK)
    assert [damage_received(s, live.enemy, seq) for s, seq in zip((solo, newcomer), marks)] == [[], [9]]

    return {'participants':4, 'hp':800, 'samePeckEachOnce':True, 'roundedCornerMisses':True,
            'lockedLeapAndSharedHurtbox':True, 'sporesHitThreeSeparateTravelers':True,
            'soloHitHistorySurvivesAdoption':True, 'xpPerContributor':EXP, 'moraPerContributor':SPEC['mora']}


def http_check(url):
    clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            enter(env['core'], env['state'], HUB)
        cross(client, 1380, ROAD)
    code = clients[0].frame(['coop_create'])['coop']['code']
    assert clients[1].frame(['coop_join:'+code])['coop']['code'] == code
    for client in clients:
        assert cross(client, 1080, ARENA)['coop']['code'] == code
    with LOCK:
        h, g = envs = [SESSIONS[c.sid] for c in clients]
        lua, core = h['lua'], h['core']
        world = h['coop_room'].worlds[ARENA]
        slot = world.fieldSlot
        for env in envs:
            place(env['state'], SPEC['home']-103)
        wait_cast(lambda: core.stepCoop(world, TICK), slot, 'FJ02', 88)
        assert all(frame.fieldBoss.flying for frame in shared_view(core, [e['state'] for e in envs]))
    for client in clients:
        assert cross(client, 70, ROAD)['coop']['code'] == code
    frozen = (world.tick, slot.cast.tick, slot.enemy.x, slot.enemy.y, slot.cast.land)
    advance(*clients, .25)
    assert (world.tick, slot.cast.tick, slot.enemy.x, slot.enemy.y, slot.cast.land) == frozen
    for client in clients:
        assert cross(client, 1080, ARENA)['coop']['code'] == code
    with LOCK:
        boss = slot.enemy
        for env in envs:
            place(env['state'], slot.cast.land+92)
        if slot.cast.tick < 120:
            wait_cast(lambda: core.stepCoop(world, TICK), slot, 'FJ02', 120)
        for env in envs:
            place(env['state'], boss.x-60)
        assert attack(lua, core, h['state'], boss) == 14
        assert attack(lua, core, g['state'], boss, atk=2000) > 0
    for client in clients:
        f = client.frame(checkpoint=True)
        assert f['kills'] == 1 and f['mora'] == SPEC['mora'] and f['fieldBoss']['phase'] == 'respawn'
        save = f['checkpoint']
        assert save['endgame']['bosses'][ID]['clears'] == 1 and save['progression']['killXp'] == EXP
        assert save['fieldBosses'][ID]['hp'] == 0 and 0 < save['fieldBosses'][ID]['waitTicks'] <= 3600
    return {'participants':2, 'leftAndRejoinedSameRoom':True, 'emptyArenaPreservesLeap':True,
            'bothSavedRewardsAndRespawn':True}


if __name__ == '__main__':
    result = {'lua':lua_check()}
    with lab() as url:
        result['http'] = http_check(url)
    (ROOT/'evidence/coop-jadeplume-lua-http.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result, ensure_ascii=False))
