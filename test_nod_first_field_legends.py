"""Exercise the three quest unlocks, level gates, lifted route and saved encounters."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


TOWN = 'nod-town'
SIGURD, CRAB, RASKOL = ('legend-nod_sigurd', 'legend-nod_crab_tsar', 'legend-nod_raskolnikov')
HOSTS = {SIGURD: 'nod-wp-88148', CRAB: 'nod-wp-88138', RASKOL: 'nod-wp-88171'}
QUESTS = {SIGURD: 'nod-bonemos-offerings', CRAB: 'nod-hiisi-palace-mirrors', RASKOL: 'nod-bureau-lift-check'}
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
    core.enterStoryNode(state, TOWN)
    core.grantExp(state, exp(level), 'quest')
    for slot in (1, 2):
        assert core.giveArtifact(state, slot, 40, 3)
        core.action(state, 'artifact_equip:' + str(slot))
    return state


def save(state):
    return validate_save(native(core.checkpoint(state)))


def restore(state):
    return core.restore(lua.table_from(save(state), recursive=True), 12)


def walk_for(state):
    return TrailWalk(lua, core, state, edges, exits)


def guide(state, arena, expected, status):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + arena)
    route = core.frame(state).worldMap.guide
    assert route.status == status, (arena, route.status, route.reason)
    assert [(leg.id, leg.mode) for leg in route.stops.values()] == expected
    core.action(state, 'world_map_toggle')
    return route.reason


def collect(state, walk, spot, presses=1):
    walk.approach(spot['x'], spot['y'], spot['node'])
    for _ in range(presses):
        core.action(state, 'story_collect')


def defeat(state, walk, spec):
    slot = state.fieldSlots[spec['id']]
    state.actors[2].hp = 0
    walk.approach(slot.enemy.x - 43, 480, spec['node'])
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
    return xp


fixture = start(140)
for stage in (*HOSTS.values(), 'nod-wp-88147', 'nod-wp-88131', 'nod-wp-88174', TOWN):
    core.enterStoryNode(fixture, stage)
write('work/nod-first-field-legends-fixture.json', save(fixture))

xp = {}
for id in (SIGURD, CRAB, RASKOL):
    spec = specs[id]
    host, qid = HOSTS[id], QUESTS[id]
    path, arena = spec['entryThrough'][0], spec['node']
    expected = [(path, 'walk'), (arena, 'lift' if id == RASKOL else 'walk')]
    steps, level = quests[qid]['itinerary'], spec['level']
    state = start(level - 1)
    core.action(state, 'story_accept:' + qid)
    core.enterStoryNode(state, host)
    walk = walk_for(state)
    fail = guide(state, arena, expected, 'blocked')
    assert str(level) in fail
    walk.cross(path)
    for index, step in enumerate(steps, 1):
        if id == CRAB:
            collect(state, walk, step)
            assert state.story.quests[qid].count == index - 1
            assert state.story.quests[qid].reflectAngle == 1
            if index == 2:
                state = restore(state)
                assert state.story.quests[qid].count == 1 and state.story.quests[qid].reflectAngle == 1
                core.enterStoryNode(state, host)
                walk = walk_for(state)
                walk.cross(path)
            collect(state, walk, step, step['reflect']['align'] - 1)
        else:
            collect(state, walk, step)
        assert state.story.quests[qid].count == index
        if id == CRAB:
            assert any(p.y == 409 and p.moonDeck for p in state.platforms.values()) == (index == len(steps))
    edge = edges[path, arena]
    walk.approach(edge['x'], edge.get('y', 480), arena)
    nearby = core.frame(state).storyNearbyPortal
    assert nearby.to == arena and not nearby.available and str(level) in nearby.reason
    core.action(state, 'story_nearby_portal')
    assert state.story.node == path and state.lift is None
    core.grantExp(state, exp(level) - exp(level-1), 'quest')
    guide(state, arena, [expected[-1]], 'ready')
    walk.cross(arena)
    xp[id] = defeat(state, walk, spec)
    walk.cross(path)
    assert walk.actor.y == edge.get('y', 480)
    walk.cross(arena)
    assert state.fieldSlots[id].enemy.hp == spec['hp']
    restored = restore(state)
    assert restored.endgame.bosses[id].clears == 1
    core.action(restored, 'story_report:' + qid)
    assert restored.story.quests[qid].status == 'complete'
    if id == CRAB:
        restored = restore(restored)
        core.enterStoryNode(restored, host)
        restore_walk = walk_for(restored)
        restore_walk.cross(path)
        assert any(p.y == 409 and p.moonDeck for p in restored.platforms.values())
        restore_walk.cross(arena)

state = start(140)
for id in (SIGURD, CRAB, RASKOL):
    core.enterStoryNode(state, HOSTS[id])
    spec = specs[id]
    mode = 'lift' if id == RASKOL else 'walk'
    blocked = guide(state, spec['node'], [(spec['entryThrough'][0], 'walk'), (spec['node'], mode)], 'blocked')
    assert '受注' in blocked

write('evidence/nod-first-field-legends-lua.json', {
    'allThreeQuestsAndLevelGates': True,
    'mirrorsRejectFirstRotationAndRestorePartialAngle': True,
    'bridgeUnlockAndReload': True,
    'liftAndReturnAtCorrectHeight': True,
    'perBossClearAndManualRechallenge': True,
    'killXp': xp,
})
print('Nod-Krai legends: offerings, mirror state and bridge reload, lifted arena, three rewards passed')
