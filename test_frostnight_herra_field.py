import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
boss_id, quest = 'boss-20081001', 'frostnight-herra-commission'
hub, road, arena = 'nod-town', 'nod-field', 'nod-herra-terrace'
empty = lua.table()


def spot(actor, x, y=480):
    actor.x, actor.y, actor.vy, actor.ground, actor.dir = x, y, 0, y == 480, 1


def portal(state, x, destination):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == destination


def enter(state):
    portal(state, 60, road)
    portal(state, 510, arena)


def make(fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[125]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if fixture:
        browser_state = core.new(12)
        core.action(browser_state, 'story_start')
        core.grantExp(browser_state, LEVELS[143]['maple_reference_total_exp_to_reach'], 'quest')
        core.enterStoryNode(browser_state, hub)
        saved = validate_save(native(core.checkpoint(browser_state)))
        saved['companion'] = 'wanderer'
        saved['loadout'][0] = ['SK25']
        saved['loadout'][1] = ['SK26']
        (ROOT/'work/frostnight-herra-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    core.action(state, 'story_accept:'+quest)
    assert state.story.quests[quest].status == 'active'
    enter(state)
    state.actors[2].hp = 0
    slot = state.fieldSlots[boss_id]
    spot(state.actors[1], slot.enemy.x-90)
    return state, slot, slot.enemy, state.actors[1]


def ticks(state, count=1, inputs=empty):
    for _ in range(count):
        core.step(state, 1/60, inputs)


def until(state, slot, move, tick):
    for _ in range(1800):
        if slot.cast and slot.cast.move.id == move and slot.cast.tick == tick:
            return slot.cast
        ticks(state)
    raise AssertionError((move, tick, slot.phase, slot.enemy.form, state.actors[1].hp))


def cast(state, target, element, **changes):
    return lua.table_from(dict(id=1, atk=24, x=target.x, y=480, dir=1, radial=True, range=150,
        limit=4, mult=1, color='#b6edff', gain=0, element=element, startedAt=state.t, critRate=0,
        targetId=target.id) | changes)


def strike(state, boss, element='physical', **changes):
    hp = boss.hp
    core.resolveCast(state, cast(state, boss, element, **changes))
    return hp-boss.hp


state, slot, boss, hero = make(fixture=True)
assert (boss.level, boss.hp, boss.form) == (126, 1200, 'idle')
base = strike(state, boss)
wing = until(state, slot, 'FHR01', 52)
lane = wing.left, wing.right
spot(hero, wing.origin+64)
hp = hero.hp
until(state, slot, 'FHR01', 119)
assert hero.hp == hp and not wing.seen[1][1]
spot(hero, sum(lane)/2)
until(state, slot, 'FHR01', 185)
assert hero.hp == hp-19 and wing.seen[2][1] and (wing.left, wing.right) == lane

dive = until(state, slot, 'FHR02', 60)
locked = dive.center
spot(hero, locked+60)
until(state, slot, 'FHR02', 117)
assert boss.form == 'airborne' and 129 < 480-boss.y < 132
assert boss.hitBottom == boss.y and boss.hitTop == boss.y-196
assert strike(state, boss) == 0
assert strike(state, boss, y=boss.y-20) == base
spot(hero, locked)
hp = hero.hp
until(state, slot, 'FHR02', 150)
assert boss.x == locked and boss.y == 480 and boss.pose == 'land'
assert hero.hp == hp-27 and dive.seen[1][1]

spot(hero,boss.x-96)
gloom = until(state, slot, 'FHR03', 60)
assert boss.form == 'gloom'
reduced = strike(state, boss)
assert reduced == math.floor(24*100/105*.65) < base
strike(state, boss, 'cryo', reaction=True, key='reaction:fixture')
assert boss.gloomCharges == 0
repeated = cast(state, boss, 'cryo')
for _ in range(3):
    core.resolveCast(state, repeated)
assert boss.gloomCharges == 1
strike(state, boss, 'lunar')
assert boss.gloomCharges == 2
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite','legacy'), ('rect','legacy'), ('rect','h32c16')]]
assert png.t == standard.t == light.t and light.commands < standard.commands
assert any(d.source == 'frostnight-herra-field-poses-source-v1.png' for d in png.draws.values())
assert png.fieldBoss.label.endswith('2／3')
active_save = validate_save(native(core.checkpoint(state)))
active_restore = core.restore(lua.table_from(active_save, recursive=True), 12)
restored_slot = active_restore.fieldSlots[boss_id]
assert restored_slot.enemy.hp == boss.hp and restored_slot.cast is None
assert restored_slot.enemy.form == 'idle' and restored_slot.enemy.gloomCharges == 0
strike(state, boss, 'cryo')
assert boss.form == 'down' and gloom.broken == 60 and boss.gloomCharges == 0
assert lua.eval('rawequal')(boss, slot.enemy) and len(state.enemies) == 1
assert strike(state, boss) == base
spot(hero, gloom.center)
hp = hero.hp
until(state, slot, 'FHR03', 203)
assert boss.form == 'down' and hero.hp == hp and not gloom.seen[1][1]
ticks(state)
assert boss.form == 'idle' and slot.cast is None

state, slot, boss, hero = make()
gloom = until(state, slot, 'FHR03', 60)
for _ in range(3):
    strike(state, boss, 'hydro', atk=12)
strike(state, boss, 'pyro', atk=60, applicationElement='hydro')
spot(hero, gloom.right+80)
hp = hero.hp
until(state, slot, 'FHR03', 197)
assert hero.hp == hp and not gloom.seen[1][1]
spot(hero, gloom.center)
until(state, slot, 'FHR03', 285)
assert hero.hp == hp-24 and gloom.seen[2][1]
until(state, slot, 'FHR03', 324)
assert boss.adaptedElement == 'pyro'
assert core.frame(state,'sprite','legacy').fieldBoss.label.startswith('元素適応・炎')
assert strike(state, boss, 'pyro') == math.floor(24*100/105*.58)
assert strike(state, boss, 'hydro') == strike(state, boss) == base
spot(hero, 65)
ticks(state, 212)
assert strike(state, boss, 'pyro') == base
hp = boss.hp
snap = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(snap, recursive=True), 12)
assert restored.fieldSlots[boss_id].enemy.hp == hp
portal(state, 65, road)
portal(state, 510, arena)
assert boss.hp == hp
boss.hp = 1
mora = state.mora
assert strike(state, boss) == 1 and slot.phase == 'respawn'
assert state.story.quests[quest].count == 1 and state.mora == mora+465
snap = validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(snap, recursive=True), 12)
portal(restored, 65, road)
portal(restored, 1380, hub)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:'+quest)
assert (restored.progression.questXp-xp, restored.mora-mora) == (9000, 610)


