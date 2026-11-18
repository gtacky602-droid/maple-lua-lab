"""Exercise every Liyue daily target through registered Lua enemies."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub = 'liyue-harbor'
field = 'liyue-field'
main = 'daily-liyue-cargo'
route = 'daily-liyue-route'
scouts = 'daily-liyue-treasure-hoarders'
materials = 'daily-liyue-prep-materials'
elites = 'daily-liyue-relics'
mond_main = 'daily-mond-safety'
mond_extra = 'daily-mond-slimes'


def begin():
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, 'aa0d2842fd234b578070ecb9e61d5beb', 20801, None)
    return state


def reach_liyue(state):
    core.grantExp(state, LEVELS[19]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)


def choose(state, quest, command='accept'):
    core.action(state, f'daily_{command}:{quest}')


def counts(state):
    return {row.id: row.count for row in state.daily.ledger.activeSlots.values()}


def defeat(state, node, spawn, actor=1):
    core.enterStoryNode(state, node)
    enemy = next(e for e in state.enemies.values() if e.spawnId == spawn)
    assert core.defeatEnemy(state, enemy, actor)
    return enemy


def checkpoint(state):
    return validate_save(native(core.checkpoint(state)))


def write_json(path, payload):
    (ROOT / path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = begin()
core.enterStoryNode(s, hub)
choose(s, materials)
assert not counts(s)
reach_liyue(s)
core.enterStoryNode(s, 'mond-town')
write_json('work/daily-liyue-level-fixture.json', checkpoint(s))
choose(s, materials)
assert not counts(s)
choose(s, mond_main)
choose(s, mond_extra)
core.enterStoryNode(s, hub)
for quest in (main, materials, route, scouts, elites):
    choose(s, quest)
assert counts(s) == {mond_main: 0, mond_extra: 0, materials: 0}
before_inventory = len(s.inventory['items'])
enemy = defeat(s, field, 'liyue-field-2', 2)
assert not core.defeatEnemy(s, enemy, 2)
core.onKill(s, enemy)
defeat(s, 'liyue-entry', 'liyue-entry-2')
defeat(s, field, 'liyue-field-1')
assert counts(s) == {mond_main: 0, mond_extra: 0, materials: 1}
assert len(s.inventory['items']) == before_inventory
defeat(s, 'mond-road', 'mond-road-2')
assert counts(s) == {mond_main: 1, mond_extra: 1, materials: 1}
assert len(checkpoint(s)['daily']['ledger']['activeSlots']) == 3

s = begin()
reach_liyue(s)
for quest in (main, route, materials):
    choose(s, quest)
for _ in range(10):
    defeat(s, field, 'liyue-field-2')
    defeat(s, 'liyue-river-trail', 'liyue-river-trail-1')
for _ in range(60):
    defeat(s, field, 'liyue-field-3')
for _ in range(119):
    defeat(s, 'liyue-entry', 'liyue-entry-2')
assert counts(s) == {main: 199, route: 80, materials: 20}
defeat(s, 'chenyu-depth', 'chenyu-depth-1')
assert counts(s) == {main: 200, route: 80, materials: 20}
choose(s, main, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
write_json('work/daily-liyue-ready-fixture.json', checkpoint(s))
for quest in (main, route, materials):
    choose(s, quest, 'claim')
    choose(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (6980, 1365)

s = begin()
reach_liyue(s)
choose(s, scouts)
choose(s, elites)
defeat(s, 'liyue-entry', 'liyue-entry-1')
assert counts(s) == {scouts: 0, elites: 0}
enemy = defeat(s, field, 'liyue-field-daily-scout')
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 1)
for _ in range(37):
    defeat(s, field, 'liyue-field-daily-scout')
defeat(s, 'liyue-loading-yard', 'liyue-loading-yard-daily-scout')
defeat(s, 'liyue-entry', 'liyue-entry-4')
defeat(s, field, 'liyue-field-1')
defeat(s, 'liyue-entry', 'liyue-entry-4')
assert counts(s) == {scouts: 40, elites: 3}
core.enterStoryNode(s, hub)
for quest in (scouts, elites):
    choose(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (3380, 690)
checkpoint(s)

s = begin()
reach_liyue(s)
choose(s, elites)
# The chapter exposes the storage keeper after its first rail trip.
s.story.quests['liyue-market-opening'] = lua.table_from({'status': 'active', 'count': 1})
defeat(s, 'liyue-quarry-storage', 'liyue-quarry-storage-keeper')
assert counts(s) == {elites: 1}

write_json('evidence/daily-liyue-lua.json', {
    'completedGoals': {'Q-LIY-D01': 200, 'Q-LIY-D02': 80, 'Q-LIY-D03': 40, 'Q-LIY-D04': 20, 'Q-LIY-D05': 3},
    'registeredDefeats': True,
    'sharedSlotsAcrossMondstadtAndLiyue': True,
    'materialRequiresMatchingMapAndEnemy': True,
    'materialGrantedOncePerEligibleDefeat': True,
    'materialsDoNotEnterInventory': True,
    'treasureHoarderRespawns': True,
    'chapterStorageKeeperCountsWhenPresent': True,
    'chenyuCountsAsLiyue': True,
    'rewardOnlyAtHubAndGrantedOnce': True,
})
print('All Liyue daily goals, material eligibility, respawn and cross-region limits passed')
