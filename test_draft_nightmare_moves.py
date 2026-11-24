"""Verify the shortened Nightmare on the earned route and at exact encounter ticks."""

import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import hits, share
from test_coop_sumeru_field import attack
from test_draft_nod_boss_balance import SAVES, SPECS
from test_earned_branch_quests import Journey
from test_earned_snezhnaya_bosses import Trial


SPEC = SPECS['whispererNightmares']
SAVE = SAVES/'earned-lv128.json'
CASE = (SPEC.id, SPEC.hub, 'nod-field', SPEC.quest)
SKILLS = ('SK21', 'SK09', 'SK10')


def earned(lua, core, previous):
    engine = lua, core
    browser = Journey(SAVE, engine=engine)
    slots = [[key] for key in SKILLS] + [[] for _ in range(8-len(SKILLS))]
    assert core.configure(browser.state,lua.table_from(slots, recursive=True))[0]
    (ROOT/'work/earned-nightmare-ready.json').write_text(
        json.dumps(browser.snapshot(),ensure_ascii=False)+'\n',encoding='utf8')
    slow = Trial(SPEC, False, file=SAVE, engine=previous).finish(normal=True, ticks=12000)
    short = Trial(SPEC, False, file=SAVE, engine=engine).finish(normal=True, ticks=12000)
    trial = Trial(SPEC, False, file=SAVE, engine=engine, skills=SKILLS)
    trial.until(lambda: trial.slot.cast and trial.slot.cast.summons)
    cast = trial.slot.cast
    assert cast.tick == 72 and trial.trip.frame().fieldBoss.draftMoves
    assert trial.boss.damageShield == 0 and len(cast.summons) == 2
    baseline = trial.trip.state.kills, trial.trip.state.mora, trial.trip.state.progression.killXp
    opening = trial.trip.snapshot()
    roundtrips = []
    for vm, candidate in (engine, previous):
        restored = candidate.restore(vm.table_from(opening, recursive=True), 12)
        record = validate_save(native(candidate.checkpoint(restored)))['fieldBosses'][SPEC.id]
        assert record == opening['fieldBosses'][SPEC.id]
        assert restored.fieldSlots[SPEC.id].cast is None
        roundtrips.append(record['hp'])
    fishers = sorted(cast.summons.values(), key=lambda unit:abs(trial.trip.actor.x-unit.x))
    for unit in fishers:
        trial.until(lambda: unit.hp == 0, normal=True, skills=SKILLS, aim=unit, ticks=210)
    trial.until(lambda: cast.broken, ticks=6)
    assert trial.boss.form == 'down' and cast.defeatedFishers == 2 and not cast.summons
    assert cast.broken <= 300 and trial.boss.hp > 0
    assert (trial.trip.state.kills, trial.trip.state.mora, trial.trip.state.progression.killXp) == baseline
    stopped = cast.broken
    clear = trial.finish(normal=True, ticks=10000)
    for row in (short, clear):
        assert row['killXpAndMora'] == slow['killXpAndMora'] and row['commission'] == slow['commission']
        assert row['partyAttack'] == slow['partyAttack'] and row['maxHp'] == slow['maxHp']
    return dict(level=128, previous=slow, alternateNormal=short, alternateInterrupted=clear,
                interruptionTick=stopped, fisherHp=fishers[0].maxhp, restoredBossHp=roundtrips)


def start_fishers(slot, states, step):
    for state in states:
        place(state, slot.enemy.x-85)
    wait_cast(step, slot, 'FWN03', 72)
    return slot.cast


