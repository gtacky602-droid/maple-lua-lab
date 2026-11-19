"""Check the Toyac entrance quests, incomplete saves, and the two manual trials."""
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
BALACHKO = 'legend-natlan_balachko'
COCIJO = 'legend-natlan_cocijo'
BAL_APPROACH = 'nat-wp-72422'
BAL_HOST = 'sites-hunt-73160'
COC_HOST = 'nat-wp-77772'
BAL_QUEST = 'natlan-rainbow-cave-keys'
COC_QUEST = 'natlan-toyac-electro-crystals'
graph = read('content/story-graph.json')
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
quests = {quest['id']: quest for quest in graph['quests']}
bosses = {spec['id']: spec for spec in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle = lua.table()
attack = lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, HUB)
    core.grantExp(state, exp(level), 'quest')
    return state


def restore(state):
    save = validate_save(native(core.checkpoint(state)))
    return core.restore(lua.table_from(save, recursive=True), 12)


def report(state, id):
    state = restore(state)
    assert state.story.node == HUB
    xp, mora = state.progression.questXp, state.mora
    core.action(state, 'story_report:' + id)
    assert state.story.quests[id].status == 'complete'
    assert (state.progression.questXp, state.mora) == (xp + quests[id]['xp'], mora + quests[id]['mora'])


def walk_for(state):
    return TrailWalk(lua, core, state, edges, exits)


def tick(state, count, input=idle):
    for _ in range(count):
        core.step(state, 1 / 60, input)


def active_crystals(state):
    return {e.id: e for e in state.enemies.values() if e.breakTarget and e.hp > 0}


def locked(state, walk, to, reason):
    edge = edges[state.story.node, to]
    walk.approach(edge['x'], edge.get('y', 480), to)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == to and not portal.available and reason in portal.reason, native(portal)
    origin = state.story.node
    core.action(state, 'story_nearby_portal')
    assert state.story.node == origin


def guide(state, to, stops):
    core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_layer:hunt')
    core.action(state, 'world_map_select:' + to)
    route = core.frame(state).worldMap.guide
    assert route.status == 'ready' and [stop.id for stop in route.stops.values()] == stops
    core.action(state, 'world_map_toggle')


