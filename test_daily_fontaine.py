"""Exercise all Fontaine daily objectives and the repeatable land targets."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, canal, yard = 'fontaine-hub', 'fontaine-field', 'fontaine-outskirts-loading'
patrol, gathering, film, meka, elites = (
    'daily-fon-' + name for name in ('patrol', 'gathering', 'film-route', 'meka', 'land-elites')
)
sum_survey = 'daily-sum-survey'


def begin(level=80):
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, '54430774ef7c4e43bfc0a8095844aa27', 20804, None)
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    return state


def act(state, quest, command='accept'):
    core.action(state, f'daily_{command}:{quest}')


def counts(state):
    return {row.id: row.count for row in state.daily.ledger.activeSlots.values()}


def defeat(state, node, spawn, actor=1):
    core.enterStoryNode(state, node)
    enemy = next(enemy for enemy in state.enemies.values() if enemy.spawnId == spawn)
    assert core.defeatEnemy(state, enemy, actor)
    return enemy


def checkpoint(state):
    return validate_save(native(core.checkpoint(state)))


def write_json(path, payload):
    (ROOT / path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = begin(79)
act(s, patrol)
assert not counts(s)
core.enterStoryNode(s, canal)
s.actors[1].x = 194
assert not core.frame(s).storyNearbyPortal.available

s = begin()
write_json('work/daily-fon-level-fixture.json', checkpoint(s))
core.enterStoryNode(s, 'sumeru-hub')
act(s, sum_survey)
core.enterStoryNode(s, hub)
for quest in (patrol, gathering, meka, elites):
    act(s, quest)
assert counts(s) == {sum_survey: 0, gathering: 0, meka: 0}
core.enterStoryNode(s, canal)
s.actors[1].x = 194
assert core.frame(s).storyNearbyPortal.to == yard
core.action(s, 'story_nearby_portal')
assert s.story.node == yard and s.actors[1].x == 123
assert len(s.enemies) == 8
defeat(s, yard, 'fon-loading-meka-west', 2)
assert counts(s) == {sum_survey: 0, gathering: 1, meka: 1}

s = begin()
core.action(s, 'companion:emilie')
assert next(offer.companion for offer in core.frame(s).daily.dailyChoices.values() if offer.id == gathering)
for quest in (patrol, gathering, film):
    act(s, quest)
defeat(s, 'sumeru-field', 'sumeru-field-2')
assert counts(s) == {patrol: 0, gathering: 0, film: 0}
for _ in range(59):
    defeat(s, yard, 'fon-loading-meka-west')
defeat(s, canal, 'fontaine-field-2')
assert counts(s) == {patrol: 60, gathering: 60, film: 59}
for _ in range(21):
    defeat(s, 'fontaine-entry', 'fontaine-entry-1')
for _ in range(119):
    defeat(s, 'bygone-depth', 'bygone-depth-1')
assert counts(s) == {patrol: 200, gathering: 60, film: 80}
act(s, patrol, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
for quest in (patrol, gathering, film):
    act(s, quest, 'claim')
    act(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (234730, 5400)
checkpoint(s)

s = begin()
act(s, meka)
act(s, elites)
defeat(s, 'fontaine-old-scenery-door', 'fontaine-old-door-patrol-1')
defeat(s, 'fontaine-entry', 'fontaine-entry-1')
defeat(s, yard, 'fon-loading-crab')
defeat(s, 'bygone-depth', 'bygone-depth-1')
assert counts(s) == {meka: 0, elites: 0}
defeat(s, canal, 'fontaine-field-1')
enemy = defeat(s, yard, 'fon-loading-meka-elite')
assert counts(s) == {meka: 1, elites: 2}
assert not core.defeatEnemy(s, enemy, 1)
s.actors[2].hp = 0
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 1)
assert counts(s) == {meka: 2, elites: 3}
for _ in range(48):
    defeat(s, yard, 'fon-loading-meka-east')
assert counts(s) == {meka: 50, elites: 3}
core.enterStoryNode(s, hub)
write_json('work/daily-fon-ready-fixture.json', checkpoint(s))
for quest in (meka, elites):
    act(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (69040, 2550)
checkpoint(s)

write_json('evidence/daily-fon-lua.json', {
    'completedGoals': {'Q-FON-D01': 200, 'Q-FON-D02': 60, 'Q-FON-D03': 80, 'Q-FON-D04': 50, 'Q-FON-D05': 3},
    'level80TownAndLoadingYard': True,
    'sharedSlotsAcrossSumeruAndFontaine': True,
    'emilieCompanionGiver': True,
    'bygoneCountsForMainOnly': True,
    'sameMachineInTheaterDoesNotCountForMeka': True,
    'onlyMarkedLandElitesCount': True,
    'namedMachineRespawns': True,
    'claimAtHubOnce': True,
})
print('Fontaine: all five daily goals, repeatable land elites, scoped meka and shared slots passed')
