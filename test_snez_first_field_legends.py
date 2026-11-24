"""Play the two snow bouts, story-passage unlock, and low-level domain bypass."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


HUB = 'snezhnaya-hub'
CH_HOST = 'sne-wp-100697'
BA_HOST = 'sne-wp-100658'
DOMAIN = 'sites-hunt-100707'
ALT = 'sne-wp-100695'
CH_Q = 'sne-snow-sculptor-bouts'
BA_Q = 'sne-svetloredovka-cavern-check'
CH = 'legend-snez_churin'
BA = 'legend-snez_bandersnatch'
FU = 'legend-snez_furiosa'
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quests = {row['id']: row for row in graph['quests']}
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


def guide(state, stops, status):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + stops[-1])
    route = core.frame(state).worldMap.guide
    assert route.status == status, (stops, route.status, route.reason)
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == [(stop, 'walk') for stop in stops]
    core.action(state, 'world_map_toggle')


def gate_locked(state, walk, target, text):
    node = state.story.node
    edge = edges[node, target]
    walk.approach(edge['x'], edge.get('y', 480), target)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == target and not portal.available and text in portal.reason, portal.reason
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def collect(state, walk, qid, index):
    step = quests[qid]['itinerary'][index]
    walk.approach(step['x'], step['y'], qid)
    core.action(state, 'story_collect')
    assert state.story.quests[qid].count == index + 1


def fight(state, walk, target):
    state.actors[2].hp = 0
    walk.approach(target.x - 42, 480, target.id)
    walk.actor.dir = 1
    for _ in range(10800):
        if target.hp <= 0:
            break
        core.step(state, 1 / 60, attack)
    assert target.hp <= 0, (target.id, target.hp)


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    assert slot.enemy.hp == spec['hp']
    before = state.kills, state.mora, state.progression.killXp
    fight(state, walk, slot.enemy)
    assert slot.phase == 'cleared'
    base = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    xp = int(base * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert not core.defeatEnemy(state, slot.enemy, 1)
    assert restore(state).endgame.bosses[spec['id']].clears == 1
    return xp


fixture = start(158)
for stage in (CH_HOST, BA_HOST, ALT, HUB):
    core.enterStoryNode(fixture, stage)
write('work/snez-first-field-legends-fixture.json', saved(fixture))

core.grantExp(fixture, exp(159) - exp(158), 'quest')
write('work/snez-first-field-legends-coop-fixture.json', saved(fixture))

ch, ba, fu = (specs[id] for id in (CH, BA, FU))
square, first, second = ch['entryThrough']
cavern = ba['entryThrough'][0]
trail = fu['entryThrough'][0]
state = start(151)
walk = walk_for(state)
core.action(state, 'story_accept:' + CH_Q)
core.enterStoryNode(state, CH_HOST)
guide(state, [square, first, second, ch['node']], 'blocked')
walk.cross(square)
gate_locked(state, walk, first, '案内役')
collect(state, walk, CH_Q, 0)
walk.cross(first)
state.actors[2].hp = 0
gate_locked(state, walk, second, '弟子')
assert [e.spawnId for e in state.enemies.values()] == ['snow-apprentice-sparring']
fight(state, walk, state.enemies[1])
assert state.story.quests[CH_Q].count == 2

state = restore(state)
walk = walk_for(state)
core.enterStoryNode(state, CH_HOST)
walk.cross(square)
walk.cross(first)
assert not list(state.enemies.values())
walk.cross(second)
state.actors[2].hp = 0
gate_locked(state, walk, ch['node'], '152')
assert [e.spawnId for e in state.enemies.values()] == ['snow-bragin-sparring']
fight(state, walk, state.enemies[1])
assert state.story.quests[CH_Q].count == 3
gate_locked(state, walk, ch['node'], '152')
core.grantExp(state, exp(152)-exp(151), 'quest')
walk.cross(ch['node'])
xp = {CH:defeat(state, walk, ch)}
walk.cross(second)
assert not list(state.enemies.values())
walk.cross(ch['node'])
assert state.fieldSlots[CH].enemy.hp == ch['hp']
restored = restore(state)
core.action(restored, 'story_report:' + CH_Q)
assert restored.story.quests[CH_Q].status == 'complete'

state = start(156)
walk = walk_for(state)
core.enterStoryNode(state, BA_HOST)
walk.cross(cavern)
gate_locked(state, walk, ba['node'], '氷壁の下の通路')
state = start(155)
walk = walk_for(state)
core.action(state, 'story_accept:' + BA_Q)
core.enterStoryNode(state, BA_HOST)
walk.cross(cavern)
for index in range(2):
    collect(state, walk, BA_Q, index)
gate_locked(state, walk, ba['node'], '156')
core.grantExp(state, exp(156)-exp(155), 'quest')
guide(state, [ba['node']], 'ready')
walk.cross(ba['node'])
xp[BA] = defeat(state, walk, ba)
walk.cross(cavern)
assert walk.actor.y == 411
walk.cross(BA_HOST)
restored = restore(state)
core.action(restored, 'story_report:' + BA_Q)
assert restored.story.quests[BA_Q].status == 'complete'

state = start(157)
walk = walk_for(state)
core.enterStoryNode(state, ALT)
walk.cross(trail)
gate_locked(state, walk, fu['node'], '158')
core.grantExp(state, exp(158)-exp(157), 'quest')
guide(state, [fu['node']], 'ready')
walk.cross(fu['node'])
assert not state.story.visited[DOMAIN] and state.story.quests[CH_Q] is None and state.story.quests[BA_Q] is None
xp[FU] = defeat(state, walk, fu)
walk.cross(trail)
gate_locked(state, walk, DOMAIN, '159')
core.grantExp(state, exp(159)-exp(158), 'quest')
walk.cross(DOMAIN)
guide(state, [trail, fu['node']], 'ready')
walk.cross(trail)
walk.cross(ALT)
write('evidence/snez-first-field-legends-lua.json', {
    'twoBoutsAndSavedFirstWin':True,
    'clearedBoutsStayClearedOnRechallenge':True,
    'icyPassageQuestAndLevelGate':True,
    'furiosaReachableAt158Without159Domain':True,
    'bothFuriosaApproaches':True,
    'savedClearRecordsAndRewards':True,
    'killXp':xp,
})
print('Snezhnaya legends: sequential bouts, passage, Lv158 approach and three saved rewards passed')
