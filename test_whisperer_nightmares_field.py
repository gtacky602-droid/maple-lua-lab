import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
boss_id, quest = 'boss-22150101', 'whisperer-nightmares-commission'
hub, road, arena = 'nod-town', 'nod-field', 'nod-nightmare-shore'
empty = lua.table()


def spot(actor, x, y=480):
    actor.x, actor.y, actor.vy, actor.ground, actor.dir = x, y, 0, y == 480, 1


def portal(state, x, node):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def enter(state):
    portal(state, 60, road)
    portal(state, 330, arena)


def make(fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[127]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if fixture:
        saved = validate_save(native(core.checkpoint(state)))
        saved['companion'] = 'wanderer'
        saved['loadout'][0] = ['SK21']
        saved['loadout'][1] = ['SK22']
        (ROOT/'work/whisperer-nightmares-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    core.action(state, 'story_accept:'+quest)
    enter(state)
    state.actors[2].hp = 0
    slot = state.fieldSlots[boss_id]
    spot(state.actors[1], slot.enemy.x-88)
    return state, slot, slot.enemy, state.actors[1]


def ticks(state, count=1, inputs=empty):
    for _ in range(count):
        core.step(state, 1/60, inputs)


def until(state, slot, move, tick):
    for _ in range(2600):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        ticks(state)
    raise AssertionError((move, tick, slot.phase, slot.enemy.form, state.actors[1].hp))


def strike(state, target, element='physical', **changes):
    hp = target.hp
    attack = dict(id=1, atk=24, x=target.x, y=480, dir=1, radial=True, range=150, limit=1,
                  mult=1, color='#f5b8ff', gain=0, element=element, startedAt=state.t, critRate=0,
                  targetId=target.id)
    attack.update(changes)
    core.resolveCast(state, lua.table_from(attack))
    return hp-target.hp


state, slot, boss, hero = make(fixture=True)
assert (boss.level, boss.hp, boss.form) == (128, 1340, 'idle')
base = strike(state, boss)
c = until(state, slot, 'FWN01', 48)
lane = c.left, c.right
spot(hero, c.origin+64)
hp = hero.hp
until(state, slot, 'FWN01', 107)
assert hero.hp == hp and not c.seen[1][1]
spot(hero, sum(lane)/2)
until(state, slot, 'FWN01', 125)
assert hero.hp == hp-24 and c.seen[1][1] and (c.left, c.right) == lane
spot(hero, boss.x-90)
c = until(state, slot, 'FWN02', 56)
destination = c.destination
until(state, slot, 'FWN02', 110)
assert boss.form == 'rift' and boss.underground and strike(state,boss) == 0
spot(hero, destination)
hp = hero.hp
until(state, slot, 'FWN02', 151)
assert boss.x == destination and boss.form == 'attack' and not boss.underground
assert hero.hp == hp-28 and c.seen[1][1]
spot(hero,boss.x-88)
c = until(state, slot, 'FWN03', 64)
assert boss.damageShield == 400 and len(c.summons) == 4 and len(state.enemies) == 5
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t == standard.t == light.t and light.commands<standard.commands
assert len([d for d in png.draws.values() if d.source == 'whisperer-nightmares-field-poses-source-v1.png']) == 5
assert len(png.fieldBoss.summons) == 4
hp = boss.hp
assert strike(state,boss) == 0 and boss.hp == hp and boss.damageShield == 400
assert strike(state,boss,'pyro') == 0 and boss.damageShield == 400-base
after_pyro = boss.damageShield
strike(state,boss,'lunar',applicationElement='hydro')
assert after_pyro-boss.damageShield == base*3 and boss.hp == hp
strike(state,boss,'electro',atk=400,reaction=True,key='reaction:overloaded')
assert boss.damageShield == 0 and boss.form == 'down' and len(state.enemies) == 1 and c.summons is None
assert lua.eval('rawequal')(boss,slot.enemy)
until(state,slot,'FWN03',243)
assert boss.form == 'down'
ticks(state)
assert slot.cast is None and boss.form == 'idle'

# Four actual summoned receivers can be defeated by physical attacks.
state, slot, boss, hero = make()
c = until(state,slot,'FWN03',64)
hp,mora,kills= boss.hp,state.mora,state.kills
for index in range(1,5):
    unit = c.summons[index]
    while unit.hp>0:
        strike(state,unit)
    ticks(state)
    assert state.mora == mora and state.kills == kills and boss.hp == hp
    assert boss.damageShield == 400-index*100
assert boss.form == 'down' and len(state.enemies) == 1 and not c.seen[1][1]
assert strike(state,boss) == base

# The last Fisher dying immediately before the release cancels that release.
state, slot, boss, hero = make()
c = until(state,slot,'FWN03',64)
for i in range(1,4):
    strike(state,c.summons[i],atk=100)
ticks(state)
until(state,slot,'FWN03',839)
strike(state,c.summons[4],atk=100)
ticks(state)
assert boss.form == 'down' and c.broken == 840 and not c.seen[1][1]

# Failed shield still releases once and clears all its temporary receivers.
state, slot, boss, hero = make()
c = until(state,slot,'FWN03',64)
unit = c.summons[1]
spot(hero,unit.x)
hp=hero.hp
until(state,slot,'FWN03',243)
assert hero.hp == hp-9 and unit.seen[1]
spot(hero,boss.x)
until(state,slot,'FWN03',839)
hp=hero.hp
until(state,slot,'FWN03',857)
assert hero.hp == hp-38 and c.seen[1][1]
until(state,slot,'FWN03',880)
assert len(state.enemies) == 1 and c.summons is None and boss.damageShield == 0

# Save and exit preserve HP and discard the active shield and its summons.
state, slot, boss, hero = make()
strike(state,boss)
c = until(state,slot,'FWN03',64)
hp = boss.hp
snap = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(snap,recursive=True),12)
fresh = restored.fieldSlots[boss_id]
assert fresh.enemy.hp == hp and fresh.enemy.damageShield == 0 and fresh.cast is None
enter(restored)
assert len(restored.enemies) == 1
portal(state,65,road)
assert slot.cast is None and boss.damageShield == 0 and boss.hp == hp
portal(state,330,arena)
assert len(state.enemies) == 1
spot(hero,boss.x-88)
c = until(state,slot,'FWN03',64)
strike(state,boss,'pyro',atk=500)
boss.hp=1
assert strike(state,boss) == 1 and slot.phase == 'respawn' and slot.cast is None
assert len(state.enemies) == 1 and state.story.quests[quest].count == 1
snap = validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(snap,recursive=True),12)
assert restored.story.node == hub
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora) == (9200,630)


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(240*60):
        if boss.hp<=0:
            assert moves == {'FWN01','FWN02','FWN03'} and state.returns == 0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>82 or (turn and dx>0),
            left=dx<-82 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns == 0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(fixedLungeAndRiftDestination=True,riftUntargetable=True,shieldAbsorbsHpDamage=True,
    lunarShieldDamageMultiplier=3,fourFishersDamageShieldWithoutRewards=True,
    finalFisherCancelsReleaseAtBoundary=True,unbrokenShieldHasOneRelease=True,
    summonsRemovedOnExitSaveAndBreak=True,oneQuestReport=True,normalAttackSolo=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/whisperer-nightmares-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
