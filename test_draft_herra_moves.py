"""Play the alternate Frostnight Herra from earned Lv128 and validate shared timing."""

import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import hits, share
from test_coop_sumeru_field import attack
from test_draft_nod_boss_balance import SAVES, SPECS
from test_earned_snezhnaya_bosses import Trial


SPEC = SPECS['frostnightHerra']
SAVE = SAVES/'earned-lv128.json'
CASE = (SPEC.id, SPEC.hub, 'nod-field', SPEC.quest)


def wave_at(trial, tick):
    return trial.slot.cast and trial.slot.cast.move.id == 'FHR03' and trial.slot.cast.tick == tick


def replay_save(saved, engine):
    lua, core = engine
    state = core.restore(lua.table_from(saved, recursive=True), 12)
    slot = state.fieldSlots[SPEC.id]
    assert slot.cast is None and slot.enemy.form == 'idle'
    assert slot.enemy.gloomCharges == 0 and slot.enemy.adaptedElement is None
    return validate_save(native(core.checkpoint(state)))['fieldBosses'][SPEC.id]


def earned_clear(short_engine, previous_engine):
    previous = Trial(SPEC, False, file=SAVE, engine=previous_engine).finish(normal=True, ticks=10000)
    alternate_normal = Trial(SPEC, False, file=SAVE, engine=short_engine).finish(normal=True, ticks=10000)
    trial = Trial(SPEC, False, file=SAVE, engine=short_engine)
    trial.until(lambda: wave_at(trial, 60))
    trip, boss = trial.trip, trial.boss
    cast = trial.slot.cast
    center, left, right = cast.center, cast.left, cast.right
    assert boss.form == 'shadow' and trip.frame().fieldBoss.gloom is None
    assert trip.frame().fieldBoss.draftMoves and cast.contacts is None
    assert left < trip.actor.x < right
    trip.approach(center, 480, '固定した二連波の中心')
    trip.tick(169-cast.tick)
    hp_before = trip.actor.hp
    trip.act('jump')
    trip.tick(29, trip.inputs['jump'])
    assert cast.tick == 198 and left < trip.actor.x < right
    assert trip.actor.y < 480-.72*88 and trip.actor.hp == hp_before
    assert not cast.seen[1][1]
    saved = trip.snapshot()
    snapshot = saved['fieldBosses'][SPEC.id]
    assert 0 < snapshot['hp'] < snapshot['maxHp'] == 4500000
    for engine in (short_engine, previous_engine):
        replay = replay_save(saved, engine)
        assert replay == snapshot

    trip.approach(right+22, 480, '二波目は予告の外へ')
    assert cast.tick < 272 and trip.actor.x-10 > right
    trip.tick(286-cast.tick)
    assert trip.actor.hp == hp_before and not cast.seen[2][1]
    assert (cast.left, cast.right, cast.center) == (left, right, center)
    assert not boss.adaptedElement and boss.gloomCharges == 0

    trial.until(lambda: wave_at(trial, 324))
    assert trip.frame().fieldBoss.label == '反撃の隙'
    since = trip.state.seq
    trial.until(lambda: any(e.seq>since and e.actor==1 and e.target==boss.id and e.kind=='hit'
                            for e in trip.state.events.values()), normal=True, ticks=130)
    assert wave_at(trial, cast.tick) and 324 <= cast.tick < 468
    counter_tick = cast.tick
    clear = trial.finish(normal=True, ticks=10000)
    for result in (alternate_normal, clear):
        for name in ('commission', 'killXpAndMora', 'maxHp', 'partyAttack'):
            assert result[name] == previous[name]
    return dict(level=128, previous=previous, alternateNormal=alternate_normal, alternateEvadeAndCounter=clear,
                jumpOverFirstWave=True, walkedOutOfSecondWave=True,
                lockedCenter=round(center, 2), groundCounterTick=counter_tick, partialCheckpoint=snapshot,
                reloadedInBothProfiles=True)


def shared_windows(engine):
    lua, core = engine
    room, states, step = share(core, CASE)
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    same = lua.eval('rawequal')
    assert len(room.enemies) == 1 and boss.hp == boss.maxhp == 4500000
    assert all(same(s.enemies[1], boss) for s in states)
    for s in states:
        place(s, boss.x-86)

    wait_cast(step, slot, 'FHR02', 96)
    dive = slot.cast
    wait_cast(step, slot, 'FHR02', 114)
    assert boss.form == 'airborne' and abs(boss.y-(480-1.48*88))<.001
    wait_cast(step, slot, 'FHR02', 132)
    assert boss.y == 480 and boss.x == dive.center
    wait_cast(step, slot, 'FHR02', 176)
    assert boss.form == 'recover'

    for s in states:
        place(s, boss.x-86)
    wait_cast(step, slot, 'FHR03', 59)
    white_damage = attack(lua, core, states[0], boss, atk=100)
    step()
    cast = slot.cast
    assert boss.form == 'shadow' and cast.center is not None
    dark_damage = attack(lua, core, states[0], boss, atk=100)
    for _ in range(3):
        attack(lua, core, states[1], boss, atk=100, element='cryo')
    assert white_damage == dark_damage and white_damage > 0
    assert boss.form == 'shadow' and cast.broken is None and boss.gloomCharges == 0

    left, right = cast.left, cast.right
    for s, x in zip(states, (cast.center, cast.center+13, left-40, right+40)):
        place(s, x)
    marks = [s.seq for s in states]
    wait_cast(step, slot, 'FHR03', 183)
    assert not any(hits(s, boss, mark) for s, mark in zip(states, marks))
    wait_cast(step, slot, 'FHR03', 197)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[24],[24],[],[]]

    member = states[0].coopMember
    core.detachCoop(member)
    core.attachCoop(room, states[0], member)
    for s, x in zip(states, (left-40, cast.center, cast.center+13, right+40)):
        place(s, x)
    wait_cast(step, slot, 'FHR03', 285)
    damage = [hits(s,boss,mark) for s,mark in zip(states,marks)]
    assert damage == [[24],[24,24],[24],[]]
    assert (cast.left, cast.right) == (left, right)
    wait_cast(step, slot, 'FHR03', 324)
    recovery = [core.frame(s).fieldBoss for s in states]
    assert all(frame.label == '反撃の隙' and frame.hp == boss.hp for frame in recovery)
    wait_cast(step, slot, 'FHR03', 467)
    assert not boss.adaptedElement and not boss.adaptUntil
    assert attack(lua, core, states[0], boss, atk=100, x=boss.x) == white_damage
    step()
    assert slot.cast is None
    return dict(participants=4, maxHp=boss.maxhp, sharedEnemy=True, damageByParticipant=damage,
                damageInWhiteAndDark=[white_damage,dark_damage], recoveryTicks=144, airTicks=36)


if __name__ == '__main__':
    short_engine = runtime(draft_field_moves=True)
    previous_engine = runtime(draft_balance=True)
    earned = earned_clear(short_engine, previous_engine)
    print('Earned Lv128 cleared both move variants:', earned['previous']['elapsedSeconds'],
          earned['alternateNormal']['elapsedSeconds'], 'evasion run:', earned['alternateEvadeAndCounter']['elapsedSeconds'],
          flush=True)
    proof = dict(earned=earned, shared=shared_windows(short_engine))
    (ROOT/'evidence/draft-herra-moves-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Both waves, 144 recovery ticks, 36 airborne ticks and four shared players passed.')
