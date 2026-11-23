"""Walk the Natlan domain approaches using ordinary movement and held jumps."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


east, west, cliff, shore, centre = ['sites-hunt-' + suffix for suffix in
                                    ('73159', '73160', '81383', '82577', '73161')]
approaches = {east: 'nat-wp-72414', west: 'nat-wp-72422', cliff: 'nat-wp-79051',
              shore: 'nat-wp-82564', centre: 'nat-wp-72445'}
scenery = {east: 'natlanRiverTrial', west: 'natlanCharmTrail', cliff: 'natlanRaceRidge',
           shore: 'natlanSurfCove', centre: 'ochkaCliff'}
first_shelf_x = {east: 650, west: 2480, cliff: 2380, shore: 2350, centre: 2380}
nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
gates = {(id, e['to']): e for id, entries in exits.items() for e in entries}
placements = read('content/enemy-spawns.json')['nodes']
lua, core = runtime()
held_jump = {direction: lua.table_from({'jump': True, direction: True})
             for direction in ('left', 'right')}


def start(level, hosts):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    for host in hosts:
        core.enterStoryNode(state, host)
    core.enterStoryNode(state, 'natlan-hub')
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


def check_field(stage):
    host = approaches[stage]
    state = start(118, [host])
    core.action(state, 'story_fast:' + host)
    assert state.story.node == host
    walk = TrailWalk(lua, core, state, gates, exits)
    entry = gates[host, stage]
    walk.approach(entry['x'], entry.get('y', 480), stage)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == stage and not portal.available and portal.level == 119
    core.action(state, 'story_nearby_portal')
    assert state.story.node == host
    core.grantExp(state, LEVELS[118]['maple_reference_total_exp_to_reach']
                  - LEVELS[117]['maple_reference_total_exp_to_reach'], 'quest')
    # Ignore damage to isolate platform traversal while all local enemies remain active.
    for actor in state.actors.values():
        actor.inv = 1000
    walk.cross(stage)
    assert nodes[stage]['scenery'] == scenery[stage]
    platforms = nodes[stage]['platforms']
    floor = platforms[0]
    margin = floor['w'] * nodes[stage]['enemySafeFraction']
    assert walk.actor.x < margin or walk.actor.x > floor['w'] - margin
    population = placements[stage]
    assert len(state.enemies) == len(population) == 48
    for enemy, spawn in zip(state.enemies.values(), population, strict=True):
        shelf = platforms[spawn['platform']]
        assert enemy.x == spawn['x'] and enemy.y == shelf['y']
        assert shelf['x'] + 24 <= enemy.x <= shelf['x'] + shelf['w'] - 24
        assert margin < enemy.x < floor['w'] - margin
        if stage != centre:
            for exit in exits[stage]:
                arrival = gates[exit['to'], stage]
                y = arrival.get('arrivalY', 480)
                # Both party slots land outside the contact reach of the whole patrol.
                for x in (arrival['arrivalX'], arrival['arrivalX'] - 40):
                    assert abs(enemy.y - y) >= 45 or x <= enemy.patrolMin - 60 or x >= enemy.patrolMax + 60

    shelves = platforms[1:5] if stage == east else platforms[4:0:-1]
    first_x = first_shelf_x[stage]
    walk.approach(first_x, 480, 'ground below the first shelf')
    if stage == west:
        core.action(state, 'story_nearby_portal')
        assert state.story.node == stage, 'The raised cave should require a jump'
    walk.approach(first_x, shelves[0]['y'], 'first shelf')
    for src, dest in zip(shelves, shelves[1:]):
        jump_across(walk, src, dest, 'right' if stage == east else 'left')
    backtrack = list(reversed(shelves))
    for src, dest in zip(backtrack, backtrack[1:]):
        jump_across(walk, src, dest, 'left' if stage == east else 'right')

    core.action(state, 'world_map_toggle')
    assert core.frame(state).worldMap.selected.id == stage
    core.action(state, 'world_map_toggle')
    for edge in exits[stage]:
        if edge['to'] != host:
            if nodes[edge['to']]['level'] > state.progression.level:
                core.grantExp(state, LEVELS[119]['maple_reference_total_exp_to_reach']
                              - LEVELS[118]['maple_reference_total_exp_to_reach'], 'quest')
            walk.cross(edge['to'])
            walk.cross(stage)
            expected_y = gates[edge['to'], stage].get('arrivalY', 480)
            core.step(state, 1 / 60, walk.idle)
            assert walk.actor.ground and walk.actor.y == expected_y
    walk.cross(host)
    result = dict(population=len(population), shelf_heights_from_entrance=[p['y'] for p in shelves],
                  upper_route_jumps=6, round_trips=len(exits[stage]), level_required=119,
                  exterior_scenery=scenery[stage])
    if stage != centre:
        result['arrivals_outside_enemy_contact'] = len(exits[stage])
    return result


(ROOT / 'work').mkdir(exist_ok=True)
for name, level, pair in [('natlan-domain-terrain', 119, (east, west)),
                          ('natlan-western-domain-terrain', 120, (cliff, shore, centre))]:
    fixture = start(level, [approaches[stage] for stage in pair])
    write('work/' + name + '-fixture.json', validate_save(native(core.checkpoint(fixture))))
result = {stage: check_field(stage) for stage in approaches}
write('evidence/natlan-domain-terrain-lua.json', result)
print('Four redesigned approaches and the existing central approach passed traversal and spawn checks.')
