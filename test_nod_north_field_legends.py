"""Check the ungated northern field encounters and the three-route optional survey."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


HUB = 'nod-north-harbor'
MAND = 'legend-nod_hexadecatonic_mandragora'
HILT = 'legend-nod_hiljetta'
WOLF = 'legend-nod_homesick_lone_wolf'
HOSTS = {MAND: 'nod-wp-92875', HILT: 'nod-wp-92879', WOLF: 'nod-wp-92889'}
ALTERNATE = 'nod-wp-92880'
QUEST = 'nod-north-landmark-round'
graph = read('content/story-graph.json')
exits = {n['id']: n['exits'] for n in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quest = next(q for q in graph['quests'] if q['id'] == QUEST)
steps = {path['id']: path['steps'][0] for path in quest['paths']}
specs = {row['id']: row for row in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
attack = lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, exp(level), 'quest')
    for slot in (1, 2):
        assert core.giveArtifact(state, slot, 40, 3)
        core.action(state, 'artifact_equip:' + str(slot))
    return state


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def restore(state):
    return core.restore(lua.table_from(saved(state), recursive=True), 12)


def walk_for(state):
    return TrailWalk(lua, core, state, edges, exits)


def guide(state, expected):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + expected[-1])
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == [(id, 'walk') for id in expected]
    core.action(state, 'world_map_toggle')


def enter_shelf(walk, next_node, shelves):
    for x, y in shelves:
        walk.approach(x, y, next_node)


def survey(state, walk, leg, expected_total):
    step = steps[leg]
    walk.approach(step['x'], step['y'], QUEST)
    core.action(state, 'story_collect')
    assert state.story.quests[QUEST].pathProgress[leg].count == 1
    assert state.story.quests[QUEST].count == expected_total


def check_level(state, walk, spec):
    arena = spec['node']
    edge = edges[state.story.node, arena]
    walk.approach(edge['x'], edge.get('y', 480), arena)
    near = core.frame(state).storyNearbyPortal
    assert near.to == arena and not near.available and str(spec['level']) in near.reason
    node = state.story.node
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


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
        core.step(state, 1 / 60, attack)
    assert slot.phase == 'cleared', (spec['id'], slot.enemy.hp)
    xp = int(LEVELS[spec['level'] - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    approach = spec['entryThrough'][0]
    walk.cross(approach)
    entry = edges[approach, spec['node']]
    assert (walk.actor.x, walk.actor.y) == (entry['x'], entry.get('y', 480))
    walk.cross(spec['node'])
    assert state.fieldSlots[spec['id']].enemy.hp == spec['hp']
    walk.cross(approach)
    return xp


mand, hilt, wolf = (specs[id] for id in (MAND, HILT, WOLF))
cliff, point, ridge = (spec['entryThrough'][0] for spec in (mand, hilt, wolf))
fixture = start(140)
for host in (*HOSTS.values(), ALTERNATE, HUB):
    core.enterStoryNode(fixture, host)
write('work/nod-north-field-legends-fixture.json', saved(fixture))

state = start(137)
core.action(state, 'story_accept:' + QUEST)
walk = walk_for(state)
core.enterStoryNode(state, HOSTS[WOLF])
walk.cross(ridge)
walk.approach(1360, 480, wolf['node'])
core.action(state, 'story_nearby_portal')
assert state.story.node == ridge
enter_shelf(walk, wolf['node'], [(570,412),(836,345)])
survey(state, walk, 'ridge', 0)
check_level(state, walk, wolf)
walk.cross(HOSTS[WOLF])

core.enterStoryNode(state, ALTERNATE)
walk.cross(point)
survey(state, walk, 'peninsula', 0)
check_level(state, walk, hilt)
walk.cross(HOSTS[HILT])

state = restore(state)
walk = walk_for(state)
assert native(state.story.quests[QUEST].pathProgress) == {
    'peninsula': {'count': 1}, 'ridge': {'count': 1}, 'coast': {'count': 0},
}
core.enterStoryNode(state, HOSTS[MAND])
walk.cross(cliff)
assert walk.actor.y == 340
walk.approach(580, 411, mand['node'])
survey(state, walk, 'coast', 1)
check_level(state, walk, mand)
core.grantExp(state, exp(138) - exp(137), 'quest')
walk.cross(mand['node'])
xp = {MAND: defeat(state, walk, mand)}
enter_shelf(walk, HOSTS[MAND], [(640,411),(365,340)])
walk.cross(HOSTS[MAND])
core.enterStoryNode(state, HOSTS[HILT])
guide(state, [point, hilt['node']])
walk.cross(point)
walk.cross(ALTERNATE)
guide(state, [point, hilt['node']])
walk.cross(point)
walk.cross(hilt['node'])
xp[HILT] = defeat(state, walk, hilt)
walk.cross(HOSTS[HILT])

core.enterStoryNode(state, HOSTS[WOLF])
walk.cross(ridge)
enter_shelf(walk, wolf['node'], [(570,412),(836,345)])
check_level(state, walk, wolf)
core.grantExp(state, exp(140) - exp(138), 'quest')
walk.cross(wolf['node'])
xp[WOLF] = defeat(state, walk, wolf)
walk.cross(HOSTS[WOLF])

restored = restore(state)
assert {id:restored.endgame.bosses[id].clears for id in xp} == dict.fromkeys(xp, 1)
core.action(restored, 'story_report:' + QUEST)
assert restored.story.quests[QUEST].status == 'complete'

without_quest = start(140)
walk = walk_for(without_quest)
for spec in (mand,hilt,wolf):
    core.enterStoryNode(without_quest, HOSTS[spec['id']])
    walk.cross(spec['entryThrough'][0])
    if spec is wolf:
        enter_shelf(walk, spec['node'], [(570,412),(836,345)])
    walk.cross(spec['node'])
assert without_quest.story.quests[QUEST] is None
coverage = read('content/coverage.json')['optional_legend_coverage']['stage_by_legend']
regional = {row['encounter_id'] for row in read('design/world/encounters.json')['legends'] if row['region_id']=='region-07'}
assert regional.issubset(coverage)
write('evidence/nod-north-field-legends-lua.json', {
    'surveyBranchesPersistAndAcceptDifferentOrder': True,
    'threeEncountersAccessibleWithoutSurvey': True,
    'coastDescentAndReturn': True,
    'bothPeninsulaEntries': True,
    'highRidgeGateAndReturn': True,
    'levelGatesAndRewardRestore': True,
    'mainNodKraiConnected': len(regional),
    'killXp': xp,
})
print('North Nod-Krai: independent survey paths, three ungated approaches and saved rewards passed')
