"""Play the three new snow legend routes and verify the group reward and restart."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


SNOW = 'snezhnaya-hub'
CAMP = 'novokichev-camp'
MOUSE_HOST = 'sne-wp-106194'
MINE_HOST = 'sne-wp-106186'
MOUSE, TREE, BEASTS = ('legend-snez_ancient_ironquill', 'legend-snez_elder_blighttree', 'legend-snez_rowdy_beast_host')
MOUSE_Q, TREE_Q, BEASTS_Q = ('sne-rescue-three-mice', 'sne-crystal-stream-survey', 'sne-suspicious-lantern')
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(origin, edge['to']): edge for origin, route in exits.items() for edge in route}
quests = {quest['id']: quest for quest in graph['quests']}
specs = {row['id']: row for row in read('content/field-boss-spawns.json')['fieldBosses']}
mouse, tree, beasts = (specs[id] for id in (MOUSE, TREE, BEASTS))
fissure, = mouse['entryThrough']
junction, gallery = tree['entryThrough']
alley = beasts['entryThrough'][1]
mouse_den, tree_refuge, ore_yard = (spec['node'] for spec in (mouse, tree, beasts))
lua, core = runtime()
attack = lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level, hub):
    result = core.new(12)
    core.action(result, 'story_start')
    core.enterStoryNode(result, hub)
    core.grantExp(result, exp(level), 'quest')
    for slot in (1, 2, 3):
        assert core.giveArtifact(result, slot, 60, 3)
        core.action(result, 'artifact_equip:' + str(slot))
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
    for _ in range(18000):
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


fixture = start(200, SNOW)
for node in (MOUSE_HOST, MINE_HOST, CAMP, SNOW):
    core.enterStoryNode(fixture, node)
write('work/snez-late-field-legends-fixture.json', saved(fixture))

state = start(159, SNOW)
core.action(state, 'story_accept:' + MOUSE_Q)
core.enterStoryNode(state, MOUSE_HOST)
walk = trail(state)
route(state, [fissure, mouse_den], 'blocked')
walk.cross(fissure)
for step in range(2):
    collect(state, walk, MOUSE_Q, step)
state = restore(state)
assert state.story.quests[MOUSE_Q].count == 2
core.enterStoryNode(state, MOUSE_HOST)
walk = trail(state)
walk.cross(fissure)
for step in range(2, 4):
    collect(state, walk, MOUSE_Q, step)
blocked(state, walk, mouse_den, '160')
core.grantExp(state, exp(160) - exp(159), 'quest')
route(state, [mouse_den], 'ready')
walk.cross(mouse_den)
xp = {MOUSE: defeat(state, walk, mouse)}
walk.cross(fissure)
walk.cross(MOUSE_HOST)
assert walk.actor.y == 395
core.enterStoryNode(state, SNOW)
core.action(state, 'story_report:' + MOUSE_Q)
assert state.story.quests[MOUSE_Q].status == 'complete'

state = start(197, CAMP)
core.action(state, 'story_accept:' + TREE_Q)
core.enterStoryNode(state, MINE_HOST)
walk = trail(state)
route(state, [junction, gallery, tree_refuge], 'blocked')
walk.cross(junction)
blocked(state, walk, gallery, '水位表')
collect(state, walk, TREE_Q, 0)
walk.cross(gallery)
collect(state, walk, TREE_Q, 1)
blocked(state, walk, tree_refuge, '198')
core.grantExp(state, exp(198) - exp(197), 'quest')
walk.cross(tree_refuge)
xp[TREE] = defeat(state, walk, tree)
walk.cross(gallery)
assert walk.actor.y == 389
walk.cross(junction)
walk.cross(MINE_HOST)
assert walk.actor.y == 344

core.enterStoryNode(state, CAMP)
core.action(state, 'story_report:' + TREE_Q)
assert state.story.quests[TREE_Q].status == 'complete'
core.action(state, 'story_accept:' + BEASTS_Q)
core.enterStoryNode(state, MINE_HOST)
route(state, [junction, alley, ore_yard], 'blocked')
walk.cross(junction)
walk.cross(alley)
for step in range(2):
    collect(state, walk, BEASTS_Q, step)
blocked(state, walk, ore_yard, '200')
core.grantExp(state, exp(200) - exp(198), 'quest')
route(state, [ore_yard], 'ready')
walk.cross(ore_yard)
before = rewards(state)
group = state.fieldSlots[BEASTS].enemy
members = list(group.fieldMembers.values())
assert [member.memberName for member in members] == ['スタヴローギン', 'バルバラ', 'ヴェルホヴェンスキー']
assert {member.id for member in members} == {enemy.id for enemy in state.enemies.values()}
hit(state, walk, members[0])
assert rewards(state) == before and state.endgame.bosses[BEASTS] is None
assert group.hp == members[1].hp + members[2].hp
walk.cross(alley)
walk.cross(ore_yard)
group = state.fieldSlots[BEASTS].enemy
members = list(group.fieldMembers.values())
assert [member.hp for member in members] == [member['hp'] for member in beasts['members']]
for member in members:
    hit(state, walk, member)
xp[BEASTS] = check_clear(state, beasts, before)
assert {move['member'] for move in beasts['moves']} == {member.id for member in members}
walk.cross(alley)
walk.cross(junction)
walk.cross(MINE_HOST)
core.enterStoryNode(state, CAMP)
core.action(state, 'story_report:' + BEASTS_Q)
assert restore(state).story.quests[BEASTS_Q].status == 'complete'

regions = {row['id']: {point['id']: point for point in row['points']}
           for row in read('content/world-atlas.json')['regions']}
m = regions['region-08'][mouse_den]
places = regions['branch-09']
t, b, h = (places[id] for id in (tree_refuge, ore_yard, MINE_HOST))
assert m['y'] > regions['region-08'][MOUSE_HOST]['y']
assert 0 < t['y'] < b['y'] < h['y'] < 500
assert all(p['huntKind']=='elite' and p['layer']=='below' for p in (m,t,b))
write('evidence/snez-late-field-legends-lua.json', dict(
    threeMouseRescuesAndMidQuestSave=True,
    crystalAndLanternGatesWithReports=True,
    entranceLevels=[mouse['level'], tree['level'], beasts['level']],
    raisedTrailReturns=True, mapPointsInDesignLayers=True,
    threeIndividuallyTargetableMembers=True, partialKillGivesNoReward=True,
    partialGroupResetsOnExit=True, eachFullClearGivesOneSavedReward=True, killXp=xp))
print('Snezhnaya 7.2: three quest gates, routes, separate group members and single saved rewards passed')
