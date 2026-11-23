"""Walk to each black obelisk, verify its transfer, and retry its encounter."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


HUB = 'natlan-hub'
HOSTS = {
    'legend-natlan_undead': 'nat-wp-72417',
    'legend-natlan_chimalli': 'nat-wp-72416',
}
nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, gate['to']): gate for id, route in exits.items() for gate in route}
specs = {spec['id']: spec for spec in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle = lua.table()
attack = lua.table(attack=True)
dt = 1 / 60


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, exp(level), 'quest')
    for slot in (1,2):
        assert core.giveArtifact(state,slot,40,3)
        core.action(state,'artifact_equip:'+str(slot))
    return state


def tick(state, count, input=idle):
    for _ in range(count):
        core.step(state, dt, input)


def save(state):
    return validate_save(native(core.checkpoint(state)))


def reward(state):
    return state.kills, state.mora, state.progression.killXp


def check_atlas(state, arena, approach):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + arena)
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [leg.id for leg in route.stops.values()] == [approach, arena]
    assert route.stops[2].mode == 'night' and route.stops[2].label == '黒曜石の柱'
    core.action(state, 'world_map_toggle')


def check_transfer(state, walk, arena, gate):
    walk.approach(gate['x'], gate.get('y', 480), arena)
    core.action(state, 'story_nearby_portal')
    ride = state.lift
    assert ride.destination == arena and ride.phase and not ride.boat and not ride.waterway
    origin, origin_x = state.story.node, walk.actor.x
    tick(state, 15, lua.table(left=True))
    assert state.story.node == origin and walk.actor.x == origin_x
    core.action(state, 'pause')
    remaining = ride.remaining
    tick(state, 30)
    assert state.story.node == origin and ride.remaining == remaining
    core.action(state, 'pause')
    tick(state, 70)
    assert state.story.node == arena and state.lift is None
    assert walk.actor.x == gate['arrivalX']


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    actor = walk.actor
    walk.approach(slot.enemy.x - 46, 480, spec['node'])
    actor.dir = 1
    for _ in range(6600):
        if slot.phase == 'cleared':
            return
        tick(state, 1, attack)
    raise AssertionError((spec['id'], slot.enemy.hp))


fixture = start(118)
for host in HOSTS.values():
    core.enterStoryNode(fixture, host)
core.enterStoryNode(fixture, HUB)
write('work/natlan-night-trial-fixture.json', save(fixture))

results = []
for id, host in HOSTS.items():
    spec = specs[id]
    level, arena = spec['level'], spec['node']
    approach = spec['entryThrough'][0]
    gate = edges[approach, arena]
    state = start(level - 1)
    walk = TrailWalk(lua, core, state, edges, exits)
    core.enterStoryNode(state, host)
    walk.cross(approach)
    walk.approach(gate['x'], 480, arena)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == arena and not portal.available and str(level) in portal.reason
    core.action(state, 'story_nearby_portal')
    assert state.story.node == approach and state.lift is None
    core.grantExp(state, exp(level) - exp(level - 1), 'quest')
    walk.cross(host)
    check_atlas(state, arena, approach)
    walk.cross(approach)
    check_transfer(state, walk, arena, gate)
    assert {enemy.id for enemy in state.enemies.values()} == {spec['entity']}
    assert state.fieldSlots[id].enemy.hitBottom == 480 - spec.get('hitFloorClearance', 0)

    walk.cross(approach)
    assert walk.actor.x == gate['x']
    walk.cross(arena)
    before = reward(state)
    returns = state.returns
    for actor in state.actors.values():
        actor.hp = 0
    tick(state, 1)
    assert state.returns == returns + 1 and state.story.node == approach and walk.actor.x == gate['x']
    assert state.fieldSlots[id] is None and reward(state) == before

    walk.cross(arena)
    state.actors[2].hp = 0
    defeat(state, walk, spec)
    xp = int(LEVELS[level - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert reward(state) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert state.endgame.bosses[id].clears == 1
    saved = save(state)
    assert id not in saved.get('fieldBosses', {})
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    assert restored.story.node == HUB and restored.endgame.bosses[id].clears == 1
    walk.cross(approach)
    walk.cross(arena)
    assert state.fieldSlots[id].enemy.hp == spec['hp']
    results.append({
        'id':id, 'level':level, 'route':[host, approach, arena],
        'manualExitAndWipeReturnX':gate['x'], 'killXp':xp,
    })

write('evidence/natlan-night-trials-lua.json', {
    'trials':results, 'levelGateAndAtlasRoute':True,
    'pausedTransferResumesWithoutMovingActors':True, 'wipeFixtureReturnedAndReset':True,
    'clearsAndRewardsSurviveRestore':True, 'manualRetryStartsAtFullHp':True,
})
print('Night trials: both pillars, timed transfer, return states, attack and saved reward passed')