def timings(lua, core):
    room, states, step = share(core, CASE)
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    assert boss.maxhp == 3100000
    same = lua.eval('rawequal')
    for state in states:
        place(state,boss.x-85)
        assert same(state.enemies[1],boss)

    wait_cast(step, slot, 'FWN02', 83)
    assert not boss.underground
    step()
    assert boss.underground
    wait_cast(step, slot, 'FWN02', 119)
    assert boss.underground and attack(lua,core,states[0],boss) == 0
    step()
    rift = slot.cast
    assert not boss.underground and boss.x == rift.destination and rift.tick == 120
    assert '裂け目から出現' in core.frame(states[0]).fieldBoss.label
    place(states[0],rift.destination)
    mark = states[0].seq
    wait_cast(step,slot,'FWN02',143)
    assert not hits(states[0],boss,mark)
    step()
    assert hits(states[0],boss,mark) == [28]

    cast = start_fishers(slot, states, step)
    first, second = cast.summons[1], cast.summons[2]
    assert first.x == cast.origin+cast.dir*.85*88 and second.x == cast.origin+cast.dir*2.35*88
    idle_damage = attack(lua,core,states[0],boss,atk=100)
    assert idle_damage > 0 and core.frame(states[0]).fieldBoss.darkShield is None
    outside = cast.right+45
    for s,x in zip(states,(first.x,second.x,outside,outside+25)):
        place(s,x)
    marks = [s.seq for s in states]
    wait_cast(step,slot,'FWN03',155)
    assert not any(hits(s,first,mark) for s,mark in zip(states,marks))
    step()
    assert [hits(s,first,mark) for s,mark in zip(states,marks)] == [[9],[],[],[]]
    wait_cast(step,slot,'FWN03',228)
    assert [hits(s,second,mark) for s,mark in zip(states,marks)] == [[],[9],[],[]]
    assert hits(states[0],first,marks[0]) == [9]
    wait_cast(step,slot,'FWN03',299)
    assert len(room.enemies) == 3 and cast.defeatedFishers == 0
    step()
    assert len(room.enemies) == 1 and cast.defeatedFishers == 0 and cast.broken is None
    wait_cast(step,slot,'FWN03',323)
    assert not any(hits(s,boss,mark) for s,mark in zip(states,marks))
    step()
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)] == [[38],[38],[],[]]
    wait_cast(step,slot,'FWN03',360)
    assert all(core.frame(s).fieldBoss.label == '反撃の隙' for s in states)
    wait_cast(step,slot,'FWN03',503)
    step()
    assert slot.cast is None
    return dict(hiddenTicks=36, telegraphAfterEmergeTicks=24, participants=4, maxHp=boss.maxhp,
                damageAtEachWindow=[9,9,38], noExtraFisherCycle=True, localBurst=True, naturalRecoveryTicks=144)


def deadline_and_identity(lua, core):
    room, states, step = share(core, CASE)
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    host, guest = states[:2]
    cast = start_fishers(slot,states,step)
    first,second = cast.summons.values()
    assert attack(lua,core,host,first,atk=100000) == first.maxhp
    step()
    assert cast.defeatedFishers == 1
    place(host,first.x)
    mark = host.seq
    wait_cast(step,slot,'FWN03',168)
    assert not hits(host,first,mark)
    wait_cast(step,slot,'FWN03',299)
    assert attack(lua,core,guest,second,atk=100000) == second.maxhp
    step()
    assert cast.broken == 300 and cast.defeatedFishers == 2 and boss.form == 'down'
    wait_cast(step,slot,'FWN03',479)
    assert boss.form == 'down'
    step()
    assert boss.form == 'standing'
    wait_cast(step,slot,'FWN03',503)
    step()
    assert boss.form == 'idle' and slot.cast is None

    new = start_fishers(slot,states,step)
    a,b = new.summons.values()
    assert {first.id,second.id}.isdisjoint({a.id,b.id})
    assert not core.defeatEnemy(host,first,1)
    assert core.defeatEnemy(host,a,None)
    assert attack(lua,core,guest,b,atk=100000) == b.maxhp
    step()
    assert new.defeatedFishers == 1 and new.broken is None
    wait_cast(step,slot,'FWN03',324)
    assert new.broken is None and all(s.kills==0 for s in states)
    room, states, step = share(core, CASE)
    slot, boss, host = room.fieldSlot, room.fieldSlot.enemy, states[0]
    end = start_fishers(slot,states,step)
    for unit in end.summons.values():
        assert attack(lua,core,host,unit,atk=100000) == unit.maxhp
    assert attack(lua,core,host,boss,atk=10**8) > 0
    assert boss.hp == 0 and end.broken is None and slot.cast is None and len(room.enemies) == 1
    return dict(lastAcceptedInputTick=299, interruptedOnTick=300, downTicks=180, standTicks=24,
                uniqueAcrossCasts=True, unattributedDeathIgnored=True, bossDeathWinsSameTick=True)


if __name__ == '__main__':
    lua,core = runtime(draft_field_moves=True)
    result = dict(earned=earned(lua,core,runtime(draft_balance=True)),
                  timings=timings(lua,core), deadline=deadline_and_identity(lua,core))
    (ROOT/'evidence/draft-nightmare-moves-lua.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    for key in ('previous','alternateNormal','alternateInterrupted'):
        print(key,result['earned'][key]['elapsedSeconds'],flush=True)
    print('Two fishers, last-tick interruption, local blast, re-entry and shared hits passed.')
