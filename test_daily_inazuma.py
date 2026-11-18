"""Exercise all five daily objectives with Inazuma's registered spawns."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub = 'inazuma-town'
shore = 'inazuma-shore-hunt'
road = 'inazuma-road'
trail = 'inazuma-lantern-trail'
patrol = 'daily-ina-patrol'
fireworks = 'daily-ina-firework-road'
short = 'daily-ina-short-patrol'
trial = 'daily-ina-trial'
nobushi = 'daily-ina-nobushi'
liyue = 'daily-liyue-cargo'


def start(level=40):
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, '841a5b9044e7414d976116229833d9cd', 20802, None)
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    return state


def act(state, quest, command='accept'):
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


def write_json(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = start(39)
act(s, patrol)
assert not counts(s)
assert not core.frame(s).storyNearbyPortal.available

s = start()
core.enterStoryNode(s, 'liyue-harbor')
core.enterStoryNode(s, hub)
write_json('work/daily-ina-level-fixture.json', checkpoint(s))
portal = core.frame(s).storyNearbyPortal
assert portal.to == shore and portal.available
core.action(s, 'story_nearby_portal')
assert s.story.node == shore and not core.frame(s).storyElite
s.actors[1].x = 700
assert core.frame(s).storyElite.name == '浜を仕切る野伏'
act(s, trial)
assert not counts(s)
s.actors[1].x = 1658
core.action(s, 'story_nearby_portal')
assert s.story.node == road and s.actors[1].x == 230
core.action(s, 'story_nearby_portal')
assert s.story.node == shore and s.actors[1].x == 1595
core.enterStoryNode(s, 'liyue-harbor')
act(s, liyue)
core.enterStoryNode(s, hub)
for quest in (patrol, fireworks, nobushi, short):
    act(s, quest)
assert counts(s) == {liyue: 0, fireworks: 0, nobushi: 0}
defeat(s, shore, 'ina-shore-nobushi-west', 2)
assert counts(s) == {liyue: 0, fireworks: 1, nobushi: 1}

s = start()
core.action(s, 'companion:ayaka')
offer = next(q for q in core.frame(s).daily.dailyChoices.values() if q.id == patrol)
assert offer.companion
for quest in (patrol, fireworks, short):
    act(s, quest)
defeat(s, 'liyue-field', 'liyue-field-2')
assert counts(s) == {patrol: 0, fireworks: 0, short: 0}
for _ in range(59):
    defeat(s, shore, 'ina-shore-nobushi-west')
defeat(s, trail, 'inazuma-lantern-trail-1')
assert counts(s) == {patrol: 60, fireworks: 59, short: 60}
for _ in range(21):
    defeat(s, road, 'inazuma-road-2')
for _ in range(119):
    defeat(s, 'enkanomiya-depth', 'enkanomiya-depth-1')
assert counts(s) == {patrol: 200, fireworks: 80, short: 60}
act(s, patrol, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
write_json('work/daily-ina-ready-fixture.json', checkpoint(s))
for quest in (patrol, fireworks, short):
    act(s, quest, 'claim')
    act(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (29920, 1970)

s = start()
act(s, trial)
act(s, nobushi)
defeat(s, trail, 'inazuma-lantern-trail-3')
defeat(s, shore, 'ina-shore-slime-west')
assert counts(s) == {trial: 0, nobushi: 0}
enemy = defeat(s, shore, 'ina-shore-leader')
assert not core.defeatEnemy(s, enemy, 1)
assert counts(s) == {trial: 1, nobushi: 1}
# Keep the companion from clearing other spawns while waiting for this respawn.
s.actors[2].hp = 0
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 2)
defeat(s, road, 'inazuma-road-1')
assert counts(s) == {trial: 3, nobushi: 3}
for _ in range(57):
    defeat(s, shore, 'ina-shore-nobushi-east')
assert counts(s) == {trial: 3, nobushi: 60}
core.enterStoryNode(s, hub)
for quest in (trial, nobushi):
    act(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (9240, 930)
checkpoint(s)

write_json('evidence/daily-ina-lua.json', {
    'completedGoals': {'Q-INA-D01': 200, 'Q-INA-D02': 80, 'Q-INA-D03': 60, 'Q-INA-D04': 3, 'Q-INA-D05': 60},
    'level40TownAndWalkableShore': True,
    'shoreConnectsWithCoastalRoadInBothDirections': True,
    'ayakaCompanionGiver': True,
    'sharedSlotsAcrossLiyueAndInazuma': True,
    'exactAreaAndNobushiChecked': True,
    'enkanomiyaCountsAsInazuma': True,
    'namedEliteRespawnsAndCountsOnce': True,
    'rewardAtHubOnly': True,
})
print('Inazuma: all five daily goals, Lv40 shore, regional overlap, elite respawn and claims passed')
