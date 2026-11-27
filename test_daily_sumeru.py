"""Exercise Sumeru goals, both species record paths, and the saved ledger."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, field, yard = 'sumeru-hub', 'sumeru-field', 'sum-kaveh-timberyard'
survey, forest, elites, workyard, species = (
    'daily-sum-' + name for name in ('survey', 'forest', 'elites', 'workyard', 'species')
)
profile = 'b7cc2a04cc144028a03d971f0c41f269'
day = 20803


def begin(level=60):
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, profile, day, None)
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    return state


def act(state, quest, command='accept'):
    core.action(state, f'daily_{command}:{quest}')


def counts(state):
    return {row.id: row.count for row in state.daily.ledger.activeSlots.values()}


def defeat(state, node, spawn, actor=1):
    core.enterStoryNode(state, node)
    target = next(enemy for enemy in state.enemies.values() if enemy.spawnId == spawn)
    assert core.defeatEnemy(state, target, actor)
    return target


def checkpoint(state):
    return validate_save(native(core.checkpoint(state)))


def write_json(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = begin(59)
act(s, species)
assert not counts(s)

s = begin()
write_json('work/daily-sum-level-fixture.json', checkpoint(s))
for quest in (survey, forest, species, workyard):
    act(s, quest)
assert counts(s) == {survey: 0, forest: 0, species: 0}
empty = checkpoint(s)
slot = next(row for row in empty['daily']['ledger']['activeSlots'] if row['id'] == species)
assert slot['recorded'] == {}

defeat(s, 'sumeru-entry', 'sumeru-entry-1')
defeat(s, yard, 'sum-yard-slime-west')
assert counts(s) == {survey: 2, forest: 1, species: 0}
core.enterStoryNode(s, field)
core.action(s, 'story_collect')
assert not core.frame(s).storyNearbyClue
s.actors[1].x = 262
s.actors[1].y = 380
assert core.frame(s).storyNearbyClue.name == '水スライム'
s.actors[1].y = 480
fungus = s.enemies[1]
s.actors[1].x = fungus.x - 80
assert core.frame(s).storyNearbyClue.name == 'キノコン'
core.action(s, 'pause')
core.action(s, 'story_collect')
assert counts(s)[species] == 0
core.action(s, 'pause')
core.action(s, 'story_collect')
core.action(s, 'story_collect')
assert counts(s)[species] == 1 and fungus.hp == fungus.maxhp
assert core.defeatEnemy(s, fungus, 2)
assert counts(s) == {survey: 3, forest: 2, species: 1}
def observation_map(state):
    entry = next(q for q in core.dailyAtlasQuests(state, field).values() if q.id == species)
    return {g.name: (g.recorded, tuple(g.targets.values())) for g in entry.observations.values()}


partial = observation_map(s)
assert partial['キノコン'][0] and not partial['水スライム'][0] and not partial['炎スライム'][0]
assert all(ids for recorded, ids in partial.values())
mid = checkpoint(s)
s = core.restore(lua.table_from(mid, recursive=True))
assert counts(s)[species] == 1 and observation_map(s) == partial
defeat(s, field, 'sumeru-field-2')
defeat(s, field, 'sumeru-field-4')
assert counts(s)[species] == 2
defeat(s, field, 'sumeru-field-3')
assert counts(s) == {survey: 6, forest: 5, species: 3}
assert all(recorded for recorded, ids in observation_map(s).values())

for _ in range(75):
    defeat(s, field, 'sumeru-field-2')
for _ in range(119):
    defeat(s, 'tunigi-depth', 'tunigi-depth-2')
assert counts(s) == {survey: 200, forest: 80, species: 3}
act(s, species, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
ready = checkpoint(s)
for quest in (survey, forest, species):
    act(s, quest, 'claim')
    act(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (99080, 3030)

s = core.restore(lua.table_from(ready, recursive=True))
core.dailyBind(s, profile, day + 1, None)
records = next(row.recorded for row in s.daily.ledger.carrySlots.values() if row.id == species)
assert set(records.keys()) == {'dendro-fungus', 'hydro-slime', 'pyro-slime'}
act(s, species, 'carry')
act(s, species, 'carry')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (9590, 410)
checkpoint(s)

for corrupt in (
    {'dendro-fungus': True},
    {'dendro-fungus': True, 'hydro-slime': True, 'cryo-slime': True},
    {'dendro-fungus': True, 'hydro-slime': False, 'pyro-slime': True},
):
    forged = deepcopy(ready)
    row = next(row for row in forged['daily']['ledger']['activeSlots'] if row['id'] == species)
    row['recorded'] = corrupt
    try:
        validate_save(forged)
    except ValueError:
        pass
    else:
        raise AssertionError(f'Invalid observation record is accepted: {corrupt}')

s = begin()
core.action(s, 'companion:wanderer')
assert next(q.companion for q in core.frame(s).daily.dailyChoices.values() if q.id == elites)
act(s, elites)
act(s, workyard)
defeat(s, field, 'sumeru-field-2')
assert counts(s) == {elites: 0, workyard: 0}
defeat(s, field, 'sumeru-field-1')
enemy = defeat(s, yard, 'sum-yard-elite')
s.actors[2].hp = 0
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 1)
for _ in range(58):
    defeat(s, yard, 'sum-yard-fungus-west')
assert counts(s) == {elites: 3, workyard: 60}
core.enterStoryNode(s, hub)
for quest in (elites, workyard):
    act(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (31170, 1440)
checkpoint(s)

write_json('evidence/daily-sum-lua.json', {
    'completedGoals': {'Q-SUM-D01': 200, 'Q-SUM-D02': 80, 'Q-SUM-D03': 3, 'Q-SUM-D04': 60, 'Q-SUM-D05': 3},
    'tunigiCountsAsSumeru': True,
    'wandererOffersWhileActiveCompanion': True,
    'workyardAndForestEliteRespawn': True,
    'observationRespectsMapRangeHeightAndPause': True,
    'observationIsNonlethalAndDedupedWithKills': True,
    'speciesRecordsSurviveRestoreAndCarry': True,
    'invalidSpeciesRecordsRejected': True,
    'oneRewardAtHub': True,
})
print('Sumeru: five daily goals, observation and kill deduplication, restore, carry and claims passed')
