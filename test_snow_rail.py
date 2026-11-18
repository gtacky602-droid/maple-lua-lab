import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, road = 'snezhnaya-hub', 'snezhnaya-field'
yard, depot = 'snow-rail-transfer', 'steam-stabling-depot'
patrol, pressure, boss = 'snow-rail-clear', 'snow-rail-pressure', 'original-snow-sweeper'
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, LEVELS[141]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(state, hub)


def press(key):
    core.action(state, key)


def at(x):
    actor = state.actors[state.active]
    actor.x, actor.y, actor.vy, actor.ground = x, 480, 0, True


def gate(x, destination):
    at(x)
    press('story_nearby_portal')
    assert state.story.node == destination, (state.story.node, destination)


def step(count, **keys):
    controls = lua.table_from(keys)
    for _ in range(count):
        core.step(state, 1/60, controls)


def save():
    return validate_save(native(core.checkpoint(state)))


def resume(data):
    return core.restore(lua.table_from(data, recursive=True), 12)


def hit(enemy, attack):
    core.resolveCast(state, lua.table_from(dict(id=1, targetId=enemy.id, x=enemy.x, y=480,
        atk=attack, dir=1, radial=True, mult=1, range=60, limit=1, element='physical',
        gain=0, color='#ffd083', critRate=0)))


def report(quest, xp, mora):
    before = state.progression.questXp, state.mora
    press('story_report:'+quest)
    press('story_report:'+quest)
    assert state.story.quests[quest].status == 'complete'
    assert (state.progression.questXp-before[0], state.mora-before[1]) == (xp, mora)


fixture = save()
press('story_accept:'+pressure)
assert state.story.quests[pressure] is None
gate(1380, road)
gate(260, road)
gate(60, hub)
press('story_accept:'+patrol)
gate(1380, road)
at(300)
hit(state.enemies[1], 100)
assert state.story.quests[patrol].count == 0
gate(260, yard)
carts = list(state.enemies.values())
assert len(carts) == 3 and all(e.art == 'sled-maintenance-cart' for e in carts)
gate(1432, yard)
for i, cart in enumerate(carts, 1):
    hit(cart, 100)
    assert state.story.quests[patrol].count == i
step(1)
assert not len(state.enemies)
gate(60, road)
gate(60, hub)
report(patrol, 8400, 460)
press('story_accept:'+pressure)
gate(1380, road)
gate(260, yard)
assert not len(state.enemies)
gate(1432, yard)
at(1070)
press('story_collect')
assert state.story.quests[pressure].count == 1
state = resume(save())
assert state.story.node == hub and state.story.quests[pressure].count == 1
gate(1380, road)
gate(260, yard)
gate(1432, depot)
at(1215)
press('story_collect')
assert state.story.quests[pressure].count == 1

state.actors[2].hp = 0
slot = state.fieldSlots[boss]
actor = state.actors[1]
actor.inv = 0
at(633)
for _ in range(240):
    if slot.cast is not None:
        break
    step(1)
assert slot.cast.move.id == 'SR01'
before = actor.hp
step(30)
f = core.frame(state, 'sprite', 'legacy').fieldBoss
assert actor.hp == before and f.lane.left < actor.x < f.lane.right and not f.lane.active
step(70)
assert 0 < actor.hp < before and slot.enemy.cooling and slot.enemy.pose == 'vent', (
    actor.hp, before, actor.x, actor.y, actor.inv, slot.enemy.pose, slot.cast.tick, list(slot.cast.seen.values()))
assert len(slot.cast.seen) == 1
cooling_hp = slot.enemy.hp
hit(slot.enemy, 20)
assert cooling_hp-slot.enemy.hp == 23

at(slot.enemy.x+65)
for _ in range(260):
    if slot.cast is not None and slot.cast.move.id == 'SR02':
        break
    step(1)
assert slot.cast.move.id == 'SR02'
step(40)
warm_hp = slot.enemy.hp
hit(slot.enemy, 20)
assert warm_hp-slot.enemy.hp == 19
before = actor.hp
press('jump')
step(37, jump=True)
assert actor.hp == before and slot.enemy.cooling

before = state.mora
hit(slot.enemy, 500)
assert state.mora-before == 425 and slot.phase == 'respawn'
assert state.story.quests[pressure].count == 2
saved = save()
assert saved['fieldBosses'][boss]['hp'] == 0 and saved['fieldBosses'][boss]['waitTicks'] == 3600
state = resume(saved)
assert state.fieldSlots[boss].phase == 'respawn' and state.story.quests[pressure].count == 2
gate(1380, road)
gate(260, yard)
gate(1432, depot)
at(1215)
press('story_collect')
assert state.story.quests[pressure].count == 3
step(1)
assert any(d.text == '圧力計・正常' for d in core.frame(state, 'sprite', 'legacy').draws.values())
gate(60, yard)
gate(60, road)
gate(60, hub)
report(pressure, 11400, 740)
state = resume(save())
assert state.story.quests[pressure].status == 'complete'

evidence = {'threeRealCarts': True, 'wrongMapKillIgnored': True, 'blockedBeforeSignal': True,
    'surveyRestored': True, 'plowWarnThenHitOnce': True, 'avoidedSteamWithRealJump': True,
    'coolingAmplifiesDamage': True, 'bossRewardOnce': True, 'defeatPersisted': True,
    'questRewards': [[8400,460],[11400,740]]}
(ROOT/'evidence/snow-rail-lua.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
(ROOT/'work/snow-rail-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(evidence)