def defeat(state, walk, id):
    spec = bosses[id]
    arena = spec['node']
    slot = state.fieldSlots[id]
    actor = walk.actor
    walk.approach(slot.enemy.x - 46, 480, arena)
    actor.dir = 1
    kills, mora, xp = state.kills, state.mora, state.progression.killXp
    for _ in range(5200):
        if slot.phase == 'cleared':
            break
        tick(state, 1, attack)
    assert slot.phase == 'cleared' and slot.enemy.hp == 0
    base = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    award = int(base * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert (state.kills, state.mora, state.progression.killXp) == (kills + 1, mora + spec['mora'], xp + award)
    assert restore(state).endgame.bosses[id].clears == 1
    walk.cross(spec['entryThrough'][0])
    walk.cross(arena)
    retry = state.fieldSlots[id]
    assert retry.enemy.hp == spec['hp'] and retry.cast is None


fixture = start(120)
for host in (BAL_APPROACH, COC_HOST):
    core.enterStoryNode(fixture, host)
core.enterStoryNode(fixture, HUB)
write('work/natlan-toyac-fixture.json', validate_save(native(core.checkpoint(fixture))))

s = start(119)
core.action(s, 'story_accept:' + BAL_QUEST)
core.enterStoryNode(s, BAL_APPROACH)
walk = walk_for(s)
bal = bosses[BALACHKO]
cave = bal['entryThrough'][0]
walk.cross(BAL_HOST)
walk.cross(cave)
state = s.story.quests[BAL_QUEST]
assert state.count == 1
for i, step in enumerate(quests[BAL_QUEST]['itinerary'][1:], 2):
    walk.approach(step['x'], step['y'], BAL_QUEST)
    core.action(s, 'story_collect')
    assert state.count == i, (step['objective'], s.storyNotice)
    if i == 2:
        core.action(s, 'story_collect')
        assert state.count == 2
        locked(s, walk, bal['node'], '120')
        core.grantExp(s, exp(120) - exp(119), 'quest')
        locked(s, walk, bal['node'], '鍵を2本')
walk.cross(BAL_HOST)
guide(s, bal['node'], [cave, bal['node']])
walk.cross(cave)
walk.cross(bal['node'])
defeat(s, walk, BALACHKO)
assert restore(s).story.quests[BAL_QUEST].count == 4
report(s, BAL_QUEST)

s = start(116)
core.action(s, 'story_accept:' + COC_QUEST)
core.enterStoryNode(s, COC_HOST)
walk = walk_for(s)
coc = bosses[COCIJO]
shore = coc['entryThrough'][0]
walk.cross(shore)
locked(s, walk, coc['node'], '電気水晶')
targets = sorted(active_crystals(s).values(), key=lambda e: e.x)
assert len(targets) == 3
crystal_ids = [e.id for e in targets]
state = s.story.quests[COC_QUEST]
target = targets[-1]
walk.approach(target.x - 40, 480, COC_QUEST)
walk.actor.dir = 1
tick(s, 18, attack)
assert target.hp == 1 and state.sweep is None and '炎元素' in s.storyNotice
core.action(s, 'story_collect')
assert state.count == 0 and len(active_crystals(s)) == 3
before = (s.kills, s.mora, s.progression.killXp)
core.action(s, 'swap')
assert s.active == 2


def break_crystal(state, walk, target):
    walk.approach(target.x - 40, 480, COC_QUEST)
    walk.actor.dir = 1
    for _ in range(360):
        if target.hp == 0:
            return
        core.action(state, 'skill1')
        tick(state, 1)
    raise AssertionError((target.id, target.hp, state.storyNotice))


break_crystal(s, walk, target)
assert native(state.sweep) == {'toyac-crystal-ring': True}
assert (s.kills, s.mora, s.progression.killXp) == before
walk.cross(COC_HOST)
assert walk.actor.y == 391
invalid = native(core.checkpoint(s))
invalid['story']['quests'][COC_QUEST]['sweep']['other-field-crystal'] = True
try:
    validate_save(invalid)
except ValueError:
    pass
else:
    raise AssertionError('Accepted an unrelated crystal in the save')
s = restore(s)
core.action(s, 'story_fast:' + COC_HOST)
walk = walk_for(s)
walk.cross(shore)
assert s.story.quests[COC_QUEST].count == 0
targets = active_crystals(s)
assert set(targets) == set(crystal_ids[:2])
assert s.active == 2
break_crystal(s, walk, targets[crystal_ids[0]])
break_crystal(s, walk, targets[crystal_ids[1]])
assert s.story.quests[COC_QUEST].count == 1 and not active_crystals(s)
assert (s.kills, s.mora, s.progression.killXp) == before
walk.cross(COC_HOST)
guide(s, coc['node'], [shore, coc['node']])
walk.cross(shore)
assert not active_crystals(s)
walk.cross(coc['node'])
defeat(s, walk, COCIJO)
report(s, COC_QUEST)

write('evidence/natlan-toyac-legends-lua.json', {
    'balachkoRoute': [BAL_APPROACH, BAL_HOST, cave, bal['node']],
    'cocijoRoute': [COC_HOST, shore, coc['node']],
    'twoKeysAndLockedDoor': True, 'balachkoLevelGate': 120,
    'crystalsRejectPhysicalAndInteract': True, 'crystalsAcceptedPyroInAnyOrder': True,
    'partialCrystalSaveRestored': True, 'unrelatedCrystalSaveRejected': True,
    'crystalsPaidNoKillRewards': True, 'bothQuestReportRewardsChecked': True,
    'bossClearRecordsRestoredAndRetried': True,
})
print('Toyac: both gates, keys, elemental crystals, partial save and manual retries passed')
