"""Verify the entrance quests, actual return gates, and persisted trial clears."""
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
TLATZA = 'legend-natlan_tlatzacuilotl'
ICHCA = 'legend-natlan_ichcahuipilli'
T_HOST = 'nat-wp-72434'
I_HOST = 'nat-wp-72436'
STONES = 'natlan-sulfurous-resonant-stones'
ECHOES = 'natlan-witztli-three-echoes'
graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quests = {quest['id']: quest for quest in graph['quests']}
specs = {spec['id']: spec for spec in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
attack = lua.table(attack=True)


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    return state


def save(state):
    return validate_save(native(core.checkpoint(state)))


def restore(state):
    return core.restore(lua.table_from(save(state), recursive=True), 12)


def walk_for(state):
    return TrailWalk(lua, core, state, edges, exits)


def guide(state, target, status, expected):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + target)
    route = core.frame(state).worldMap.guide
    assert route.status == status
    assert [(step.id, step.mode) for step in route.stops.values()] == expected
    core.action(state, 'world_map_toggle')


def locked(state, walk, target, reason, rock_label):
    edge = edges[state.story.node, target]
    walk.approach(edge['x'], edge.get('y', 480), target)
    frame = core.frame(state)
    assert frame.storyNearbyPortal.to == target and not frame.storyNearbyPortal.available
    assert reason in frame.storyNearbyPortal.reason
    assert any(draw.text == rock_label for draw in frame.draws.values())
    origin = state.story.node
    core.action(state, 'story_nearby_portal')
    assert state.story.node == origin and state.lift is None


def collect(state, walk, spot):
    walk.approach(spot['x'], spot['y'], spot.get('name', 'resonance'))
    core.action(state, 'story_collect')


def defeat_trial(state, walk, id):
    spec = specs[id]
    arena, approach = spec['node'], spec['entryThrough'][-1]
    walk.cross(arena)
    slot = state.fieldSlots[id]
    walk.approach(slot.enemy.x - 44, 480, id)
    state.actors[2].hp = 0
    walk.actor.dir = 1
    before = state.kills, state.mora, state.progression.killXp
    for _ in range(6600):
        if slot.phase == 'cleared':
            break
        core.step(state, 1 / 60, attack)
    assert slot.phase == 'cleared'
    award = int(LEVELS[spec['level'] - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (before[0] + 1, before[1] + spec['mora'], before[2] + award)
    back = edges[arena, approach]
    walk.cross(approach)
    assert walk.actor.x == back['arrivalX']
    walk.cross(arena)
    assert state.fieldSlots[id].enemy.hp == spec['hp']
    assert restore(state).endgame.bosses[id].clears == 1


def report(state, quest_id):
    restored = restore(state)
    before = restored.progression.questXp, restored.mora
    core.action(restored, 'story_report:' + quest_id)
    assert restored.story.quests[quest_id].status == 'complete'
    assert (restored.progression.questXp, restored.mora) == (
        before[0] + quests[quest_id]['xp'], before[1] + quests[quest_id]['mora'])


fixture = start(118)
for host in (T_HOST, I_HOST):
    core.enterStoryNode(fixture, host)
core.enterStoryNode(fixture, HUB)
write('work/natlan-north-trials-fixture.json', save(fixture))

s = start(112)
core.action(s, 'story_accept:' + STONES)
spec = specs[TLATZA]
lower, basin, cave = spec['entryThrough']
route = [(lower, 'lift'), (basin, 'walk'), (cave, 'walk'), (spec['node'], 'night')]
walk = walk_for(s)
core.enterStoryNode(s, T_HOST)
guide(s, spec['node'], 'blocked', route)
walk.cross(lower)
walk.cross(basin)
locked(s, walk, cave, '刻印板の順', '封じられた岩戸')
config = nodes[basin]['resonance']
stones = config['stones']
order = [stones[index - 1] for index in config['order']]
walk.approach(config['panel']['x'], 480, STONES)
assert native(core.frame(s).storyResonance.order) == [stone['pattern'] for stone in order]
collect(s, walk, order[0])
assert s.resonanceOrder == 1
collect(s, walk, order[2])
assert s.resonanceOrder == 0 and s.story.quests[STONES].count == 0
collect(s, walk, order[0])
walk.cross(lower)
walk.cross(basin)
assert s.resonanceOrder is None
for stone in order:
    collect(s, walk, stone)
assert s.story.quests[STONES].count == 1
walk.cross(lower)
walk.cross(T_HOST)
guide(s, spec['node'], 'ready', route)
walk.cross(lower)
walk.cross(basin)
walk.cross(cave)
defeat_trial(s, walk, TLATZA)
report(s, STONES)

s = start(118)
core.action(s, 'story_accept:' + ECHOES)
spec = specs[ICHCA]
bank = spec['entryThrough'][0]
branches = {path['id']: path['steps'][0] for path in quests[ECHOES]['paths']}
walk = walk_for(s)
core.enterStoryNode(s, I_HOST)
walk.cross(bank)
locked(s, walk, spec['node'], '三つの光', '封じられた大岩')
root = branches['root']
walk.cross(root['node'])
walk.cross(bank)
assert s.story.quests[ECHOES].pathProgress.root.count == 0
walk.cross(root['node'])
collect(s, walk, root)
assert s.story.quests[ECHOES].pathProgress.root.count == 1
assert any(draw.color == '#bcfddb' for draw in core.frame(s).draws.values())
s = restore(s)
core.action(s, 'story_fast:' + I_HOST)
walk = walk_for(s)
walk.cross(bank)
state = s.story.quests[ECHOES]
assert state.count == 1 and state.pathProgress.root.count == 1

ledge = branches['ledge']
walk.cross(ledge['node'])
collect(s, walk, ledge)
walk.cross(bank)
assert state.pathProgress.ledge.count == 2 and state.pathProgress.root.count == 1
walk.cross(root['node'])
walk.cross(bank)
assert state.pathProgress.root.count == 2 and state.count == 1
locked(s, walk, spec['node'], '三つの光', '封じられた大岩')
crystal = branches['crystal']
walk.cross(crystal['node'])
collect(s, walk, crystal)
walk.cross(bank)
assert all(path.count == 2 for path in state.pathProgress.values()) and state.count == 2
walk.cross(I_HOST)
guide(s, spec['node'], 'ready', [(bank, 'walk'), (spec['node'], 'night')])
walk.cross(bank)
pillar = edges[bank, spec['node']]
walk.approach(pillar['x'], 480, spec['node'])
frame = core.frame(s, 'sprite', 'legacy')
assert frame.storyNearbyPortal.available
assert any(draw.source == 'natlan-night-trial-poses-source-v1.png' for draw in frame.draws.values())
defeat_trial(s, walk, ICHCA)
report(s, ECHOES)

write('evidence/natlan-north-trials-lua.json', {
    'resonanceOrder': [stone['pattern'] for stone in order],
    'wrongStoneAndExitResetIncompleteSequence': True, 'ascendingAndReturningOnExistingLift': True,
    'returnOrder': ['ledge', 'root', 'crystal'], 'visitAloneDoesNotReturnLight': True,
    'savedCarriedLightAndMatchedReturnPath': True, 'pillarRevealedAfterThirdLight': True,
    'bothQuestsReportAndBothTrialsClearSaveAndRetry': True,
})
print('North Natlan: ordered stones, three escorted lights, two quests and two saved trial clears passed')
