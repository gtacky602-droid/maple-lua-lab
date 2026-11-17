import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'natlan-hub', 'natlan-field', 'yumka-field-ravine'
boss_id, quest = 'boss-26220301', 'yumka-commission'
empty = lua.table()
design = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_NATLAN_ORIGINS.json').read_text(encoding='utf8'))
configs = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8-sig'))
moves = next(r['moves'] for r in configs['fieldBosses'] if r['id']==boss_id)
for card, move in zip((a for a in design['attacks'] if a['owner']==boss_id), moves, strict=True):
    assert (move['id'],move['lock'],move['total']) == (card['id'],card['lock'],card['total'])
    assert [move['recover'],move['total']] == card['recovery']
    assert move['active'] == [w[:2] for w in card['active']]
    assert ([move['air']] if 'air' in move else []) == card['air']
    assert move.get('fire',[]) == [lob[0] for lob in card.get('decorative_lobs',[])]


def spot(actor, x, y=480):
    actor.x, actor.y, actor.vy, actor.inv, actor.ground = x, y, 0, 0, y == 480


def portal(state, x, node):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def make(fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[103]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save = validate_save(native(core.checkpoint(state)))
        (ROOT/'work/yumka-field-fixture.json').write_text(json.dumps(save), encoding='utf8')
    core.action(state, 'story_accept:'+quest)
    assert state.story.quests[quest].status == 'active'
    portal(state, 1380, approach)
    portal(state, 690, arena)
    state.actors[2].hp = 0
    slot = state.fieldSlots[boss_id]
    return state, slot, slot.enemy, state.actors[1]


def until(state, slot, move, tick):
    for _ in range(2200):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        core.step(state, 1/60, empty)
    raise AssertionError((move, tick, slot.phase, state.actors[1].hp))


def strike(state, boss, y=480, element='physical'):
    hp = boss.hp
    core.resolveCast(state, lua.table_from(dict(id=1, atk=20, x=boss.x, y=y, dir=1,
        radial=True, range=90, limit=1, mult=1, color='#fff0ac', gain=0, element=element, critRate=0,
        targetId=boss.id)))
    return hp-boss.hp


state, slot, boss, hero = make(fixture=True)
assert boss.level == 104 and boss.hp == 1035
assert math.isclose(boss.hitBottom, 480-.2*88)
damage = strike(state, boss)
assert strike(state, boss, element='dendro') == math.floor(damage*.55) > 0
spot(hero, boss.x-100)
tail = until(state, slot, 'FYM01', 48)
hp = hero.hp
spot(hero, tail.origin+137)
until(state, slot, 'FYM01', 110)
assert hero.hp == hp and not tail.seen[1][1]
spot(hero, tail.origin+91)
until(state, slot, 'FYM01', 117)
assert hero.hp == hp-21 and tail.seen[1][1] and tail.source.damageElement == 'physical'

spot(hero, boss.x-157)
belly = until(state, slot, 'FYM02', 60)
locked = belly.dest
assert math.isclose(locked, belly.origin-1.4*88)
spot(hero, boss.x+137)
until(state, slot, 'FYM02', 102)
assert belly.dest == locked and math.isclose(boss.y, 480-.9*88)
assert math.isclose(boss.x, (belly.origin+locked)/2) and boss.form == 'airborne'
assert math.isclose(boss.hitBottom, boss.y-.2*88)
assert strike(state, boss)==0 and strike(state, boss, boss.y)==damage
leap_art = core.yumkaFieldArt.leap
assert any(d.kind=='boss_sprite' and d.source==leap_art.source and d.box[1]==leap_art.box[1]
           and math.isclose(d.y,boss.y) for d in core.frame(state,'sprite').draws.values())
hp = hero.hp
spot(hero, locked)
until(state, slot, 'FYM02', 119)
assert hero.hp == hp and not belly.seen[1][1]
until(state, slot, 'FYM02', 122)
assert hero.hp == hp-25 and boss.y == 480 and boss.x == locked and belly.seen[1][1]
until(state, slot, 'FYM02', 168)
assert boss.form == 'resting' and belly.move.total-168 == 144
assert strike(state, boss) == damage

spot(hero, boss.x-88)
fruit = until(state, slot, 'FYM03', 54)
points = (fruit.points[1], fruit.points[2])
assert math.isclose(points[0]-points[1], 88) and len(state.enemies) == 1
assert fruit.source.damageElement == 'pyro'
hp = hero.hp
spot(hero, points[0])
until(state, slot, 'FYM03', 114)
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite','legacy'), ('rect','legacy'), ('rect','h32c16')]]
assert png.t == standard.t == light.t and light.commands < standard.commands
assert sum(1 for d in png.draws.values() if d.source == 'yumka-field-poses-source-v1.png') == 2
assert hero.hp == hp and not fruit.seen[1][1] and png.fieldBoss.summon is None
assert '残り一つ' in png.fieldBoss.label
until(state, slot, 'FYM03', 129)
assert hero.hp == hp-20 and fruit.seen[1][1] and not fruit.seen[2][1]
spot(hero, points[1])
until(state, slot, 'FYM03', 174)
assert hero.hp == hp-20 and (fruit.points[1],fruit.points[2]) == points
until(state, slot, 'FYM03', 182)
assert hero.hp == hp-40 and fruit.seen[2][1]

hero.hp = hero.maxhp
spot(hero, boss.x-95)
until(state, slot, 'FYM02', 101)
hp = boss.hp
portal(state, 65, approach)
assert boss.y == 480 and boss.form == 'ground' and slot.cast is None
portal(state, 690, arena)
assert boss.hp == hp
spot(hero, boss.x-100)
belly = until(state, slot, 'FYM02', 102)
boss.hp = 1
kills, mora = state.kills, state.mora
assert strike(state, boss, boss.y) == 1 and slot.phase == 'respawn'
assert slot.cast is None and state.kills == kills+1 and state.mora == mora+370
assert state.story.quests[quest].count == 1 and not belly.seen[1][1]
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(saved, recursive=True),12)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp == 7400 and restored.mora-mora == 470


def solo():
    state, slot, boss, hero = make()
    moves = set()
    for _ in range(126*60):
        if boss.hp<=0:
            assert len(moves)==3
            return dict(seconds=round(state.t,2), hp=hero.hp, moves=sorted(moves))
        dx = boss.x-hero.x
        turn = abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            jump = any(w[1]-23<=c.tick<=w[1]-17 for w in c.move.active.values())
            if jump and hero.ground:
                core.action(state,'jump')
        core.step(state,1/60,lua.table_from(dict(
            right=dx>87 or (turn and dx>0), left=dx<-87 or (turn and dx<0),
            attack=abs(dx)<120 and not turn, jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(designTimingsMatch=True, lockedTail=True, fixedBellyLanding=True, airborneArtAndHurtbox=True, recoveryTicks=144,
            fruitArcHasNoDamage=True, fixedFruitImpacts=True, eachImpactHitsOnce=True,
            airborneCleanupOnExitAndKill=True, questReportAndSavedCooldown=True, normalAttackSolo=solo(),
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/yumka-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
