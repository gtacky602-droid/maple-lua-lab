import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, entrance = 'fontaine-hub', 'icewind-promenade'
variants = {'icewind-coppelia': 420, 'icewind-coppelius': 1060}
empty = lua.table()


def spot(actor, x, y=480):
    actor.x, actor.y, actor.vy, actor.inv, actor.ground = x, y, 0, 0, y == 480


def portal(state, x, node):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def ready():
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[89]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    for variant in variants:
        core.action(state, 'story_accept:' + variant + '-commission')
        assert state.story.quests[variant + '-commission'].status == 'active'
    return state


def route(state, variant):
    portal(state, 580, entrance)
    portal(state, variants[variant], variant + '-field')
    state.actors[2].hp = 0
    slot = state.fieldSlots[variant]
    return slot, slot.enemy, slot.enemy.fieldPartner, state.actors[1]


def until(state, slot, move, tick):
    for _ in range(2500):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        core.step(state, 1/60, empty)
    raise AssertionError((move, tick, slot.phase, state.actors[1].hp))


def strike(enemy, x=None):
    return lua.table_from(dict(id=1, atk=20, x=enemy.x if x is None else x, y=480, dir=1,
                               radial=True, range=250, limit=5, mult=1, color='#fff0ac',
                               gain=0, element='physical', critRate=0, targetId=enemy.id))


def damage(state, enemy, cast=None):
    hp = enemy.hp
    core.resolveCast(state, cast if cast is not None else strike(enemy))
    return hp-enemy.hp


def armor_marks(state):
    return [d.color for d in core.frame(state).draws.values()
            if d.kind=='rect' and d.w==8 and d.h==4 and d.color in ('#addefe','#302235')]


