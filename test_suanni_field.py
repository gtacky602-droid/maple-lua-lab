import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'chenyu-camp', 'chenyu-depth', 'suanni-field-sanctum'
boss_id, quest = 'boss-26190101', 'suanni-commission'
empty = lua.table()


def spot(actor, x, y=480):
    actor.x, actor.y, actor.vy, actor.inv, actor.ground = x, y, 0, 0, y == 480


def portal(state, x, node):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def make(fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[31]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save = validate_save(native(core.checkpoint(state)))
        (ROOT/'work/suanni-field-fixture.json').write_text(json.dumps(save), encoding='utf8')
    core.action(state, 'story_accept:'+quest)
    assert state.story.quests[quest].status == 'active'
    portal(state, 1380, approach)
    portal(state, 1310, arena)
    state.actors[2].hp = 0
    slot = state.fieldSlots[boss_id]
    return state, slot, slot.enemy, state.actors[1]


def until(state, slot, move, tick):
    for _ in range(2300):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        core.step(state, 1/60, empty)
    raise AssertionError((move, tick, slot.phase, state.actors[1].hp))


def hit(state, enemy, y=480):
    hp = enemy.hp
    core.resolveCast(state, lua.table_from(dict(id=1, atk=20, x=enemy.x, y=y, dir=1,
                              radial=True, range=52, limit=1, mult=1, color='#fff0ac',
                              gain=0, element='physical', critRate=0, targetId=enemy.id)))
    return hp-enemy.hp


state, slot, boss, hero = make(fixture=True)
assert boss.level == 32 and boss.hp == 738 and boss.hitBottom == 458
hp = hero.hp
spot(hero, boss.x-68)
claw = until(state, slot, 'FSU01', 48)
assert claw.dir == -1 and claw.sources.physical.damageElement == 'physical'
assert '前爪 1/2' in core.frame(state, 'sprite', 'legacy').fieldBoss.label
until(state, slot, 'FSU01', 97)
assert hero.hp == hp-16 and claw.seen[1][1] and not claw.seen[2][1]
spot(hero, boss.x+92)
until(state, slot, 'FSU01', 169)
assert hero.hp == hp-32 and claw.seen[2][1] and claw.dir == -1
assert '風尾 2/2' in core.frame(state, 'sprite', 'legacy').fieldBoss.label

spot(hero, boss.x-82)
blades = until(state, slot, 'FSU02', 48)
hp = hero.hp
assert '双水刃 1/2' in core.frame(state, 'sprite', 'legacy').fieldBoss.label
until(state, slot, 'FSU02', 112)
assert blades.seen[1][1] and not blades.seen[2][1] and hero.hp == hp-16
spot(hero, boss.x-93)
until(state, slot, 'FSU02', 185)
assert blades.seen[2][1] and hero.hp == hp-32 and blades.dir == -1
assert '双水刃 2/2' in core.frame(state, 'sprite', 'legacy').fieldBoss.label

hero.hp = hero.maxhp
spot(hero, boss.x-117)
fall = until(state, slot, 'FSU03', 60)
locked = fall.dest
assert math.isclose(locked, boss.x-117)
opening = core.frame(state, 'sprite', 'legacy').fieldBoss
assert '風の輪から離れる' in opening.label and opening.destinationX == locked
labels = [d for d in core.frame(state, 'sprite', 'legacy').draws.values()
          if d.kind == 'text' and d.color in ('#9df4ce', '#91d6ff')]
assert [(d.text, d.y) for d in labels] == [('1', 501), ('2', 522)]
spot(hero, boss.x-42)
until(state, slot, 'FSU03', 110)
assert hero.hp == hero.maxhp-17 and fall.seen[1][1]
spot(hero, boss.x-240)
until(state, slot, 'FSU03', 174)
assert fall.dest == locked and math.isclose(boss.x, (fall.origin+fall.dest)/2)
assert math.isclose(boss.y, 480-.8*88) and boss.form=='airborne'
assert boss.hitBottom==boss.y-22 and hit(state,boss)==0 and hit(state,boss,boss.y)>0
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite', 'legacy'), ('rect', 'legacy'), ('rect', 'h32c16')]]
assert png.t == standard.t == light.t and light.commands < standard.commands
assert '水の着地点と波から離れる' in png.fieldBoss.label
assert any(d.kind=='boss_sprite' and d.source=='suanni-field-poses-source-v1.png'
           and math.isclose(d.y,boss.y) for d in png.draws.values())
spot(hero, locked)
until(state, slot, 'FSU03', 192)
assert hero.hp == hero.maxhp-37 and fall.seen[2][1] and boss.y == 480 and boss.x == locked
spot(hero, locked-84)
until(state, slot, 'FSU03', 218)
assert hero.hp == hero.maxhp-37 and hero.inv==0
assert '水波' in core.frame(state, 'sprite', 'legacy').fieldBoss.label
until(state, slot, 'FSU03', 228)
assert boss.form == 'resting' and fall.move.total-228 == 144
rest = core.frame(state, 'sprite', 'legacy').fieldBoss
assert '頭が下がる・反撃' == rest.label and rest.recoveryTicks == 144 and rest.destinationX is None

hero.hp = hero.maxhp
spot(hero, boss.x-120)
stay = until(state, slot, 'FSU03', 60)
spot(hero, stay.dest-104)
hp = hero.hp
until(state, slot, 'FSU03', 204)
assert hero.hp == hp and not stay.seen[2][1]
until(state, slot, 'FSU03', 227)
assert hero.hp == hp-20 and stay.seen[2][1]

hero.hp = hero.maxhp
spot(hero, boss.x-100)
until(state, slot, 'FSU03', 173)
remaining = boss.hp
portal(state, 65, approach)
assert boss.y == 480 and boss.form is None and slot.cast is None
portal(state, 1310, arena)
assert boss.hp == remaining and boss.hitBottom == 458
boss.hp = 1
mora, kills = state.mora, state.kills
assert hit(state, boss) == 1 and slot.phase == 'respawn'
assert state.kills == kills+1 and state.mora == mora+196 and state.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:'+quest)
assert restored.progression.questXp-xp == 2900 and restored.mora-mora == 240


def clear_after_resuming():
    state, slot, boss, hero = make()
    spot(hero, boss.x-42)
    assert hit(state, boss) > 0
    assert 0 < boss.hp < boss.maxhp
    for _ in range(42):
        core.step(state, 1/60, empty)
    snapshot = validate_save(native(core.checkpoint(state)))
    elapsed = round((state.t-slot.entryAt)*60)
    resumed = core.restore(lua.table_from(snapshot, recursive=True), 12)
    travel_ticks = 600
    for _ in range(travel_ticks):
        core.step(resumed, 1/60, empty)
    portal(resumed, 1380, approach)
    portal(resumed, 1310, arena)
    active_slot = resumed.fieldSlots[boss_id]
    assert active_slot.enemy.hp == snapshot['fieldBosses'][boss_id]['hp']
    active_slot.enemy.hp = 1
    assert hit(resumed, active_slot.enemy) == 1
    record = resumed.endgame and resumed.endgame.bosses[boss_id]
    assert record and record.clears == 1 and record.bestTicks == elapsed + travel_ticks
    assert snapshot['fieldBosses'][boss_id]['elapsedTicks'] == elapsed
    finished = validate_save(native(core.checkpoint(resumed)))
    assert finished['endgame']['bosses'][boss_id]['bestTicks'] == record.bestTicks
    legacy_slot = snapshot['fieldBosses'][boss_id]
    del legacy_slot['elapsedTicks']
    legacy = core.restore(lua.table_from(validate_save(snapshot), recursive=True), 12)
    assert legacy.fieldSlots[boss_id].enemy.hp == legacy_slot['hp']
    return record.bestTicks


def clear_solo():
    state, slot, boss, hero = make()
    start = state.t
    moves = set()
    for _ in range(136*60):
        if boss.hp <= 0:
            assert len(moves)==3
            return dict(seconds=round(state.t-start, 2), hp=hero.hp, moves=sorted(moves))
        c = slot.cast
        dx = boss.x-hero.x
        move = dx
        turn = abs(dx)>8 and dx*hero.dir<0
        evade, jump = False, False
        if c:
            moves.add(c.move.id)
            t,m = c.tick,c.move
            if m.kind=='claw':
                jump = 77<=t<=82 or 144<=t<=150
            elif m.kind=='blades':
                gap = (hero.x-c.origin)*c.dir
                arrival = round(max(0,gap-.42*88)/(3.5*88/60))
                jump = gap>25 and any(fire+arrival-23<=t<=fire+arrival-18 for fire in (96,156))
            elif c.dest is not None:
                jump = 85<=t<=90 or 169<=t<=175
                if 172<=t<228 and c.dir*(hero.x-c.dest)>=-10 and abs(hero.x-c.dest)<185:
                    move = (hero.x-c.dest)*7 if abs(hero.x-c.dest)>22 else -c.dir*180
                    evade = True
        if jump and hero.ground:
            core.action(state, 'jump')
        core.step(state, 1/60, lua.table_from(dict(right=move>83 or (turn and move>0),
                          left=move<-83 or (turn and move<0), attack=abs(dx)<119 and not turn and not evade, jump=True)))
        assert state.returns == 0, (state.t,boss.hp,hero.hp)
    raise AssertionError((boss.hp,hero.hp))


result = dict(lockedForeAndRear=True, separateWaterBlades=True, windAndWaterWindows=True,
              fixedLanding=True, airborneHurtbox=True, landingAndWaveShareOneHit=True,
              waveCanHitOnItsOwn=True, recoveryTicks=144, exitRestoresGround=True,
              oneQuestReportAndSavedRespawn=True, normalAttackSolo=clear_solo(),
              timedClearAfterResumingTicks=clear_after_resuming(),
              sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/suanni-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
