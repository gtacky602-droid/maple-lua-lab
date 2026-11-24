"""Verify independent enemy HP, group rewards and an exit-and-return rematch."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK, place
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross
from test_coop_tulpa import hit


TRISTARS = 'legend-natlan_polychrome_tristars'
IDS = (TRISTARS, 'legend-natlan_battlegoat_ironclaw', 'legend-snez_rowdy_beast_host')
SPECS = {spec['id']: spec for spec in json.loads(
    (ROOT / 'content/field-boss-spawns.json').read_text(encoding='utf-8'))['fieldBosses']}
NODES = {node['id']: node for node in json.loads(
    (ROOT / 'content/story-graph.json').read_text(encoding='utf-8'))['nodes']}


def save_json(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def enter(core, state, spec, node=None):
    core.grantExp(state, LEVELS[spec['level'] - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, node or spec['node'])
    place(state, spec['home'] - 200)


def reward(state):
    return state.kills, state.mora, state.progression.killXp


def ids_and_hp(members):
    return [(m.id, m.hp) for m in members]


def field_hp(frame):
    return [body['hp'] for body in frame['bodies']]


def verify_moves(lua, core, id):
    spec = SPECS[id]
    states = [core.new(12) for _ in range(4)]
    for state in states:
        core.action(state, 'story_start')
        enter(core, state, spec)
    host, guest, distant, elevated = states
    room = core.newCoop(host)
    for state in states:
        core.attachCoop(room, state)
    slot, group = room.fieldSlot, room.fieldSlot.enemy
    members = {body.id: body for body in group.fieldMembers.values()}
    moves = spec['moves']
    assert {move['member'] for move in moves} == set(members)

    def wait_for_move(expected):
        for _ in range(420):
            core.stepCoop(room, TICK)
            if slot.cast:
                break
        assert slot.cast and slot.cast.move.id == expected['id']
        assert slot.cast.member.id == expected['member']
        frames = [native(core.frame(state).fieldBoss) for state in states]
        assert all(frame['moveOwner'] == expected['member'] for frame in frames)
        assert all(frame['warnings'] == frames[0]['warnings'] for frame in frames)
        assert all(warning['element'] == members[expected['member']].element for warning in frames[0]['warnings'])
        return slot.cast

    fired = []
    for move in moves:
        for state in states:
            place(state, members[move['member']].x - 55)
        cast = wait_for_move(move)
        strike = cast.strikes[1]
        moving = 'travel' in move['steps'][0] or 'wave' in move['steps'][0]
        impact = strike.position if moving else (strike.left + strike.right) / 2
        for state in (host, guest, elevated):
            place(state, impact)
        place(distant, 20)
        seqs = [state.seq for state in states]
        start = members[move['member']].x
        for _ in range(strike.step.first):
            elevated.actors[1].y, elevated.actors[1].vy, elevated.actors[1].ground = 250, 0, False
            core.stepCoop(room, TICK)
        for index, state in enumerate(states):
            hurts = [event for event in state.events.values() if event.seq > seqs[index] and event.kind == 'hurt']
            assert [(event.target, event.element) for event in hurts] == (
                [(move['member'], members[move['member']].element)] if index < 2 else []
            )
            place(state, 20)
        if 'travel' in move['steps'][0]:
            assert members[move['member']].x != start
        fired.append(move['id'])
        for _ in range(move['total'] - strike.step.first):
            place(host, max(spec['arenaMin'] + 8, members[move['member']].x - 285))
            core.stepCoop(room, TICK)
        assert not slot.cast

    owner = members[moves[0]['member']]
    place(host, owner.x - 55)
    wait_for_move(moves[0])
    place(guest, owner.x)
    guest_seq = guest.seq
    assert hit(lua, core, host, owner, 9000) > 0
    assert not slot.cast and slot.phase == 'combat' and group.hp > 0
    assert all(core.frame(state).fieldBoss.moveOwner is None for state in states)
    place(host, members[moves[1]['member']].x - 55)
    place(guest, members[moves[1]['member']].x - 55)
    wait_for_move(moves[1])
    for _ in range(moves[0]['steps'][0]['first']):
        core.stepCoop(room, TICK)
    assert not any(event.kind == 'hurt' and event.target == owner.id and event.seq > guest_seq
                   for event in guest.events.values())
    assert [state.kills for state in states] == [0] * 4
    return {'id': id, 'testedMoves': fired, 'participants': len(states), 'defeatedBeforeHit': owner.id,
            'nextOwner': moves[1]['member'], 'sharedWarningsAndElementPerMember': True,
            'distanceAndHeightAvoidDamage': True}


def simulate_group(lua, core, id):
    spec = SPECS[id]
    states = [core.new(12) for _ in range(4)]
    for s in states:
        core.action(s, 'story_start')
        enter(core, s, spec)
    host, guest, distant, spectator = states
    base = [reward(s) for s in states]
    solo = host.fieldSlots[id].enemy
    original = [b['hp'] for b in spec['members']]
    assert ids_and_hp(solo.fieldMembers.values()) == [(b['entity'], b['hp']) for b in spec['members']]
    assert hit(lua, core, host, solo.fieldMembers[1]) > 0
    room = core.newCoop(host)
    handles = [core.attachCoop(room, s) for s in states]
    enemy = room.fieldSlot.enemy
    members = list(enemy.fieldMembers.values())
    assert enemy.hp == sum(m.hp for m in members) < spec['hp']
    assert all(enemy.maxhp == core.frame(s).fieldBoss.maxhp == spec['hp'] for s in states)
    assert host.fieldSlots[id].enemy.hp == spec['hp']
    assert all(m.coopHits is None for m in members)
    core.stepCoop(room, TICK)
    snapshots = []
    for index, target in enumerate(members):
        if index == 0:
            assert hit(lua, core, distant, target) > 0
        attackers = (host, guest) if index == 0 else (guest,)
        for s in attackers:
            place(s, target.x - 52)
            assert hit(lua, core, s, target) > 0
            assert enemy.hp == sum(m.hp for m in members)
        # Stay within range of the first body, beyond the centre of the group.
        if index == 0:
            place(host, target.x - 400)
            place(distant, 25)
        assert hit(lua, core, guest, target, 9000) > 0
        assert not core.defeatEnemy(guest, target, 1)
        snapshots.append([m.hp for m in members])
        assert all(field_hp(native(core.frame(s).fieldBoss)) == snapshots[-1] for s in states)
        if index < len(members) - 1:
            assert [reward(s) for s in states] == base
            core.stepCoop(room, TICK)
    assert room.fieldSlot.phase == 'cleared' and room.fieldSlot.waitUntil is None
    assert all(m.hp == 0 for m in members)
    assert abs(host.actors[1].x - enemy.x) > 420
    assert all(s.endgame.bosses[id].clears == 1 for s in (host, guest))
    xp = int(LEVELS[spec['level'] - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert [reward(s) for s in states] == [(1, spec['mora'], xp)] * 2 + base[2:]
    for s in (host, guest):
        saved = validate_save(native(core.checkpoint(s)))
        assert saved['endgame']['bosses'][id]['clears'] == 1
        assert id not in saved.get('fieldBosses', {})
    core.detachCoop(handles[0])
    assert [b.hp for b in host.fieldSlots[id].enemy.fieldMembers.values()] == original
    core.attachCoop(room, host, handles[0])
    assert room.fieldSlot.phase == 'cleared'
    for s, handle in zip(states, handles):
        core.enterStoryNode(s, NODES[spec['node']]['exits'][0]['to'])
        core.detachCoop(handle)
    assert len(room.members) == 0
    core.stepCoop(room, TICK)
    before = room.tick
    core.enterStoryNode(host, spec['node'])
    core.attachCoop(room, host, handles[0])
    assert room.tick == before and room.fieldSlot.generation == 2
    assert [m.hp for m in room.enemies.values()] == original
    assert reward(host) == (1, spec['mora'], xp)
    return {'id': id, 'membersHp': original, 'hpAfterEach': snapshots, 'xp': xp,
            'mora': spec['mora'], 'creditedMembers': [1, 2], 'rematchGeneration': 2}


def run_lua():
    lua, core = runtime()
    output = [simulate_group(lua, core, id) for id in IDS]
    for row in output:
        row['moveChecks'] = verify_moves(lua, core, row['id'])
    state = core.new(12)
    core.action(state, 'story_start')
    entry = NODES[SPECS[TRISTARS]['node']]['exits'][0]['to']
    enter(core, state, SPECS[TRISTARS], entry)
    for slot in (1, 2, 3):
        assert core.giveArtifact(state, slot, 40, 3)
        core.action(state, 'artifact_equip:' + str(slot))
    core.enterStoryNode(state, 'natlan-hub')
    save_json('work/coop-legend-groups-fixture.json', validate_save(native(core.checkpoint(state))))
    return output


def run_http(url):
    spec = SPECS[TRISTARS]
    arena = spec['node']
    gate = NODES[arena]['exits'][0]
    entrance = gate['to']
    inbound = next(e for e in NODES[entrance]['exits'] if e['to'] == arena)
    host, guest = Client(url), Client(url)
    for client in (host, guest):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            enter(env['core'], env['state'], spec, entrance)
        frame = cross(client, inbound['x'], arena)
        assert frame['coop']['eligible']
    opened = host.frame(['coop_create'])
    code = opened['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    with LOCK:
        h, g = [SESSIONS[client.sid] for client in (host, guest)]
        world = h['coop_room'].worlds[arena]
        bodies = list(world.fieldSlot.enemy.fieldMembers.values())
        assert hit(h['lua'], h['core'], h['state'], bodies[0], 9000) == 490
    cross(host, gate['x'], entrance)
    cross(guest, gate['x'], entrance)
    paused = world.tick
    advance(host, guest, .2)
    assert world.tick == paused and world.fieldSlot.generation == 1
    for client in (host, guest):
        frame = cross(client, inbound['x'], arena)
        assert frame['coop']['code'] == code
        assert [body['hp'] for body in frame['coop']['enemies']] == [0, 500, 350]
        assert frame['kills'] == 0
    with LOCK:
        for env, target in ((h, bodies[1]), (g, bodies[2])):
            place(env['state'], target.x - 56)
            assert hit(env['lua'], env['core'], env['state'], target, 9000) > 0
    for client in (host, guest):
        frame = client.frame()
        assert frame['fieldBoss']['phase'] == 'cleared'
        assert frame['fieldBoss']['hp'] == 0 and frame['kills'] == 1
        assert frame['mora'] == 550
    cross(host, gate['x'], entrance)
    assert cross(host, inbound['x'], arena)['fieldBoss']['phase'] == 'cleared'
    for client in (host, guest):
        cross(client, gate['x'], entrance)
    for client in (host, guest):
        frame = cross(client, inbound['x'], arena)
        assert frame['coop']['code'] == code
        assert [body['hp'] for body in frame['coop']['enemies']] == [490, 500, 350]
        assert frame['kills'] == 1
    return {'participants': 2, 'sameRoomCode': True, 'partialHpKeptAfterBothExited': True,
            'oneRemainingPlayerKeepsClearedRound': True, 'newRoundAfterBothExited': True}


if __name__ == '__main__':
    lua_results = run_lua()
    print(lua_results, flush=True)
    with lab() as url:
        http_results = run_http(url)
    print(http_results)
    save_json('evidence/coop-legend-groups-lua-http.json', {'lua': lua_results, 'http': http_results})
