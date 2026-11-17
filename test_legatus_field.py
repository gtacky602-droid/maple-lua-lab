import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
arena, approach, hub = 'legatus-field-hall', 'nostoi-castle-approach', 'fontaine-hub'
id, quest = 'boss-26140101', 'legatus-commission'
empty = lua.table()


def spot(actor, x, y=480):
    actor.x, actor.y, actor.ground, actor.vy, actor.inv = x, y, y == 480, 0, 0


def portal(state, x, node):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def approach_boss(hero, boss):
    spot(hero, boss.x-103 if boss.x>=460 else boss.x+103)


def make(fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[91]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    core.action(state, 'story_accept:'+quest)
    assert state.story.quests[quest].status == 'active'
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        saved = validate_save(native(core.checkpoint(state)))
        (ROOT/'work/legatus-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    portal(state, 820, approach)
    portal(state, 1050, arena)
    state.actors[2].hp = 0
    slot = state.fieldSlots[id]
    return state, slot, slot.enemy, state.actors[1]


def until(state, slot, move, tick):
    for _ in range(2200):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        core.step(state, 1/60, empty)
    raise AssertionError((move, tick, slot.phase, state.actors[1].hp))


def strike(state, enemy, atk=20):
    hp = enemy.hp
    core.resolveCast(state, lua.table_from(dict(id=1, atk=atk, x=enemy.x, y=480, dir=1,
                                               radial=True, range=95, limit=1, mult=1, color='#fff0ac',
                                               gain=0, element='physical', critRate=0, targetId=enemy.id)))
    return hp-enemy.hp


state, slot, boss, hero = make(fixture=True)
assert boss.hp == 1010 and boss.level == 92
normal = strike(state, boss)
assert normal > 0
hp = hero.hp
spot(hero, boss.x-117)
sweep = until(state, slot, 'FLG01', 45)
assert sweep.dir == -1
spot(hero, boss.x+104)
until(state, slot, 'FLG01', 103)
assert hero.hp == hp and sweep.dir == -1
spot(hero, boss.x-108)
until(state, slot, 'FLG01', 106)
assert hero.hp == hp-20 and sweep.seen[1]

spot(hero, boss.x-115)
charge = until(state, slot, 'FLG02', 54)
assert math.isclose(charge.dest, charge.origin-3.7*88)
hp = hero.hp
spot(hero, charge.dest)
until(state, slot, 'FLG02', 116)
assert hero.hp == hp and not charge.seen[1] and charge.dest < boss.x < charge.origin
until(state, slot, 'FLG02', 150)
assert math.isclose(boss.x, charge.dest) and charge.seen[1] and hero.hp == hp-21

approach_boss(hero, boss)
signal = until(state, slot, 'FLG03', 54)
device = signal.summon
assert device.maxhp == 14 and device.x == signal.resonatorX and len(state.enemies) == 2
assert boss.form == 'resonating' and strike(state, boss) == math.floor(normal*.55)
png, standard, light = [core.frame(state, mode, profile) for mode, profile in
                        [('sprite', 'legacy'), ('rect', 'legacy'), ('rect', 'h32c16')]]
assert png.t == standard.t == light.t and light.commands < standard.commands
assert png.fieldBoss.summon.id == device.id
assert any(d.kind == 'boss_sprite' and d.source == 'legatus-field-poses-source-v1.png' for d in png.draws.values())
reward_before = (state.kills, state.mora, state.progression.killXp, state.story.quests[quest].count)
until(state, slot, 'FLG03', 165)
assert strike(state, device, 10) > 0 and strike(state, device, 10) > 0 and device.hp == 0
assert (state.kills, state.mora, state.progression.killXp, state.story.quests[quest].count) == reward_before
hp = hero.hp
spot(hero, signal.resonatorX)
# Keep the actor within the arena during the interruption check.
until(state, slot, 'FLG03', 178)
assert signal.interrupted and signal.ends == 166+144
assert signal.summon is None and len(state.enemies) == 1
assert boss.form == 'staggered' and hero.hp == hp and not signal.seen[1]
assert strike(state, boss) == normal

hero.hp = hero.maxhp
approach_boss(hero, boss)
signal = until(state, slot, 'FLG03', 54)
device = signal.summon
hp = hero.hp
spot(hero, device.x)
until(state, slot, 'FLG03', 166)
assert device.hp == 0 and signal.summon is None and not signal.interrupted
assert signal.seen[1] and hero.hp == hp-24, (signal.seen[1], hp, hero.hp)
assert boss.form == 'marble' and strike(state, boss) == normal

hero.hp = hero.maxhp
approach_boss(hero, boss)
signal = until(state, slot, 'FLG03', 54)
device = signal.summon
remaining = boss.hp
portal(state, 65, approach)
assert device.hp == 0 and slot.cast is None and boss.form == 'marble'
portal(state, 1050, arena)
assert boss.hp == remaining and len(state.enemies) == 1
approach_boss(hero, boss)
signal = until(state, slot, 'FLG03', 54)
device = signal.summon
boss.hp = 1
mora, kills = state.mora, state.kills
assert strike(state, boss) == 1 and slot.phase == 'respawn'
assert device.hp == 0 and signal.summon is None and len(state.enemies) == 1
assert state.kills == kills+1 and state.mora == mora+335
assert state.story.quests[quest].count == 1
saved = validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][id]['waitTicks'] == 3600
restored = core.restore(lua.table_from(saved, recursive=True), 12)
xp, mora = restored.progression.questXp, restored.mora
for _ in range(2):
    core.action(restored, 'story_report:'+quest)
assert restored.progression.questXp-xp == 6200 and restored.mora-mora == 420


def clear_solo(interrupt):
    state, slot, boss, hero = make()
    start = state.t
    moves = set()
    stopped, released = 0, 0
    for _ in range(135*60):
        if boss.hp <= 0:
            assert len(moves) == 3
            return dict(seconds=round(state.t-start, 2), hp=hero.hp, stopped=stopped, released=released)
        c = slot.cast
        device = c and c.summon
        if c:
            moves.add(c.move.id)
            if c.interrupted and c.tick == c.ends-c.move.resonator.stagger:
                stopped += 1
            if c.move.resonator and c.tick == c.move.resonator.release and not c.interrupted:
                released += 1
        target = device if interrupt and device else boss
        dx = target.x-hero.x
        range_start = 60 if target is not boss else 96
        turn = abs(dx)>8 and dx*hero.dir<0
        jump = False
        if c:
            t, m = c.tick, c.move
            if m.kind == 'sweep':
                jump = 77 <= t < 84
            elif m.kind == 'charge' and c.dest is not None and 88 <= t < 141:
                distance = (hero.x-boss.x)*c.dir
                if t<112:
                    arrival = 112+math.ceil(max(0,distance-m.margin*88)*39/max(1,abs(c.dest-c.origin)))
                else:
                    arrival = t+math.ceil(max(0,distance-m.margin*88)*39/max(1,abs(c.dest-c.origin)))
                jump = distance>=-32 and 0 <= arrival-t <= 22
                if (hero.cd.dodge or 0)<=0 and t>=108 and abs(distance)<95 and hero.dir==-c.dir:
                    core.action(state, 'dodge')
            if m.resonator and not interrupt and 115 <= t < 181:
                gap = hero.x-c.resonatorX
                if abs(gap)<m.width*88/2+18:
                    dx = 160 if gap>=0 else -160
        if jump and hero.ground:
            core.action(state, 'jump')
        core.step(state, 1/60, lua.table_from(dict(
            right=dx>range_start or (turn and dx>0), left=dx<-range_start or (turn and dx<0),
            attack=abs(dx)<(97 if device and interrupt else 123) and not turn, jump=True)))
        assert state.returns == 0, (interrupt, state.t, boss.hp, hero.hp)
    raise AssertionError((interrupt, state.t, boss.hp, hero.hp))


interrupted, evaded = clear_solo(True), clear_solo(False)
assert interrupted['stopped']>0 and evaded['released']>0, (interrupted, evaded)
result = dict(attacks=['FLG01', 'FLG02', 'FLG03'], lockedDirection=True, chargeUsesSweptBody=True,
              optionalResonatorInterruption=True, lastTickBreakWins=True, noDeviceRewards=True,
              cleanupOnExitAndKill=True, oneQuestReportAndSavedRespawn=True,
              normalAttackSolo=dict(breakResonator=interrupted, evadeFlame=evaded),
              sameSceneCommands=dict(png=png.commands, standard=standard.commands, light=light.commands),
              killXP=state.progression.killXp)
(ROOT/'evidence/legatus-field-lua.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(result)
