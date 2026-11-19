"""Play the mountain plateau and unlock the two-way spiritway in Lua."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


DOCK = 'ochkanatlan-dock'
ISLE = 'nat-wp-84107'
REEF = 'nat-wp-80030'
DEVICE = 'ochka-bronzelock-device-shore'
LANDING = 'ochka-bronzelock-floating-landing'
SMALL = 'legend-natlan_infinitesimal'
LOCK = 'legend-natlan_bronzelock'
QUEST = 'ochka-floating-island-spiritway'
graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
specs = {row['id']: row for row in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle, attack = lua.table(), lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, DOCK)
    core.grantExp(state, exp(level), 'quest')
    return state


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def restore(state):
    return core.restore(lua.table_from(saved(state), recursive=True), 12)


def walk_for(state):
    return TrailWalk(lua, core, state, edges, exits)


def tick(state, frames, controls=idle):
    for _ in range(frames):
        core.step(state, 1 / 60, controls)


def guide(state, expected):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + expected[-1][0])
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == expected
    core.action(state, 'world_map_toggle')


def check_gate(state, walk, target, text):
    edge = edges[state.story.node, target]
    walk.approach(edge['x'], edge.get('y', 480), target)
    near = core.frame(state).storyNearbyPortal
    assert near.to == target and not near.available and text in near.reason
    node = state.story.node
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node and state.lift is None


def break_device(state, walk, point):
    walk.approach(point['x'] - 42, point['y'], point['id'])
    walk.actor.dir = 1
    before = state.kills, state.mora, state.progression.killXp
    tick(state, 38, attack)
    assert all(e.id != point['entity'] or e.hp == 0 for e in state.enemies.values())
    assert before == (state.kills, state.mora, state.progression.killXp)


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    assert slot.enemy.hp == spec['hp']
    state.actors[2].hp = 0
    walk.approach(slot.enemy.x - 42, 480, spec['node'])
    walk.actor.dir = 1
    before = state.kills, state.mora, state.progression.killXp
    for _ in range(10800):
        if slot.phase == 'cleared':
            break
        tick(state, 1, attack)
    assert slot.phase == 'cleared', (spec['id'], slot.enemy.hp)
    base = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    xp = int(base * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    assert restore(state).endgame.bosses[spec['id']].clears == 1
    return xp


fixture = start(180)
for stage in (ISLE, REEF, DOCK):
    core.enterStoryNode(fixture, stage)
write('work/natlan-highland-legends-fixture.json', saved(fixture))
small, lock = specs[SMALL], specs[LOCK]

state = start(129)
walk = walk_for(state)
core.enterStoryNode(state, ISLE)
check_gate(state, walk, small['node'], '130')
core.grantExp(state, exp(130) - exp(129), 'quest')
guide(state, [(small['node'], 'walk')])
walk.cross(small['node'])
xp = {SMALL: defeat(state, walk, small)}
walk.cross(ISLE)
assert walk.actor.y == 401

state = start(124)
walk = walk_for(state)
core.enterStoryNode(state, REEF)
walk.cross(DEVICE)
check_gate(state, walk, LANDING, '受注')
core.enterStoryNode(state, DOCK)
core.action(state, 'story_accept:' + QUEST)
core.enterStoryNode(state, REEF)
walk.cross(DEVICE)
first, second = nodes[DEVICE]['breakTargets']
assert len(state.enemies) == 2
break_device(state, walk, first)
assert state.story.quests[QUEST].count == 0 and state.story.quests[QUEST].sweep[first['id']]
check_gate(state, walk, LANDING, '二つ')
state = restore(state)
walk = walk_for(state)
core.enterStoryNode(state, REEF)
walk.cross(DEVICE)
assert [e.id for e in state.enemies.values()] == [second['entity']]
break_device(state, walk, second)
assert state.story.quests[QUEST].count == 1
dep = edges[DEVICE, LANDING]
walk.approach(dep['x'], dep['y'], LANDING)
core.action(state, 'story_nearby_portal')
assert core.frame(state).storyLift.spiritway and state.lift.riders
tick(state, 70)
assert walk.actor.y < dep['y'] - 100 and state.story.node == DEVICE and state.camera > 0
assert not any(d.color == '#5e5b48' for d in core.frame(state).draws.values())
core.action(state, 'pause')
position = walk.actor.x, walk.actor.y, state.lift.remaining
tick(state, 25)
assert position == (walk.actor.x, walk.actor.y, state.lift.remaining)
core.action(state, 'pause')
tick(state, 130)
assert state.story.node == LANDING and state.story.quests[QUEST].count == 2
check_gate(state, walk, lock['node'], '180')
walk.cross(DEVICE)
assert walk.actor.y == dep['y']
walk.cross(REEF)

core.grantExp(state, exp(180) - exp(124), 'quest')
guide(state, [(DEVICE, 'walk'), (LANDING, 'spiritway'), (lock['node'], 'walk')])
walk.cross(DEVICE)
walk.cross(LANDING)
walk.cross(lock['node'])
xp[LOCK] = defeat(state, walk, lock)
walk.cross(LANDING)
assert walk.actor.y == 410
walk.cross(DEVICE)
walk.cross(REEF)
state = restore(state)
core.action(state, 'story_report:' + QUEST)
assert state.story.quests[QUEST].status == 'complete'
state = restore(state)
core.enterStoryNode(state, REEF)
walk = walk_for(state)
walk.cross(DEVICE)
walk.cross(LANDING)
write('evidence/natlan-highland-legends-lua.json', {
    'mountainLv130AndReturnToShelf': True,
    'twoDeviceHitsUnlockTransportWithoutKillsOrXp': True,
    'partialDeviceStateRestored': True,
    'spiritwayMovesActorsOnArcAndPauses': True,
    'twoWaySpiritwayWorksBelowLv180': True,
    'bronzelockLv180GateAndSavedRecord': True,
    'questCanBeReportedAfterRestore': True,
    'transportReopensAfterReportingAndReloading': True,
    'killXp': xp,
})
print('Highland legends: break targets, partial save, spiritway arc/return, and both Lv gates passed')
