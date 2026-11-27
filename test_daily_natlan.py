"""Verify Natlan's five daily goals with registered enemies and both new paths."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, ridge = 'natlan-hub', 'natlan-field'
quarry, river = 'natlan-quarry-road', 'natlan-riverside-range'
training, circuit, riverside, elites, mining = (
    'daily-nat-' + name for name in ('training', 'ridge', 'riverside', 'elite-hunt', 'quarry')
)
fon_patrol = 'daily-fon-patrol'


def begin(level=100):
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, '5bc15b703aa94aca902337cfb7e21129', 20805, None)
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


s = begin(99)
act(s, training)
assert not counts(s)
s.actors[1].x = 280
assert not core.frame(s).storyNearbyPortal.available

s = begin()
write_json('work/daily-nat-level-fixture.json', checkpoint(s))
gate(s, 280, river)
assert len(s.enemies) == 7 and not core.frame(s).storyWater
gate(s, 62, hub)
gate(s, 1380, quarry)
assert len(s.enemies) == 8
gate(s, 64, ridge)
gate(s, 552, quarry)
gate(s, 1610, hub)
core.enterStoryNode(s, 'fontaine-hub')
act(s, fon_patrol)
core.enterStoryNode(s, hub)
for quest in (training, riverside, mining, elites):
    act(s, quest)
assert counts(s) == {fon_patrol: 0, riverside: 0, mining: 0}
defeat(s, river, 'nat-river-crawler-west', 2)
defeat(s, quarry, 'nat-quarry-pebble-west')
assert counts(s) == {fon_patrol: 0, riverside: 1, mining: 1}

s = begin()
core.action(s, 'companion:kachina')
assert next(offer.companion for offer in core.frame(s).daily.dailyChoices.values() if offer.id == circuit)
for quest in (training, circuit, mining):
    act(s, quest)
defeat(s, 'fontaine-field', 'fontaine-field-1')
assert counts(s) == {training: 0, circuit: 0, mining: 0}
for _ in range(60):
    defeat(s, quarry, 'nat-quarry-pebble-west')
assert counts(s) == {training: 60, circuit: 60, mining: 60}
for _ in range(20):
    defeat(s, ridge, 'natlan-field-1')
assert counts(s) == {training: 80, circuit: 80, mining: 60}
for _ in range(120):
    defeat(s, 'ochkanatlan-ruins', 'ochkanatlan-ruins-2')
assert counts(s) == {training: 200, circuit: 80, mining: 60}
act(s, training, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
write_json('work/daily-nat-ready-fixture.json', checkpoint(s))
for quest in (training, circuit, mining):
    act(s, quest, 'claim')
    act(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (586230, 6950)
checkpoint(s)

s = begin()
act(s, elites)
act(s, riverside)
defeat(s, 'natlan-river-float-run', 'natlan-river-bank-1')
defeat(s, ridge, 'natlan-field-1')
assert counts(s) == {elites: 0, riverside: 0}
defeat(s, ridge, 'natlan-field-2')
defeat(s, quarry, 'nat-quarry-elite')
enemy = defeat(s, river, 'nat-river-elite')
assert counts(s) == {elites: 3, riverside: 1}
assert not core.defeatEnemy(s, enemy, 1)
s.actors[2].hp = 0
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 1)
assert counts(s) == {elites: 3, riverside: 2}
for _ in range(58):
    defeat(s, river, 'nat-river-crawler-east')
assert counts(s) == {elites: 3, riverside: 60}
core.enterStoryNode(s, hub)
for quest in (elites, riverside):
    act(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (165670, 3200)
checkpoint(s)

write_json('evidence/daily-nat-lua.json', {
    'completedGoals': {'Q-NAT-D01': 200, 'Q-NAT-D02': 80, 'Q-NAT-D03': 60, 'Q-NAT-D04': 3, 'Q-NAT-D05': 60},
    'level100RoundTripThroughBothFields': True,
    'sharedSlotsAcrossFontaineAndNatlan': True,
    'kachinaCompanionGiver': True,
    'ochkanatlanCountsForMainOnly': True,
    'landRouteDoesNotCountWaterTrial': True,
    'allThreeNamedElitesCountAndRespawn': True,
    'claimAtHubOnce': True,
})
print('Natlan: all five goals, both land routes, named elites, shared slots and rewards passed')
