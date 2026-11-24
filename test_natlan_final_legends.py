"""Check the last three main-region Natlan encounters and two-body reward boundaries."""
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
PEAK_HOST = 'nat-wp-82571'
COAST = 'nat-wp-82564'
DOMAIN = 'sites-hunt-82577'
BAY = 'nat-wp-85972'
PEAK = 'legend-natlan_peak'
PAIR = 'legend-natlan_battlegoat_ironclaw'
TENO = 'legend-natlan_last_tenochtzitoc'
QUEST = 'natlan-southern-trail-survey'
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quest = next(q for q in graph['quests'] if q['id'] == QUEST)
specs = {row['id']: row for row in read('content/field-boss-spawns.json')['fieldBosses']}
design = {row['encounter_id']: row for row in read('design/world/encounters.json')['legends']}
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


def guide(state, stops):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + stops[-1])
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready'
    assert [leg.id for leg in route.stops.values()] == stops
    core.action(state, 'world_map_toggle')


def gate_locked(state, walk, stage):
    edge = edges[state.story.node, stage]
    walk.approach(edge['x'], edge.get('y', 480), stage)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == stage and not portal.available and '120' in portal.reason


def collect(state, walk, index):
    spot = quest['itinerary'][index]
    walk.approach(spot['x'], spot['y'], QUEST)
    core.action(state, 'story_collect')
    assert state.story.quests[QUEST].count == index + 1


def reward_totals(state):
    return state.kills, state.mora, state.progression.killXp


def defeat_body(state, walk, body):
    for _ in range(6900):
        if body.hp <= 0:
            break
        distance = body.x - walk.actor.x
        if abs(distance) > 72:
            walk.approach(body.x - (42 if distance > 0 else -42), 480, body.id)
        walk.actor.dir = 1 if body.x >= walk.actor.x else -1
        core.step(state, 1 / 60, attack)
    assert body.hp <= 0, (body.id, body.hp)


def assert_reward(state, spec, before):
    assert state.fieldSlots[spec['id']].phase == 'cleared'
    xp = int(LEVELS[119]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert reward_totals(state) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert state.endgame.bosses[spec['id']].clears == 1
    return xp


def defeat_single(state, walk, spec):
    boss = state.fieldSlots[spec['id']].enemy
    before = reward_totals(state)
    defeat_body(state, walk, boss)
    return assert_reward(state, spec, before)


peak, pair, teno = (specs[id] for id in (PEAK, PAIR, TENO))
p_trail, d_trail = (spec['entryThrough'][0] for spec in (peak, pair))
fixture = start(120)
for host in (PEAK_HOST, COAST, BAY, 'nat-wp-82557', 'natlan-port', HUB):
    core.enterStoryNode(fixture, host)
write('work/natlan-final-legends-fixture.json', saved(fixture))

state = start(119)
walk = TrailWalk(lua, core, state, edges, exits)
core.action(state, 'story_accept:' + QUEST)
core.enterStoryNode(state, PEAK_HOST)
walk.cross(p_trail)
walk.approach(526, 412, peak['node'])
walk.approach(851, 346, peak['node'])
collect(state, walk, 0)
gate_locked(state, walk, peak['node'])

core.enterStoryNode(state, COAST)
walk.cross(DOMAIN)
walk.cross(d_trail)
collect(state, walk, 1)
gate_locked(state, walk, pair['node'])
walk.cross(COAST)
core.enterStoryNode(state, BAY)
gate_locked(state, walk, teno['node'])

core.grantExp(state, exp(120) - exp(119), 'quest')
guide(state, [teno['node']])
walk.cross(teno['node'])
state.actors[2].hp = 0
assert not state.storySwimming
xp = {TENO: defeat_single(state, walk, teno)}
walk.cross(BAY)
assert walk.actor.y == 419
core.enterStoryNode(state, PEAK_HOST)
guide(state, [p_trail, peak['node']])
walk.cross(p_trail)
walk.approach(526, 412, peak['node'])
walk.approach(851, 346, peak['node'])
walk.cross(peak['node'])
state.actors[2].hp = 0
xp[PEAK] = defeat_single(state, walk, peak)
walk.cross(p_trail)
assert walk.actor.y == 346
walk.cross(PEAK_HOST)

core.enterStoryNode(state, COAST)
guide(state, [d_trail, pair['node']])
walk.cross(d_trail)
walk.cross(DOMAIN)
guide(state, [d_trail, pair['node']])
walk.cross(d_trail)
walk.cross(pair['node'])
state.actors[2].hp = 0
group = state.fieldSlots[PAIR].enemy
members = list(group.fieldMembers.values())
assert len(members) == design[PAIR]['simultaneous_member_count'] == 2
assert {member.memberName for member in members} == set(design[PAIR]['members'])
assert {entity.id for entity in state.enemies.values()} == {member.id for member in members}
assert [body.y - body.hitTop for body in members] == [body['artHeight'] for body in pair['members']]
before = reward_totals(state)
defeat_body(state, walk, members[0])
assert reward_totals(state) == before and state.endgame.bosses[PAIR] is None
assert group.hp == members[1].hp > 0
walk.cross(d_trail)
walk.cross(pair['node'])
state.actors[2].hp = 0
members = list(state.fieldSlots[PAIR].enemy.fieldMembers.values())
assert [member.hp for member in members] == [data['hp'] for data in pair['members']]
for member in members:
    defeat_body(state, walk, member)
xp[PAIR] = assert_reward(state, pair, before)
assert not core.defeatEnemy(state, members[1], 1)
assert_reward(state, pair, before)
walk.cross(d_trail)

restored = core.restore(lua.table_from(saved(state), recursive=True), 12)
assert {id:restored.endgame.bosses[id].clears for id in xp} == dict.fromkeys(xp, 1)
core.action(restored, 'story_report:' + QUEST)
assert restored.story.quests[QUEST].status == 'complete'
coverage = read('content/coverage.json')['optional_legend_coverage']['stage_by_legend']
regional = {id for id, spec in design.items() if spec['region_id'] == 'region-06'}
assert regional.issubset(coverage)
write('evidence/natlan-final-legends-lua.json', {
    'threeLv120Gates': True,
    'peakReturnOnUpperShelf': True,
    'domainAndCoastalPathsLeadToSamePair': True,
    'bayFightOnShallowGround': True,
    'groupHasDistinctHitboxesAndHp': True,
    'partialDefeatGivesNoRewardAndResetsOnReentry': True,
    'onlyFullGroupDefeatSavedAsOneClear': True,
    'allThreeClearsAndSurveyRestore': True,
    'mainNatlanConnected': len(regional),
    'killXp': xp,
})
print('Natlan field legends: three gates, both routes, per-body HP and one saved group reward passed')
