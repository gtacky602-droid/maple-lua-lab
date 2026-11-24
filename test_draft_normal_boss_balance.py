"""Compare four normal boss HP presets with earned gear and portable checkpoints."""

from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_earned_branch_quests import lua, core
from test_earned_snezhnaya_bosses import ENCOUNTERS, Trial


BASE = runtime()
DRAFT = lua, core
NEAR_ENTRY = {
    'flugel': 'train-save.json',
    'immortalConstruct': 'train-save.json',
    'driftingSnow': 'white-pass-save.json',
    'wavebinder': 'white-pass-save.json',
}


def drive_with_earned_gear():
    results = {}
    for name, spec in ENCOUNTERS.items():
        results[name] = {}
        for band, file in (
            ('nearEntry', ROOT/'work/snez-fresh-route-draft'/NEAR_ENTRY[name]),
            ('higherGear', 'lv165-save.json'),
        ):
            trial = Trial(spec, False, file=file, engine=DRAFT)
            row = trial.finish(normal=True, ticks=10000)
            row['level'] = trial.trip.state.progression.level
            assert row['damagingHits'] > 10 and len(row['moves']) >= 2, row
            minimum, maximum = (45, 90) if band == 'nearEntry' else (8, 40)
            assert minimum <= row['elapsedSeconds'] <= maximum, row
            results[name][band] = row
            print(name, band, row['level'], row['elapsedSeconds'], flush=True)
    return results


def exercise_mechanics():
    proof = {}

    trial = Trial(ENCOUNTERS['wavebinder'], False, engine=DRAFT)
    trial.until(lambda: trial.slot.cast and trial.slot.cast.drinkOpen)
    trial.until(lambda: trial.boss.downReason == 'drink', skills=('SK09','SK10'), ticks=150)
    assert trial.boss.drinkInterrupts == 1 and trial.attacks['SK09'] == trial.attacks['SK10'] == 1
    proof['wavebinder'] = trial.finish(normal=True)

    trial = Trial(ENCOUNTERS['immortalConstruct'], False, engine=DRAFT)
    trial.until(lambda: trial.boss.lifeUnits == 12)
    assert trial.slot.cast.spent == round(96*trial.max_hp/1260)
    trial.until(lambda: trial.boss.form == 'down', normal=True)
    assert trial.boss.lifeUnits == 0 and trial.boss.shieldBreaks == 6
    proof['immortalConstruct'] = trial.finish(normal=True)

    trial = Trial(ENCOUNTERS['driftingSnow'], False, engine=DRAFT)
    trial.until(lambda: trial.boss.coffinLayers == 8, normal=True)
    trial.until(lambda: trial.boss.form == 'down', normal=True, skills=('SK21','SK09','SK10'), ticks=360)
    assert trial.boss.coffinUsed and trial.boss.coffinLayers == 0
    proof['driftingSnow'] = trial.finish(normal=True)

    trial = Trial(ENCOUNTERS['flugel'], False, engine=DRAFT)
    trial.until(lambda: trial.boss.downReason == 'ward', normal=True, skills=('SK21','SK13'))
    trial.until(lambda: trial.boss.mode == 'anemo')
    trial.until(lambda: trial.slot.cast and trial.slot.cast.summons is not None)
    cast = trial.slot.cast
    for _ in range(240):
        if trial.boss.downReason == 'orbs':
            break
        assert trial.slot.cast and trial.slot.cast.summons and trial.boss.hp > 0
        target = min((enemy for enemy in cast.summons.values() if enemy.hp > 0),
                     key=lambda enemy:abs(enemy.x-trial.trip.actor.x))
        trial.step(normal=True, skills=('SK09','SK21','SK10'), aim=target)
    assert trial.boss.downReason == 'orbs' and cast.brokenOrbs >= 3
    proof['flugel'] = trial.finish(normal=True)
    return proof


def reencode(data, engine):
    vm, runtime_core = engine
    state = runtime_core.restore(vm.table_from(validate_save(data), recursive=True), 12)
    return validate_save(native(runtime_core.checkpoint(state)))


def portability():
    checks = {}
    for name, spec in ENCOUNTERS.items():
        trial = Trial(spec, True, engine=BASE)
        if name == 'driftingSnow':
            trial.until(lambda: trial.boss.coffinLayers == 8, normal=True)
        else:
            trial.until(lambda: 0 < trial.boss.hp < trial.max_hp, normal=True)
        origin = trial.trip.snapshot()
        standard = origin['fieldBosses'][spec.id]
        assert 'maxHp' not in standard and standard['elapsedTicks'] > 0
        provisional = reencode(origin, DRAFT)
        draft = provisional['fieldBosses'][spec.id]
        assert draft['maxHp'] > trial.max_hp and 0 < draft['hp'] < draft['maxHp']
        assert abs(draft['hp']/draft['maxHp']-standard['hp']/trial.max_hp) <= 1/draft['maxHp']
        assert reencode(provisional, DRAFT)['fieldBosses'][spec.id] == draft
        assert reencode(provisional, BASE)['fieldBosses'][spec.id] == standard

        # A finished boss stays defeated until its original respawn timer expires.
        trial.finish(normal=True, skills=('SK21','SK09','SK10'))
        after = trial.trip.snapshot()
        clear = after['fieldBosses'][spec.id]
        assert clear['hp'] == 0 and clear['waitTicks'] > 0
        loaded = reencode(after, DRAFT)['fieldBosses'][spec.id]
        assert loaded['hp'] == 0 and loaded['waitTicks'] == clear['waitTicks']
        checks[name] = {'base':standard, 'baseMaxHp':trial.max_hp, 'draft':draft,
                        'roundTripMatchesBase':True, 'clearCooldownPreserved':True}

        if name == 'driftingSnow':
            assert standard['flags']['coffinUsed']
            (ROOT/'work/earned-drifting-snow-base-partial.json').write_text(
                json.dumps(origin, ensure_ascii=False)+'\n', encoding='utf8')
    return checks


def reject_invalid_max_hp():
    sample = json.loads((ROOT/'work/earned-drifting-snow-base-partial.json').read_bytes())
    boss_id = ENCOUNTERS['driftingSnow'].id
    for bad in (False, 0, 10**9+1):
        malformed = deepcopy(sample)
        malformed['fieldBosses'][boss_id]['maxHp'] = bad
        try:
            validate_save(malformed)
        except ValueError:
            continue
        raise AssertionError(('accepted unsupported maximum HP', bad))


def verify_party_hp():
    result = {}
    for name, spec in ENCOUNTERS.items():
        players = [Trial(spec, False, engine=DRAFT).trip for _ in range(4)]
        solo_boss = players[0].state.fieldSlots[spec.id].enemy
        solo = solo_boss.maxhp
        for player in players:
            player.approach(solo_boss.x-200, 480, spec.arena)
        room = core.newCoop(players[0].state)
        for player in players:
            assert core.attachCoop(room, player.state)
        assert room.fieldSlot.enemy.maxhp == room.fieldSlot.enemy.hp == solo
        assert all(player.frame().fieldBoss.maxhp == solo for player in players)
        result[name] = {'soloMaxHp':solo, 'fourPlayerMaxHp':room.fieldSlot.enemy.maxhp}
    return result


if __name__ == '__main__':
    results = {'earnedGear':drive_with_earned_gear(), 'mechanicsAt165':exercise_mechanics(),
               'checkpointPortability':portability(), 'coopHp':verify_party_hp()}
    reject_invalid_max_hp()
    (ROOT/'evidence/draft-snezhnaya-boss-hp-lua.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Four draft HP presets, four actual mechanic clears, and checkpoint portability verified.')