state = ready()
fixture = validate_save(native(core.checkpoint(state)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/icewind-field-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
first, second = variants
slot, lead, other, hero = route(state, first)
assert lead.element == 'anemo' and other.element == 'cryo' and lead.id == -other.id
assert len(state.enemies) == 2 and lead.hp == other.hp == 1030
lead_hit = damage(state, lead)
assert lead_hit > 0 and other.hp == lead.hp
aoe = strike(lead, (lead.x+other.x)/2)
aoe.targetId = None
hp, hits = lead.hp, state.hits
core.resolveCast(state, aoe)
assert lead.hp == hp-lead_hit and state.hits == hits+1

spot(hero, lead.x-95)
sweep = until(state, slot, 'FIC01', 42)
assert sweep.dir == -1
hp = hero.hp
spot(hero, lead.x+105)
until(state, slot, 'FIC01', 100)
assert hero.hp == hp and sweep.dir == -1
spot(hero, lead.x-105)
until(state, slot, 'FIC01', 104)
assert hero.hp == hp-20 and sweep.seen[1][1]
until(state, slot, 'FIC01', 110)
assert hero.hp == hp-20

duet = until(state, slot, 'FIC02', 48)
assert duet.starts[1] < duet.starts[2] and duet.ends[1] > duet.ends[2]
assert duet.sources[1].damageElement == 'anemo' and duet.sources[2].damageElement == 'cryo'
until(state, slot, 'FIC02', 90)
assert math.isclose(lead.x, duet.ends[1]) and math.isclose(other.x, duet.ends[2])
hp = hero.hp
for i, tick in ((1, 108), (2, 152)):
    until(state, slot, 'FIC02', tick-1)
    spot(hero, duet.ends[i])
    until(state, slot, 'FIC02', tick+1)
    assert hero.hp == hp - i*18 and duet.seen[i][1]

spot(hero, lead.x-100)
wind = until(state, slot, 'FIC03', 54)
until(state, slot, 'FIC03', 94)
assert wind.windStart != wind.windEnd and math.isclose(other.x, wind.windEnd)
assert abs(lead.x-other.x) >= 1.25*88
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite', 'legacy'), ('rect', 'legacy'), ('rect', 'h32c16')]]
assert png.t == standard.t == light.t and light.commands < standard.commands
assert {d.source for d in png.draws.values() if d.kind == 'boss_sprite' and 'field-poses' in d.source} == {
    'coppelia-field-poses-source-v1.png', 'coppelius-field-poses-source-v1.png'}
hp = hero.hp
for i, tick in enumerate((108, 150, 192), 1):
    until(state, slot, 'FIC03', tick-1)
    spot(hero, wind.center+(i-2)*1.5*88)
    until(state, slot, 'FIC03', tick+1)
    assert hero.hp == hp-22*i and wind.seen[i][1]

lead.hp = 1
kills, mora = state.kills, state.mora
damage(state, other)
assert slot.phase == 'respawn' and lead.hp == other.hp == 0
assert state.kills == kills+1 and state.mora == mora+325
assert state.story.quests[first+'-commission'].count == 1
assert state.story.quests[second+'-commission'].count == 0
portal(state, 65, entrance)
portal(state, 65, hub)

slot, lead, other, hero = route(state, second)
assert lead.element == 'cryo' and other.element == 'anemo'
hero.hp = hero.maxhp
spot(hero, lead.x-85)
ice = until(state, slot, 'FIP01', 48)
hp = hero.hp
until(state, slot, 'FIP01', 96)
assert ice.projectiles[1].damageElement == 'cryo' and ice.shots[1] and hero.hp == hp-17
until(state, slot, 'FIP01', 137)
spot(hero, lead.x-125)
until(state, slot, 'FIP01', 156)
assert ice.shots[2] and hero.hp == hp-34
spot(hero, lead.x-85)
duet = until(state, slot, 'FIP02', 94)
assert duet.sources[1].damageElement == 'cryo' and duet.sources[2].damageElement == 'anemo'
spot(hero, lead.x-90)
guard = until(state, slot, 'FIP03', 54)
assert lead.form == 'guarded' and '0/3' in core.frame(state, 'sprite').fieldBoss.label
assert armor_marks(state)==['#302235']*3
assert damage(state, other) == lead_hit and guard.guardHits == 0
repeat_cast = strike(lead)
for _ in range(2):
    assert damage(state, lead, repeat_cast) == math.floor(lead_hit*.6)
assert guard.guardHits == 1
assert armor_marks(state)==['#addefe','#302235','#302235']
assert damage(state, lead) == math.floor(lead_hit*.6)
assert damage(state, lead) == math.floor(lead_hit*.6)
assert lead.form == 'guard-broken' and damage(state, lead) == lead_hit
assert not armor_marks(state)
hp = hero.hp
for i, tick in enumerate((120, 174), 1):
    until(state, slot, 'FIP03', tick-1)
    spot(hero, guard.origin)
    until(state, slot, 'FIP03', tick+2)
    assert hero.hp == hp-22*i and guard.seen[i][1]

hero.hp = hero.maxhp
guard = until(state, slot, 'FIP03', 54)
remaining = lead.hp
portal(state, 65, entrance)
assert slot.cast is None and lead.form is None and other.hp == remaining
portal(state, 1060, second+'-field')
assert len(state.enemies) == 2 and lead.hp == remaining
lead.hp = 1
damage(state, lead)
assert state.story.quests[second+'-commission'].count == 1
assert state.story.quests[first+'-commission'].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][first]['waitTicks'] > 0 and saved['fieldBosses'][second]['waitTicks'] == 3600
loaded = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = loaded.progression.questXp, loaded.mora
for variant in variants:
    for _ in range(2):
        core.action(loaded, 'story_report:'+variant+'-commission')
assert loaded.progression.questXp-xp == 12000 and loaded.mora-mora == 800


def normal_clear(variant):
    test = ready()
    slot, lead, other, hero = route(test, variant)
    seen = set()
    for _ in range(125*60):
        if lead.hp <= 0:
            assert len(seen) == 3, seen
            return dict(seconds=round(test.t, 2), hp=hero.hp, moves=sorted(seen))
        cast = slot.cast
        target = other if lead.form == 'guarded' else min((lead, other), key=lambda e: abs(e.x-hero.x))
        dx = target.x-hero.x
        distance = abs(dx)
        turn = distance>8 and dx*hero.dir<0
        evade = False
        if cast:
            seen.add(cast.move.id)
            starts = [w[1] for w in cast.move.active.values()] if cast.move.kind != 'wind' else []
            if cast.move.kind == 'ice':
                gap = (hero.x-cast.origin)*cast.dir
                if gap>30:
                    arrival = round(max(0, gap-44)/(cast.move.speed*88/60))
                    starts = [tick+arrival for tick in cast.move.fire.values()]
            if cast.move.kind == 'guard' and any(t-40<=cast.tick<t+12 for t in starts):
                evade = abs(hero.x-cast.origin) < 180
                dx = 170 if hero.x>=cast.origin else -170
            elif cast.move.kind == 'wind' and cast.center is not None:
                next_wind = next((i for i, w in enumerate(cast.move.active.values())
                                  if w[1]-23 <= cast.tick < w[2]), None)
                if next_wind is not None:
                    center = cast.center+(next_wind-1)*cast.move.spacing*88
                    if abs(hero.x-center) < 52:
                        dx = 160 if hero.x>=center else -160
                        evade = True
            if any(start-24<=cast.tick<=start-18 for start in starts) and hero.ground:
                core.action(test, 'jump')
        core.step(test, 1/60, lua.table_from(dict(right=dx>85 or (turn and dx>0),
                                                  left=dx<-85 or (turn and dx<0),
                                                  attack=distance<120 and not turn and not evade, jump=True)))
        assert test.returns == 0, (variant, test.t, lead.hp, hero.hp)
    raise AssertionError((variant, test.t, lead.hp, hero.hp))


result = dict(
    sharedHpAndOneAoeHit=True, distinctElementSources=True, lockedSweepAndWind=True,
    duetPositionsAndHitOrder=True, cryoBolts=True, armorAndDistinctCasts=True,
    armorMarksCountDistinctLeadHits=True,
    exitClearsArmorWhileKeepingHp=True, variantQuestAndSaveIsolation=True,
    normalAttackSolo={variant: normal_clear(variant) for variant in variants},
    sameSceneCommands=dict(png=png.commands, standard=standard.commands, light=light.commands),
)
(ROOT/'evidence/icewind-field-lua.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(result)