def solo():
    state, slot, boss, hero = make()
    moves = set()
    for _ in range(145*60):
        if boss.hp <= 0:
            assert moves == {'FHR01','FHR02','FHR03'} and state.returns == 0
            return dict(seconds=round(state.t,2), hp=hero.hp)
        dx = boss.x-hero.x
        turn = abs(dx)>8 and dx*hero.dir<0
        if slot.cast:
            c = slot.cast
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state, 'jump')
        ticks(state, inputs=lua.table_from(dict(right=dx>78 or (turn and dx>0),
            left=dx<-78 or (turn and dx<0), attack=abs(dx)<116 and not turn, jump=True)))
        assert state.returns == 0, (state.t, boss.hp, hero.hp)
    raise AssertionError((state.t, boss.hp, hero.hp))


result = dict(fixedWarnedAreas=True, airborneHeightAndLandingDamage=True,
    normalDamage=dict(base=base, gloom=reduced), chargesOncePerDirectCast=True,
    brokenGloomStopsWave=True, adaptationByTotalDamageAndExpires=True, saveAndReportOnce=True,
    normalAttackWithoutDispel=solo(),
    sameSceneCommands=dict(png=png.commands, standard=standard.commands, light=light.commands))
(ROOT/'evidence/frostnight-herra-field-lua.json').write_text(json.dumps(result,indent=2)+'\n', encoding='utf8')
print(result)
