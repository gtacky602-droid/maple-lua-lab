"""Exercise both Atocpan trial branches and the headland's two approaches."""
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
RIM = 'nat-wp-82559'
ISLAND = 'nat-wp-82563'
VALLEY = 'nat-wp-82562'
RUINS = 'tetenanco-seaward-foot'
HEADLAND = 'collective-eastern-headland'
REJI = 'legend-natlan_reji'
TUPU = 'legend-natlan_tupu'
QUEST = 'natlan-atocpan-landmarks'
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quest = next(q for q in graph['quests'] if q['id'] == QUEST)
specs = {row['id']: row for row in read('content/field-boss-spawns.json')['fieldBosses']}
atlas = read('content/world-atlas.json')
natlan = next(region for region in atlas['regions'] if region['id'] == 'region-06')
points = {point['id']: point for point in natlan['points']}
assert points[RUINS]['x'] > points[RIM]['x'] and points[RUINS]['y'] > points[RIM]['y']
assert points[HEADLAND]['x'] > points[ISLAND]['x'] and points[HEADLAND]['y'] < points[ISLAND]['y']
lua, core = runtime()
idle, attack = lua.table(), lua.table(attack=True)


def xp_to(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, xp_to(level), 'quest')
    return state


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def tick(state, frames, controls=idle):
    for _ in range(frames):
        core.step(state, 1 / 60, controls)


def guide(state, stops):
    arena = stops[-1][0]
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + arena)
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == stops
    core.action(state, 'world_map_toggle')


def inspect(state, walk, index):
    spot = quest['itinerary'][index]
    walk.approach(spot['x'], spot['y'], QUEST)
    core.action(state, 'story_collect')
    assert state.story.quests[QUEST].count == index + 1


def check_level(state, walk, arena):
    pillar = edges[state.story.node, arena]
    walk.approach(pillar['x'], pillar.get('y', 480), arena)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == arena and not portal.available and '120' in portal.reason
    core.action(state, 'story_nearby_portal')
    assert state.lift is None


def walk_onto_headland_shelf(walk, arena):
    walk.approach(536, 414, arena)
    walk.approach(735, 345, arena)


def exercise_trial(state, walk, spec, approach):
    arena = spec['node']
    walk.cross(arena)
    slot = state.fieldSlots[spec['id']]
    assert slot.enemy.hp == spec['hp']
    walk.approach(slot.enemy.x - 44, 480, arena)
    walk.actor.dir = 1
    before = state.kills, state.mora, state.progression.killXp
    for _ in range(6900):
        if slot.phase == 'cleared':
            break
        tick(state, 1, attack)
    assert slot.phase == 'cleared', (spec['id'], slot.enemy.hp)
    base = LEVELS[119]['normal_enemy_base_exp']
    xp = int(base * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    walk.cross(approach)
    pillar = edges[approach, arena]
    assert (walk.actor.x, walk.actor.y) == (pillar['x'], pillar.get('y', 480))
    walk.cross(arena)
    assert state.fieldSlots[spec['id']].enemy.hp == spec['hp']
    walk.cross(approach)
    return xp


fixture = start(120)
for host in (RIM, ISLAND, VALLEY, HUB):
    core.enterStoryNode(fixture, host)
write('work/natlan-atocpan-totem-fixture.json', saved(fixture))

reji, tupu = (specs[id] for id in (REJI, TUPU))
state = start(119)
walk = TrailWalk(lua, core, state, edges, exits)
core.action(state, 'story_accept:' + QUEST)
core.enterStoryNode(state, RIM)
walk.cross(RUINS)
assert walk.actor.y == 414
inspect(state, walk, 0)
check_level(state, walk, reji['node'])
walk.cross(RIM)

core.enterStoryNode(state, VALLEY)
walk.cross(HEADLAND)
walk.approach(865, 480, tupu['node'])
core.action(state, 'story_nearby_portal')
assert state.story.node == HEADLAND and state.lift is None
walk_onto_headland_shelf(walk, tupu['node'])
inspect(state, walk, 1)
check_level(state, walk, tupu['node'])
walk.cross(VALLEY)

core.grantExp(state, xp_to(120) - xp_to(119), 'quest')
guide(state, [(HEADLAND, 'walk'), (tupu['node'], 'night')])
walk.cross(ISLAND)
guide(state, [(HEADLAND, 'boat'), (tupu['node'], 'night')])
walk.cross(HEADLAND)
assert (walk.actor.x, walk.actor.y) == (1392, 480)
walk_onto_headland_shelf(walk, tupu['node'])
xp = {TUPU: exercise_trial(state, walk, tupu, HEADLAND)}
walk.cross(ISLAND)

core.enterStoryNode(state, RIM)
guide(state, [(RUINS, 'walk'), (reji['node'], 'night')])
walk.cross(RUINS)
xp[REJI] = exercise_trial(state, walk, reji, RUINS)
walk.cross(RIM)

restored = core.restore(lua.table_from(saved(state), recursive=True), 12)
assert {id: restored.endgame.bosses[id].clears for id in xp} == {REJI: 1, TUPU: 1}
core.action(restored, 'story_report:' + QUEST)
assert restored.story.quests[QUEST].status == 'complete'
write('evidence/natlan-atocpan-totem-lua.json', {
    'bothTrialLevelGates': True,
    'mapPlacesBranchesSeawardOfTheirAnchors': True,
    'rejiDownhillEntranceAndReturn': True,
    'tupuFerryAndMainlandTrailHaveDistinctMapGuides': True,
    'tupuPillarRequiresUpperShelf': True,
    'bothTrialsReturnToSameHeightAndReset': True,
    'clearRewardsAndQuestPersist': True,
    'killXp': xp,
})
print('Atocpan trials: both level gates, mainland and ferry approaches, pillar returns and saved clears passed')
