"""Check Moonfly's locked wing waves and cocoon lifecycle against both Lua profiles."""

import json
from math import isclose

from runtime import ROOT, runtime
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import share
from test_coop_sumeru_field import attack, hurt
from test_draft_nod_boss_balance import SAVES, SPECS, browser_checkpoint
from test_earned_branch_quests import core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import Trial


SPEC = SPECS['moonfly']
CASE = (SPEC.id, SPEC.hub, 'nod-field', SPEC.quest)
SAVE = SAVES/'earned-lv130.json'
SIGNATURE = 'FMF03'


def mark(core, state):
    return core.radiantCocoonEffect(state, 1)


def move_to_lock(boss, parties, step, slot):
    for party in parties:
        place(party, boss.x - 88)
    wait_cast(step, slot, SIGNATURE, 60)
    return slot.cast


def waves_and_expiration(lua, core):
    room, parties, step = share(core, CASE)
    solo, refuge, heal, lethal = parties
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    assert boss.y == 444
    cast = move_to_lock(boss, parties, step, slot)
    assert cast.dir == -1 and boss.pose == 'green' and boss.y == 444
    locked = [(wave.left, wave.right, wave.element) for wave in cast.waves.values()]
    expected = ((.25, 2.25, 'dendro'), (.25, 2.25, 'pyro'), (.10, 2.70, 'pyro'))
    for (left, right, element), (near, far, want_element) in zip(locked, expected):
        assert isclose(left, cast.origin - far*88) and isclose(right, cast.origin - near*88)
        assert element == want_element
    for party in parties:
        place(party, cast.origin + 72)
    start = [party.seq for party in parties]
    wait_cast(step, slot, SIGNATURE, 131)
    assert not any(hurt(party, seq, boss) for party, seq in zip(parties, start))
    for party in (solo, heal, lethal):
        place(party, cast.origin - 70)
    lethal.actors[1].hp = 1
    old_health = heal.actors[1].hp
    early = attack(lua, core, solo, boss, atk=100)
    assert attack(lua, core, solo, boss, atk=100, element='pyro') > 0
    assert boss.element == 'dendro'
    step()
    assert cast.tick == 132 and cast.dir == -1 and boss.pose == 'green'
    assert heal.actors[1].hp == old_health - 25
    assert [bool(mark(core, party)) for party in parties] == [True, False, True, False]
    assert isclose(mark(core, solo).untilTime - room.time, 3)
    assert hurt(solo, start[0], boss) == [(25, 'dendro')]
    reduced = attack(lua, core, solo, boss, atk=100)
    assert early > reduced > 0 and abs(reduced - early*.9) < 1, (early, reduced)
    # This attack carries an earlier start time and still reads the effect on impact.
    assert attack(lua, core, solo, boss, atk=100, startedAt=room.time-1) == reduced
    assert core.healActor(heal, heal.actors[1], 4) == 4
    assert heal.actors[1].hp == old_health-21 and mark(core, heal) is None
    assert attack(lua, core, heal, boss, atk=100) == early
    assert mark(core, solo) and core.healingFactor(solo, solo.actors[1]) == 1
    active = core.frame(solo)
    assert active.fieldBoss.wingWave.active and active.fieldBoss.wingWave.index == 1
    assert '回復で解除' in active.fieldBoss.label
    assert isclose(active.radiantCocoons[1].remaining, 3)

    for party in (solo, heal):
        place(party, cast.origin + 75)
    wait_cast(step, slot, SIGNATURE, 168)
    assert boss.pose == 'flame' and boss.element == 'pyro'
    attack(lua, core, heal, boss, atk=100, element='hydro')
    assert boss.element == 'pyro'
    for party in (solo, heal, refuge):
        place(party, cast.origin - 70)
    wait_cast(step, slot, SIGNATURE, 216)
    assert hurt(heal, start[2], boss) == [(25, 'dendro'), (25, 'pyro')]
    assert hurt(refuge, start[1], boss) == [(25, 'pyro')] and mark(core, refuge) is None
    wait_cast(step, slot, SIGNATURE, 240)
    assert boss.pose == 'cocoon'
    wait_cast(step, slot, SIGNATURE, 300)
    assert hurt(solo, start[0], boss) == [(25, 'dendro'), (25, 'pyro'), (25, 'pyro')]
    for party in parties:
        place(party, cast.origin + 72)
    wait_cast(step, slot, SIGNATURE, 311)
    assert mark(core, solo) and attack(lua, core, solo, boss, atk=100) == reduced
    deadline = mark(core, solo).untilTime
    assert isclose(deadline-room.time, 1/60)
    pulse = lua.table_from(dict(id=1, resolvedAt=deadline, reaction=True))
    assert core.damageFactor(solo, pulse, boss, 'pyro') == 1
    step()
    assert cast.tick == 312 and mark(core, solo) is None
    assert attack(lua, core, solo, boss, atk=100) == early
    wait_cast(step, slot, SIGNATURE, 336)
    assert boss.pose == 'down' and all(mark(core, party) is None for party in parties)
    wait_cast(step, slot, SIGNATURE, 479)
    step()
    assert slot.cast is None
    return {'waveElements':['dendro','pyro','pyro'], 'hitTicks':[132,216,300],
            'hpLossEach':25, 'partialHealing':4, 'naturalClearTick':312,
            'damageBeforeDuringAfter':[early,reduced,early], 'naturalRecoveryTicks':144,
            'lethalAndOutsideFirstWaveUnmarked':True}


def protection_and_cleanup(lua, core):
    room, parties, step = share(core, CASE)
    dodge, shield, valid, reserve = parties
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    cast = move_to_lock(boss, parties, step, slot)
    wait_cast(step, slot, SIGNATURE, 131)
    for party in parties:
        place(party, cast.origin-70)
    place(reserve, cast.origin+80)
    dodge.actors[1].inv = .5
    shield.actors[1].waterShield = lua.table_from(dict(life=2,hp=50,counters=3))
    step()
    assert all(mark(core, party) is None for party in (dodge, shield, reserve))
    assert shield.actors[1].waterShield.hp == 25 and mark(core, valid)
    assert core.healActor(valid, valid.actors[1], 0) == 0 and mark(core, valid)
    alternate = lua.table_from(dict(move=cast.move))
    core.applyShortRadiantCocoon(reserve, reserve.actors[1], alternate,
                                lua.table_from(dict(node=reserve.story.node)))
    assert attack(lua, core, valid, boss, atk=boss.hp*2) > 0
    assert slot.phase == 'respawn' and mark(core, valid) is None and mark(core, reserve)
    core.enterStoryNode(reserve, 'nod-field')
    assert mark(core, reserve) is None
    return {'invulnerableAndShieldedUnmarked':True,'clearedOnDefeatAndExit':True,
            'unrelatedParentPreserved':True}


def main():
    short = runtime(draft_field_moves=True)
    result = waves_and_expiration(*short) | protection_and_cleanup(*short)
    old = Trial(SPEC, False, file=SAVE, engine=(prior_lua,prior_core)).finish(normal=True,ticks=16000)
    new = Trial(SPEC, False, file=SAVE, engine=short).finish(normal=True,ticks=16000)
    for key in ('commission','killXpAndMora','maxHp','partyAttack'):
        assert new[key] == old[key]
    result.update(level=130,previous=old,short=new)
    browser_checkpoint()
    (ROOT/'evidence/draft-moonfly-moves-lua.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: Moonfly waves, protected hits, partial healing, natural expiry and earned quest verified.')


if __name__ == '__main__':
    main()
