"""Check three Lv120 encounters, including distinct entrances off the shared cliff."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


HUB = 'natlan-hub'
WEST = 'nat-wp-79053'
PORT = 'natlan-port'
FORK = 'night-wind-seaward-fork'
RIDGE = 'flower-feather-smiths-ridge'
RILAI = 'legend-natlan_rilai'
DAWN = 'legend-natlan_fallen_dawnstar'
IRON = 'legend-natlan_ironbeard'
QUEST = 'natlan-seaward-signs'

graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quest = next(q for q in graph['quests'] if q['id'] == QUEST)
specs = {spec['id']: spec for spec in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle = lua.table()
attack = lua.table(attack=True)
dt = 1 / 60


def level_xp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, level_xp(level), 'quest')
    return state


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def tick(state, frames, controls=idle):
    for _ in range(frames):
        core.step(state, dt, controls)


def guide(state, arena, expected):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + arena)
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready', (arena, route.status)
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == expected
    core.action(state, 'world_map_toggle')


def rewards(state):
    return state.kills, state.mora, state.progression.killXp


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    walk.approach(slot.enemy.x - 42, 480, spec['node'])
    walk.actor.dir = 1
    before = rewards(state)
    for _ in range(6900):
        if slot.phase == 'cleared':
            break
        tick(state, 1, attack)
    assert slot.phase == 'cleared', (spec['id'], slot.enemy.hp)
    base_xp = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    xp = int(base_xp * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert rewards(state) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    assert state.endgame.bosses[spec['id']].clears == 1
    return xp


def check_pillar(state, walk, approach, spec, shelves):
    arena = spec['node']
    pillar = edges[approach, arena]
    walk.approach(pillar['x'], 480, arena)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == approach and state.lift is None
    for x, y in shelves:
        walk.approach(x, y, arena)
    walk.cross(arena)
    xp = defeat(state, walk, spec)
    walk.cross(approach)
    assert (walk.actor.x, walk.actor.y) == (pillar['x'], pillar['y'])
    walk.cross(arena)
    assert state.fieldSlots[spec['id']].enemy.hp == spec['hp']
    walk.cross(approach)
    return xp


rilai, dawn, iron = (specs[id] for id in (RILAI, DAWN, IRON))
fixture = start(120)
for host in (WEST, PORT, HUB):
    core.enterStoryNode(fixture, host)
write('work/natlan-northwest-legends-fixture.json', saved(fixture))

state = start(119)
walk = TrailWalk(lua, core, state, edges, exits)
core.action(state, 'story_accept:' + QUEST)
core.enterStoryNode(state, WEST)
walk.cross(FORK)
for index, spot in enumerate(quest['itinerary'], 1):
    if index == 2:
        walk.approach(620, 414, QUEST)
        walk.approach(920, 346, QUEST)
    walk.approach(spot['x'], spot['y'], QUEST)
    core.action(state, 'story_collect')
    assert state.story.quests[QUEST].count == index
gate = edges[FORK, rilai['node']]
walk.approach(gate['x'], 480, rilai['node'])
nearby = core.frame(state).storyNearbyPortal
assert nearby.to == rilai['node'] and not nearby.available and '120' in nearby.reason
core.action(state, 'story_nearby_portal')
assert state.story.node == FORK
core.grantExp(state, level_xp(120) - level_xp(119), 'quest')
walk.cross(WEST)
guide(state, rilai['node'], [(FORK, 'walk'), (rilai['node'], 'walk')])
guide(state, dawn['node'], [(FORK, 'walk'), (dawn['node'], 'night')])
walk.cross(FORK)
walk.cross(rilai['node'])
slot = state.fieldSlots[RILAI]
walk.approach(slot.enemy.x - 42, 480, RILAI)
tick(state, 150)
neutral = core.frame(state).fieldBoss
assert (neutral.phase, neutral.hp, neutral.label) == ('available', rilai['hp'], rilai['provokeLabel'])
walk.actor.dir = 1
tick(state, 32, attack)
assert slot.enemy.hp < rilai['hp'] and slot.phase in ('notice', 'combat') and not slot.enemy.noAutoTarget
walk.cross(FORK)
walk.cross(rilai['node'])
slot = state.fieldSlots[RILAI]
assert slot.phase == 'available' and slot.enemy.hp == rilai['hp']
xp = {RILAI: defeat(state, walk, rilai)}
walk.cross(FORK)
xp[DAWN] = check_pillar(state, walk, FORK, dawn, [(650, 414), (935, 346)])
assert state.endgame.bosses[RILAI].clears == state.endgame.bosses[DAWN].clears == 1
walk.cross(WEST)
core.enterStoryNode(state, PORT)
guide(state, iron['node'], [(RIDGE, 'walk'), (iron['node'], 'night')])
walk.cross(RIDGE)
xp[IRON] = check_pillar(state, walk, RIDGE, iron, [(510, 411), (945, 343)])
walk.cross(PORT)

restored = core.restore(lua.table_from(saved(state), recursive=True), 12)
for id in (RILAI, DAWN, IRON):
    assert restored.endgame.bosses[id].clears == 1
core.enterStoryNode(restored, HUB)
core.action(restored, 'story_report:' + QUEST)
assert restored.story.quests[QUEST].status == 'complete'

write('evidence/natlan-northwest-legends-lua.json', {
    'sharedAnchorRoutesHaveDistinctModes': True,
    'groundEncounterRequiresLv120': True,
    'rilaiNeutralWithCompanionAndProvokedByNormalAttack': True,
    'cliffSignSurveyCompletedAndReported': True,
    'pillarOnlyAtUpperShelf': True,
    'eachPillarReturnsToEntryAndResetsOnReentry': True,
    'independentClearsAndRewardsPersist': True,
    'killXp': xp,
})
print('Northwest legends: distinct Lv120 routes, neutral Rilai, phase exits, and saved clears passed')
