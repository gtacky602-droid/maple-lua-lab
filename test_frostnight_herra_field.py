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
until(state, slot, 'FHR02', 114)
assert boss.form == 'airborne' and math.isclose(boss.y,480-1.48*88)
assert boss.hitBottom == boss.y and boss.hitTop < boss.y
assert strike(state, boss) == 0
assert strike(state, boss, y=boss.y-20) == base
spot(hero, locked)
hp = hero.hp
until(state, slot, 'FHR02', 131)
assert boss.y<480 and hero.hp==hp
ticks(state)
assert boss.x == locked and boss.y == 480 and boss.pose == 'land'
assert hero.hp == hp-27 and dive.seen[1][1]
until(state, slot, 'FHR02', 176)
assert core.frame(state).fieldBoss.recoveryTicks == 106

hero.hp=hero.maxhp
spot(hero,boss.x-96)
wave = until(state, slot, 'FHR03', 60)
lane = wave.left,wave.right
assert boss.form=='shadow' and core.frame(state).fieldBoss.gloom is None
assert strike(state,boss) == base
for _ in range(3): strike(state,boss,'cryo')
assert boss.form=='shadow' and wave.broken is None and boss.gloomCharges==0
spot(hero,wave.center)
hp=hero.hp
until(state,slot,'FHR03',183)
assert hero.hp==hp and not wave.seen[1][1]
ticks(state)
assert hero.hp==hp-24 and wave.seen[1][1]
until(state,slot,'FHR03',271)
assert hero.hp==hp-24 and not wave.seen[2][1]
hero.inv=0
ticks(state)
assert hero.hp==hp-48 and wave.seen[2][1] and (wave.left,wave.right)==lane
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite','legacy'), ('rect','legacy'), ('rect','h32c16')]]
assert png.t == standard.t == light.t and light.commands < standard.commands
assert [d.text for d in png.draws.values() if d.kind=='text' and d.y==500]==['2']
until(state,slot,'FHR03',324)
assert boss.form=='recover' and boss.pose=='down'
assert core.frame(state).fieldBoss.recoveryTicks==144
assert strike(state,boss)==base and boss.adaptedElement is None
until(state,slot,'FHR03',467)
ticks(state)
assert slot.cast is None and boss.form=='idle'

state,slot,boss,hero=make()
strike(state,boss)
until(state,slot,'FHR03',60)
hp=boss.hp
snapshot=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
enter(restored)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.cast is None and fresh.enemy.form=='idle'
portal(state,65,road)
assert slot.cast is None
portal(state,510,arena)
assert boss.hp==hp
hero.hp=hero.maxhp
spot(hero,boss.x-90)
until(state,slot,'FHR03',60)
boss.hp=1
mora,kills=state.mora,state.kills
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
assert state.story.quests[quest].count==1 and state.mora==mora+465 and state.kills==kills+1
snapshot=validate_save(native(core.checkpoint(state)))
assert snapshot['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp, restored.mora-mora)==(9000,610)

state,slot,boss,hero=make()
edge=until(state,slot,'FHR03',1)
boss.x=edge.origin=397
spot(hero,335)
until(state,slot,'FHR03',60)
assert edge.reposition and edge.left is None and core.frame(state).fieldBoss.lockedWave is None
ticks(state,90)
assert boss.x>397 and not edge.seen[1][1]


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


result=dict(fixedWarnedAreas=True,airTicks=36,landingTick=132,lockedBothWaves=True,damagePerWave=24,
    normalDamageSameInShadow=True,noDispelOrAdaptation=True,naturalRecoveryTicks=144,
    edgeReposition=True,saveAndReportOnce=True,normalAttackSolo=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/frostnight-herra-field-lua.json').write_text(json.dumps(result,indent=2)+'\n', encoding='utf8')
print(result)
