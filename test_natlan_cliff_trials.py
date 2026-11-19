"""Check the wall crossing, the solo trial boundary, and the four high shelves."""
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
ATLATL = 'legend-natlan_atlatl'
CIHUA = 'legend-natlan_cihuacoatl'
WATER_HOST = 'nat-wp-72414'
PLATEAU_HOST = 'nat-wp-72759'
HUNT = 'sites-hunt-73159'
QUEST = 'natlan-ancient-excavation-wall'
graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quest = next(q for q in graph['quests'] if q['id'] == QUEST)
specs = {spec['id']: spec for spec in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle = lua.table()
attack = lua.table(attack=True)
dt = 1 / 60


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    return state


def save(state):
    return validate_save(native(core.checkpoint(state)))


def walk_for(state):
    return TrailWalk(lua, core, state, edges, exits)


def tick(state, frames, input=idle):
    for _ in range(frames):
        core.step(state, dt, input)


def guide(state, arena, expected):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + arena)
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == expected
    core.action(state, 'world_map_toggle')


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    walk.approach(slot.enemy.x - 45, 480, spec['node'])
    walk.actor.dir = 1
    before = state.kills, state.mora, state.progression.killXp
    for _ in range(6900):
        if slot.phase == 'cleared':
            break
        tick(state, 1, attack)
    assert slot.phase == 'cleared'
    xp = int(LEVELS[spec['level'] - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert state.endgame.bosses[spec['id']].clears == 1


atlatl = specs[ATLATL]
water, ledge = atlatl['entryThrough']
arena = atlatl['node']
fixture = start(118)
for hub in (WATER_HOST, PLATEAU_HOST):
    core.enterStoryNode(fixture, hub)
core.enterStoryNode(fixture, HUB)
write('work/natlan-cliff-trials-fixture.json', save(fixture))

s = start(114)
walk = walk_for(s)
core.action(s, 'story_accept:' + QUEST)
core.enterStoryNode(s, WATER_HOST)
guide(s, arena, [(water, 'walk'), (ledge, 'wall'), (arena, 'night')])
walk.cross(water)
assert s.progression.level == 114 and not s.story.visited[HUNT]
first, _, last = quest['itinerary']
walk.approach(first['x'], first['y'], QUEST)
core.action(s, 'story_collect')
assert s.story.quests[QUEST].count == 1
edge = edges[water, ledge]
walk.approach(edge['x'], 480, ledge)
x0, y0 = walk.actor.x, walk.actor.y
core.action(s, 'story_nearby_portal')
assert s.lift.destination == ledge and core.frame(s).storyLift.wall
tick(s, 54)
assert s.story.node == water and x0 < walk.actor.x < edge['wallTrack']['x']
assert edge['wallTrack']['y'] < walk.actor.y < y0
assert s.camera > 0
assert not any(draw.color == '#5e5b48' for draw in core.frame(s).draws.values())
core.action(s, 'pause')
position = walk.actor.x, walk.actor.y, s.lift.remaining
tick(s, 23)
assert position == (walk.actor.x, walk.actor.y, s.lift.remaining)
core.action(s, 'pause')
tick(s, 160)
assert s.story.node == ledge and s.story.quests[QUEST].count == 2 and walk.actor.y == 272
walk.approach(last['x'], last['y'], QUEST)
core.action(s, 'story_collect')
assert s.story.quests[QUEST].count == 3
walk.cross(water)
walk.cross(ledge)

ally = s.actors[2]
ally.hp = 73
core.action(s, 'swap')
assert s.active == 2
traveler = s.actors[1]
traveler.hp = 0
pillar = edges[ledge, arena]
walk.approach(pillar['x'], pillar['y'], arena)
closed = core.frame(s).storyNearbyPortal
assert closed.to == arena and not closed.available and '旅人' in closed.reason
core.action(s, 'story_nearby_portal')
assert s.story.node == ledge and s.lift is None
traveler.hp = traveler.maxhp
walk.cross(arena)
assert s.active == 1 and ally.hp == 0 and core.frame(s).storyTravelerTrial
assert save(s)['active'] == 2
core.action(s, 'swap')
assert s.active == 1
traveler.hp = 0
tick(s, 1)
assert s.story.node == ledge and s.active == 2 and ally.hp == 73
assert walk.actor.y == pillar['y'] and walk.actor.x == pillar['x'] - 40
walk.cross(arena)
defeat(s, walk, atlatl)
saved = save(s)
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == HUB and restored.active == 2 and restored.endgame.bosses[ATLATL].clears == 1
walk.cross(ledge)
assert s.active == 2 and ally.hp == 73 and not core.frame(s).storyTravelerTrial
core.action(restored, 'story_report:' + QUEST)
assert restored.story.quests[QUEST].status == 'complete'

s = start(119)
walk = walk_for(s)
core.enterStoryNode(s, WATER_HOST)
walk.cross(HUNT)
walk.cross(water)
walk.cross(HUNT)

cihua = specs[CIHUA]
plateau = cihua['entryThrough'][0]
arena = cihua['node']
s = start(118)
walk = walk_for(s)
core.enterStoryNode(s, PLATEAU_HOST)
guide(s, arena, [(plateau, 'walk'), (arena, 'night')])
walk.cross(plateau)
edge = edges[plateau, arena]
walk.approach(edge['x'], 480, arena)
core.action(s, 'story_nearby_portal')
assert s.story.node == plateau and s.lift is None
for x, y in ((495, 412), (631, 343), (870, 275), (1143, 207)):
    walk.approach(x, y, arena)
walk.cross(arena)
assert s.actors[2].hp > 0 and not core.frame(s).storyTravelerTrial
defeat(s, walk, cihua)
walk.cross(plateau)
assert (walk.actor.x, walk.actor.y) == (edge['x'], edge['y'])
walk.cross(arena)
assert s.fieldSlots[CIHUA].enemy.hp == cihua['hp']
assert core.restore(lua.table_from(save(s), recursive=True), 12).endgame.bosses[CIHUA].clears == 1

write('evidence/natlan-cliff-trials-lua.json', {
    'atlatlAccessibleAtLv114WithoutLv119Hunt': True, 'higherHuntSideAlsoConnectedBothWays': True,
    'wallMovesActorsAndPauses': True,
    'wallSurveyCompletedAndReported': True, 'soloTrialRejectsDownedTraveler': True,
    'soloRestoresCompanionAndSelectedActorOnExitAndDefeat': True,
    'cihuacoatlGateRequiresTopShelf': True, 'cihuacoatlReturnPlacesPartyOnShelf': True,
    'bothClearsAndRewardsPersist': True,
})
print('Cliff trials: wall traversal, Lv114 route, solo entry/exit, shelves and saved clears passed')
