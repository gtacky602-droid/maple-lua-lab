"""Play the four remaining legend routes, including two console trials and a reload."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


DORN, SKY, FROST = 'dornman-camp', 'nat-sky-camp', 'frostmoon-camp'
CH_HOST, MA_HOST, PR_HOST, MU_HOST = 'mond-wp-95792', 'nat-wp-96377', 'frost-wp-99287', 'frost-wp-99306'
CH, MA = 'legend-mondstadt_churldric', 'legend-mondstadt_maha_vasudevayaputra'
PR, MU = 'legend-frostmoon_prism_slime', 'legend-frostmoon_mushteshir'
MA_Q, FR_Q, MU_Q = 'sky-pavilion-notes', 'frost-wujian-access-survey', 'frost-commander-console-test'
FIRST, SECOND = 'frost-commander-first-wave', 'frost-commander-second-wave'
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(origin, edge['to']): edge for origin, route in exits.items() for edge in route}
quests = {quest['id']: quest for quest in graph['quests']}
specs = {item['id']: item for item in read('content/field-boss-spawns.json')['fieldBosses']}
chur, maha, prism, musht = (specs[id] for id in (CH, MA, PR, MU))
chur_trail, = chur['entryThrough']
maha_trail, = maha['entryThrough']
prism_trail, = prism['entryThrough']
console, = musht['entryThrough']
chur_camp, maha_court, basin, chamber = (spec['node'] for spec in (chur, maha, prism, musht))
lua, core = runtime()
attack = lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level, hub):
    result = core.new(12)
    core.action(result, 'story_start')
    core.enterStoryNode(result, hub)
    core.grantExp(result, exp(level), 'quest')
    return result


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def restore(state):
    return core.restore(lua.table_from(saved(state), recursive=True), 12)


def trail(state):
    return TrailWalk(lua, core, state, edges, exits)


def blocked(state, walk, target, clue):
    source = state.story.node
    gate = edges[source, target]
    walk.approach(gate['x'], gate.get('y', 480), target)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == target and not portal.available and clue in portal.reason, (target, portal.reason)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == source


def collect(state, walk, quest, step):
    item = quests[quest]['itinerary'][step]
    assert state.story.node == item['node']
    walk.approach(item['x'], item['y'], quest)
    core.action(state, 'story_collect')
    assert state.story.quests[quest].count == step + 1


def route(state, stops, status):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + stops[-1])
    view = core.frame(state).worldMap
    assert view.guide.status == status, (view.guide.reason, stops)
    assert [leg.id for leg in view.guide.stops.values()] == stops
    core.action(state, 'world_map_toggle')


def hit(state, walk, target):
    state.actors[2].hp = 0
    walk.approach(target.x - 42, 480, target.id)
    walk.actor.dir = 1
    for _ in range(21000):
        if target.hp <= 0:
            break
        core.step(state, 1 / 60, attack)
    assert target.hp <= 0, (target.id, target.hp)


def rewards(state):
    return state.kills, state.mora, state.progression.killXp


def check_clear(state, spec, before):
    slot = state.fieldSlots[spec['id']]
    assert slot.phase == 'cleared' and slot.enemy.hp == 0
    normal = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    xp = int(normal * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert rewards(state) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    assert restore(state).endgame.bosses[spec['id']].clears == 1
    return xp


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    assert slot.enemy.hp == spec['hp']
    before = rewards(state)
    hit(state, walk, slot.enemy)
    return check_clear(state, spec, before)



def raise_level(state, level, previous):
    core.grantExp(state, exp(level) - exp(previous), 'quest')
    assert state.progression.level == level


def report(state, hub, quest):
    core.enterStoryNode(state, hub)
    core.action(state, 'story_report:' + quest)
    assert state.story.quests[quest].status == 'complete'


def fight_wave(state, walk, stage, step):
    wave = quests[MU_Q]['itinerary'][step]
    assert wave['node'] == stage
    assert {enemy.spawnId for enemy in state.enemies.values()} == set(wave['enemies'])
    for index, enemy in enumerate(list(state.enemies.values())):
        hit(state, walk, enemy)
        assert state.story.quests[MU_Q].count == step + index


fixture = start(190, DORN)
for node in (CH_HOST, MA_HOST, PR_HOST, MU_HOST, SKY, FROST, 'frost-wp-99285', DORN):
    core.enterStoryNode(fixture, node)
write('work/final-field-legends-fixture.json', saved(fixture))

state = start(174, DORN)
core.enterStoryNode(state, CH_HOST)
walk = trail(state)
route(state, [chur_trail, chur_camp], 'blocked')
walk.cross(chur_trail)
blocked(state, walk, chur_camp, '175')
raise_level(state, 175, 174)
walk.cross(chur_camp)
xp = {CH: defeat(state, walk, chur)}
walk.cross(chur_trail)
assert walk.actor.y == 406
walk.cross(CH_HOST)
assert walk.actor.y == 388

state = start(184, SKY)
core.action(state, 'story_accept:' + MA_Q)
core.enterStoryNode(state, MA_HOST)
walk = trail(state)
route(state, [maha_trail, maha_court], 'blocked')
walk.cross(maha_trail)
for step in range(3):
    collect(state, walk, MA_Q, step)
blocked(state, walk, maha_court, '185')
raise_level(state, 185, 184)
route(state, [maha_court], 'ready')
walk.cross(maha_court)
xp[MA] = defeat(state, walk, maha)
walk.cross(maha_trail)
assert walk.actor.y == 409
walk.cross(MA_HOST)
assert walk.actor.y == 365
report(state, SKY, MA_Q)

state = start(187, FROST)
walk = trail(state)
core.action(state, 'story_accept:' + FR_Q)
assert state.story.quests[FR_Q].count == 0
collect(state, walk, FR_Q, 0)
for station in ('frost-wp-99282', 'frost-wp-99284', 'frost-wp-99285'):
    walk.cross(station)
collect(state, walk, FR_Q, 1)
core.enterStoryNode(state, MU_HOST)
blocked(state, walk, console, '報告')
report(state, FROST, FR_Q)
core.action(state, 'story_accept:' + MU_Q)
assert state.story.quests[MU_Q].count == 0
core.enterStoryNode(state, PR_HOST)
walk.cross(prism_trail)
blocked(state, walk, basin, '188')
raise_level(state, 188, 187)
walk.cross(basin)
xp[PR] = defeat(state, walk, prism)
walk.cross(prism_trail)
walk.cross(PR_HOST)
assert walk.actor.y == 408

core.enterStoryNode(state, MU_HOST)
route(state, [console, chamber], 'blocked')
walk.cross(console)
blocked(state, walk, FIRST, '第一試験')
collect(state, walk, MU_Q, 0)
walk.cross(FIRST)
fight_wave(state, walk, FIRST, 1)
walk.cross(console)
state = restore(state)
assert state.story.quests[MU_Q].count == 2
core.enterStoryNode(state, MU_HOST)
walk = trail(state)
walk.cross(console)
blocked(state, walk, SECOND, 'もう一度')
walk.cross(FIRST)
assert not list(state.enemies.values())
walk.cross(console)
collect(state, walk, MU_Q, 2)
walk.cross(SECOND)
fight_wave(state, walk, SECOND, 3)
walk.cross(console)
collect(state, walk, MU_Q, 4)
blocked(state, walk, chamber, '190')
raise_level(state, 190, 188)
route(state, [chamber], 'ready')
walk.cross(chamber)
xp[MU] = defeat(state, walk, musht)
walk.cross(console)
walk.cross(SECOND)
assert not list(state.enemies.values())
walk.cross(console)
walk.cross(MU_HOST)
assert walk.actor.y == 390
report(state, FROST, MU_Q)
assert restore(state).story.quests[MU_Q].status == 'complete'
assert all(not specs[id]['moves'] for id in (CH, MA, PR, MU))

expected = {row['encounter_id'] for row in read('design/world/encounters.json')['legends']}
covered = read('content/coverage.json')['optional_legend_coverage']['stage_by_legend']
assert expected == covered.keys()
write('evidence/final-field-legends-lua.json', dict(
    entranceLevels=[chur['level'], maha['level'], prism['level'], musht['level']],
    madhavaGateAndLiftReturn=True, sharedBiodomeReportUnlocksNorthAndSouth=True,
    twoRealTwoEnemyWaves=True, eachStartUsesSameConsole=True,
    firstCompletionSurvivesSave=True, clearedWavesDoNotRespawn=True,
    allFourClearRewardsSaved=True, designRegistryBound=len(covered), killXp=xp))
print(f'{len(covered)} legend bindings total; four routes, console trials, saves and clear rewards passed')
