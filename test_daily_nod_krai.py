"""Verify the five Nod-Krai dailies with actual story enemy registrations."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, field = 'nod-town', 'nod-field'
scrapyard, forest = 'nod-tide-scrapyard', 'nod-forest-outer'
main, parts, elites, border, coast = (
    'daily-nod-' + name for name in ('night-patrol', 'parts-route', 'rumored-elites', 'forest-border', 'coast-revisit')
)
nat_training = 'daily-nat-training'


def begin(level=120):
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, 'f223f1d383a44dbdb0eb793f1c1ce9f4', 20806, None)
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


def gate(state, x, destination):
    state.actors[state.active].x = x
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == destination and portal.available
    core.action(state, 'story_nearby_portal')
    assert state.story.node == destination


def checkpoint(state):
    return validate_save(native(core.checkpoint(state)))


def write_json(path, payload):
    (ROOT / path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = begin(119)
act(s, main)
assert not counts(s)
s.actors[1].x = 671
assert not core.frame(s).storyNearbyPortal.available

s = begin()
write_json('work/daily-nod-level-fixture.json', checkpoint(s))
gate(s, 671, forest)
assert len(s.enemies) == 17
gate(s, 62, hub)
gate(s, 60, field)
gate(s, 617, scrapyard)
assert len(s.enemies) == 18
gate(s, 64, field)
gate(s, 1380, hub)
core.enterStoryNode(s, 'natlan-hub')
act(s, nat_training)
core.enterStoryNode(s, hub)
for quest in (main, parts, coast, border, elites):
    act(s, quest)
assert counts(s) == {nat_training: 0, parts: 0, coast: 0}
defeat(s, scrapyard, 'nod-scrap-cart-west', 2)
assert counts(s) == {nat_training: 0, parts: 1, coast: 1}

s = begin()
core.action(s, 'companion:columbina')
assert next(offer.companion for offer in core.frame(s).daily.dailyChoices.values() if offer.id == coast)
for quest in (main, parts, coast):
    act(s, quest)
defeat(s, 'natlan-field', 'natlan-field-1')
assert counts(s) == {main: 0, parts: 0, coast: 0}
for _ in range(59):
    defeat(s, scrapyard, 'nod-scrap-cart-west')
defeat(s, 'nod-appraisal-yard', 'nod-appraisal-yard-1')
assert counts(s) == {main: 60, parts: 60, coast: 59}
defeat(s, 'nod-lantern-shore', 'nod-shore-lower')
assert counts(s) == {main: 61, parts: 60, coast: 60}
for _ in range(139):
    defeat(s, 'nod-special-depth', 'nod-special-depth-1')
assert counts(s) == {main: 200, parts: 60, coast: 60}
act(s, main, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
write_json('work/daily-nod-ready-fixture.json', checkpoint(s))
for quest in (main, parts, coast):
    act(s, quest, 'claim')
    act(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (1188100, 8360)
checkpoint(s)

s = begin()
act(s, elites)
act(s, border)
defeat(s, scrapyard, 'nod-scrap-cart-east')
defeat(s, 'nod-spruce-clearing', 'nod-spruce-1')
assert counts(s) == {elites: 0, border: 0}
defeat(s, 'nod-bloom-trail', 'nod-bloom-trail-1')
assert counts(s) == {elites: 0, border: 1}
defeat(s, scrapyard, 'nod-scrap-elite')
enemy = defeat(s, forest, 'nod-forest-elite')
assert not core.defeatEnemy(s, enemy, 1)
assert counts(s) == {elites: 2, border: 2}
s.actors[2].hp = 0
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 1)
assert counts(s) == {elites: 3, border: 3}
for _ in range(77):
    defeat(s, forest, 'nod-forest-beetle-west')
assert counts(s) == {elites: 3, border: 80}
core.enterStoryNode(s, hub)
for quest in (elites, border):
    act(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (436250, 4520)
checkpoint(s)

write_json('evidence/daily-nod-lua.json', {
    'completedGoals': {'Q-NOD-D01': 200, 'Q-NOD-D02': 60, 'Q-NOD-D03': 3, 'Q-NOD-D04': 80, 'Q-NOD-D05': 60},
    'level120RoundTripThroughBothFields': True,
    'sharedSlotsAcrossNatlanAndNodKrai': True,
    'columbinaCompanionGiver': True,
    'specialRegionCountsForMain': True,
    'partAndCoastOverlapInScrapyardButNotOtherTargets': True,
    'forestRimAndBloomTrailCount': True,
    'namedElitesRespawn': True,
    'claimAtHubOnce': True,
})
print('Nod-Krai: five daily goals, coast and forest routes, overlap, elite respawn and rewards passed')
