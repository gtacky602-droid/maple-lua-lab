"""Drive the waterfall and sea-cliff routes through the Lua story entry points."""
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
QUEST = 'natlan-two-pillar-trails'
POTAPO = 'legend-natlan_potapo'
TUPAYO = 'legend-natlan_tupayo'
WATER_HOST = 'nat-wp-79051'
CLIFF_HOST = 'nat-wp-79542'
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quest = next(q for q in graph['quests'] if q['id'] == QUEST)
specs = {row['id']: row for row in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle, attack = lua.table(), lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, exp(level), 'quest')
    return state


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def tick(state, frames, controls=idle):
    for _ in range(frames):
        core.step(state, 1 / 60, controls)


def guide(state, approach, arena):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + arena)
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == [(approach, 'walk'), (arena, 'night')]
    core.action(state, 'world_map_toggle')


def collect(state, walk, index):
    spot = quest['itinerary'][index]
    walk.approach(spot['x'], spot['y'], QUEST)
    core.action(state, 'story_collect')


def check_level(state, walk, spec):
    arena = spec['node']
    pillar = edges[state.story.node, arena]
    walk.approach(pillar['x'], pillar.get('y', 480), arena)
    near = core.frame(state).storyNearbyPortal
    assert near.to == arena and not near.available and str(spec['level']) in near.reason
    core.action(state, 'story_nearby_portal')
    assert state.lift is None


def defeat(state, walk, spec):
    arena = spec['node']
    slot = state.fieldSlots[spec['id']]
    assert slot.enemy.hp == spec['hp']
    walk.approach(slot.enemy.x - 42, 480, arena)
    walk.actor.dir = 1
    before = state.kills, state.mora, state.progression.killXp
    for _ in range(6900):
        if slot.phase == 'cleared':
            break
        tick(state, 1, attack)
    assert slot.phase == 'cleared', (arena, slot.enemy.hp)
    base = LEVELS[state.progression.level - 1]['normal_enemy_base_exp']
    xp = int(base * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    assert state.endgame.bosses[spec['id']].clears == 1
    return xp


potapo, tupayo = (specs[id] for id in (POTAPO, TUPAYO))
water, cliff = (spec['entryThrough'][0] for spec in (potapo, tupayo))
fixture = start(120)
for host in (WATER_HOST, CLIFF_HOST, HUB):
    core.enterStoryNode(fixture, host)
write('work/natlan-wayob-duo-fixture.json', saved(fixture))

state = start(117)
walk = TrailWalk(lua, core, state, edges, exits)
core.action(state, 'story_accept:' + QUEST)
core.enterStoryNode(state, WATER_HOST)
walk.cross(water)
assert walk.actor.y == 335
walk.approach(570, 407, water)
collect(state, walk, 0)
assert state.story.quests[QUEST].count == 1 and walk.actor.y == 480
check_level(state, walk, potapo)
core.grantExp(state, exp(118) - exp(117), 'quest')
walk.approach(665, 407, WATER_HOST)
walk.approach(368, 335, WATER_HOST)
walk.cross(WATER_HOST)
guide(state, water, potapo['node'])
walk.cross(water)
walk.cross(potapo['node'])
xp = {POTAPO: defeat(state, walk, potapo)}
walk.cross(water)
assert (walk.actor.x, walk.actor.y) == (1220, 480)
walk.cross(potapo['node'])
assert state.fieldSlots[POTAPO].enemy.hp == potapo['hp']
walk.cross(water)
walk.approach(665, 407, WATER_HOST)
walk.approach(368, 335, WATER_HOST)
walk.cross(WATER_HOST)
core.enterStoryNode(state, CLIFF_HOST)

core.grantExp(state, exp(119) - exp(118), 'quest')
walk.cross(cliff)
walk.approach(1410, 480, cliff)
core.action(state, 'story_nearby_portal')
assert state.story.node == cliff and state.lift is None
for x,y in ((476,412),(681,343),(995,274)):
    walk.approach(x,y,cliff)
collect(state, walk, 1)
assert state.story.quests[QUEST].count == 2
check_level(state, walk, tupayo)
core.grantExp(state, exp(120) - exp(119), 'quest')
walk.cross(CLIFF_HOST)
guide(state, cliff, tupayo['node'])
walk.cross(cliff)
for x,y in ((476,412),(681,343),(995,274)):
    walk.approach(x,y,cliff)
walk.cross(tupayo['node'])
for actor in state.actors.values():
    actor.hp = 0
tick(state, 1)
assert state.story.node == cliff and (walk.actor.x, walk.actor.y) == (1410, 274)
walk.cross(tupayo['node'])
xp[TUPAYO] = defeat(state, walk, tupayo)
walk.cross(cliff)
assert (walk.actor.x, walk.actor.y) == (1410, 274)
walk.cross(tupayo['node'])
assert state.fieldSlots[TUPAYO].enemy.hp == tupayo['hp']
walk.cross(cliff)
walk.cross(CLIFF_HOST)

restored = core.restore(lua.table_from(saved(state), recursive=True), 12)
assert {id: restored.endgame.bosses[id].clears for id in xp} == {POTAPO: 1, TUPAYO: 1}
core.action(restored, 'story_report:' + QUEST)
assert restored.story.quests[QUEST].status == 'complete'
write('evidence/natlan-wayob-duo-lua.json', {
    'waterfallTwoShelfDescentAndReturn': True,
    'cliffThreeShelfAccessAndDefeatReturn': True,
    'mapGuideUsesLocalApproachesAndPillars': True,
    'potapoBlockedAtLv117AndAccessibleAtLv118': True,
    'tupayoBlockedAtLv119AndAccessibleAtLv120': True,
    'bothRecordsAndQuestPersist': True,
    'killXp': xp,
})
print('Wayob trials: descent, climb, both level gates, trial return, and saved clears passed')
