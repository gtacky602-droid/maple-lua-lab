"""Walk domain approaches using ordinary movement and held jumps."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
gates = {(id, e['to']): e for id, entries in exits.items() for e in entries}
placements = read('content/enemy-spawns.json')['nodes']
lua, core = runtime()
held_jump = {direction: lua.table_from({'jump': True, direction: True})
             for direction in ('left', 'right')}


def start(level, hosts, hub):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    for host in hosts:
        core.enterStoryNode(state, host)
    core.enterStoryNode(state, hub)
    return state


def jump_across(walk, src, dest, direction):
    """Launch from the lip and land on the adjacent shelf without touching the floor."""
    sign = 1 if direction == 'right' else -1
    takeoff = src['x'] + src['w'] - 14 if sign == 1 else src['x'] + 14
    target = dest['x'] + 30 if sign == 1 else dest['x'] + dest['w'] - 30
    walk.approach(takeoff, src['y'], 'shelf edge')
    actor = walk.actor
    core.action(walk.state, 'jump')
    for tick in range(1, 100):
        input = held_jump[direction] if sign * (target - actor.x) > 3 else walk.inputs['jump']
        core.step(walk.state, 1 / 60, input)
        if actor.ground:
            assert tick > 1 and actor.y == dest['y'], (walk.state.story.node, actor.x, actor.y, dest)
            assert dest['x'] <= actor.x <= dest['x'] + dest['w']
            return
    raise AssertionError('Did not land on the adjacent shelf')


def check_field(stage, host, hub, level, scenery, first_x, *, raised_gate=False, population_count=48):
    state = start(level - 1, [host], hub)
    core.action(state, 'story_fast:' + host)
    walk = TrailWalk(lua, core, state, gates, exits)
    entry = gates[host, stage]
    if nodes[host]['level'] == level:
        # Some domain approaches and their host waypoint unlock together.
        assert state.story.node == hub
    else:
        assert state.story.node == host
        walk.approach(entry['x'], entry.get('y', 480), stage)
        portal = core.frame(state).storyNearbyPortal
        assert portal.to == stage and not portal.available and portal.level == level
        core.action(state, 'story_nearby_portal')
        assert state.story.node == host
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach']
                  - LEVELS[level - 2]['maple_reference_total_exp_to_reach'], 'quest')
    if state.story.node == hub:
        core.action(state, 'story_fast:' + host)
        assert state.story.node == host
    # Ignore damage to isolate platform traversal while all local enemies remain active.
    for actor in state.actors.values():
        actor.inv = 1000
    walk.cross(stage)
    assert nodes[stage]['scenery'] == scenery
    platforms = nodes[stage]['platforms']
    floor = platforms[0]
    margin = floor['w'] * nodes[stage]['enemySafeFraction']
    assert walk.actor.x < margin or walk.actor.x > floor['w'] - margin
    population = placements[stage]
    assert len(state.enemies) == len(population) == population_count, stage
    for enemy, spawn in zip(state.enemies.values(), population, strict=True):
        shelf = platforms[spawn['platform']]
        assert enemy.x == spawn['x'] and enemy.y == shelf['y']
        assert shelf['x'] + 24 <= enemy.x <= shelf['x'] + shelf['w'] - 24
        assert margin < enemy.x < floor['w'] - margin
        for exit in exits[stage]:
            arrival = gates[exit['to'], stage]
            y = arrival.get('arrivalY', 480)
            # Both party slots land outside the contact reach of the whole patrol.
            for x in (arrival['arrivalX'], arrival['arrivalX'] - 40):
                assert abs(enemy.y - y) >= 45 or x <= enemy.patrolMin - 60 or x >= enemy.patrolMax + 60

    from_left = entry['arrivalX'] < floor['w'] / 2
    shelves = platforms[1:5] if from_left else platforms[4:0:-1]
    walk.approach(first_x, 480, 'ground below the first shelf')
    if raised_gate:
        core.action(state, 'story_nearby_portal')
        assert state.story.node == stage, 'The raised cave should require a jump'
    walk.approach(first_x, shelves[0]['y'], 'first shelf')
    for src, dest in zip(shelves, shelves[1:]):
        jump_across(walk, src, dest, 'right' if from_left else 'left')
    backtrack = list(reversed(shelves))
    for src, dest in zip(backtrack, backtrack[1:]):
        jump_across(walk, src, dest, 'left' if from_left else 'right')

    core.action(state, 'world_map_toggle')
    assert core.frame(state).worldMap.selected.id == stage
    core.action(state, 'world_map_toggle')
    for edge in exits[stage]:
        if edge['to'] != host:
            required = nodes[edge['to']]['level']
            if required > state.progression.level:
                walk.approach(edge['x'], edge.get('y', 480), edge['to'])
                portal = core.frame(state).storyNearbyPortal
                assert portal.to == edge['to'] and not portal.available and portal.level == required
                core.action(state, 'story_nearby_portal')
                assert state.story.node == stage
                core.grantExp(state, LEVELS[required - 1]['maple_reference_total_exp_to_reach']
                              - LEVELS[state.progression.level - 1]['maple_reference_total_exp_to_reach'], 'quest')
            walk.cross(edge['to'])
            walk.cross(stage)
            expected_y = gates[edge['to'], stage].get('arrivalY', 480)
            core.step(state, 1 / 60, walk.idle)
            assert walk.actor.ground and walk.actor.y == expected_y
    walk.cross(host)
    result = dict(population=len(population), shelf_heights_from_entrance=[p['y'] for p in shelves],
                  upper_route_jumps=6, round_trips=len(exits[stage]), level_required=level,
                  exterior_scenery=scenery)
    result['arrivals_outside_enemy_contact'] = len(exits[stage])
    return result


def write_fixture(name, level, hub, hosts):
    fixture = start(level, hosts, hub)
    (ROOT / 'work').mkdir(exist_ok=True)
    write('work/' + name + '-fixture.json', validate_save(native(core.checkpoint(fixture))))
