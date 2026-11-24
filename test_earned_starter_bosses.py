"""Walk the early boss gates, fight with earned progression, and report the four commissions."""

import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey


WORK = ROOT/'work'
MOND = 'mond-town'
SUMERU = 'sumeru-hub'
EARLY = WORK/'mondstadt-fresh-route'
ENCOUNTERS = (
    ('cryo', 'boss-26020101', 'cryo-field-grove', MOND, EARLY/'lv16-save.json'),
    ('anemo', 'boss-20040201', 'anemo-field-basin', MOND, EARLY/'lv16-save.json'),
    ('electro', 'boss-20040101', 'electro-field-shelf', MOND, EARLY/'lv18-save.json'),
    ('jadeplume', 'boss-26110101', 'sumeru-jadeplume-grove', SUMERU, WORK/'inazuma-fresh-route/sumeru-save.json'),
)


def save_for_browser(trip, filename):
    (WORK/filename).write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


def clear_encounter(engine, encounter):
    name, id, arena, hub, path = encounter
    quest = name+'-commission'
    trip = Journey(path, engine=engine)
    trip.warp(hub)
    source_level = trip.state.progression.level
    if name == 'jadeplume':
        # Use a feather and flower already earned before reaching Sumeru.
        trip.act('artifact_equip:2')
        trip.act('artifact_equip:10')
        assert trip.actor.atk > 4 and trip.actor.maxhp > 140
        save_for_browser(trip, 'earned-jadeplume-ready.json')
    trip.act('story_accept:'+quest)
    assert trip.state.story.quests[quest].status == 'active'
    path = [stop['id'] for stop in trip.travel(arena)]
    slot = trip.state.fieldSlots[id]
    boss = slot.enemy
    actor = trip.actor
    trip.approach(boss.x-75, 480, arena)
    initial_xp, initial_mora = trip.state.progression.killXp, trip.state.mora
    initial_hp, initial_atk = actor.hp, actor.atk
    start, returns = trip.state.t, trip.state.returns
    seen, recovery = set(), set()
    dodged_slam = False
    slam_hp = None
    counter_hit = False
    down = False
    directions = {delta: trip.lua.table(left=delta<0, right=delta>0, attack=True) for delta in (-1, 0, 1)}

    for _ in range(90*60):
        if boss.hp <= 0:
            break
        assert actor.hp > 0 and trip.state.returns == returns, (name, boss.hp)
        cast = slot.cast
        dx = boss.x-actor.x
        if cast:
            seen.add(cast.move.id)
            if cast.tick >= cast.move.recover and cast.move.id not in recovery:
                frame = trip.frame().fieldBoss
                assert frame.recovering and '反撃の隙' in frame.label
                recovery.add(cast.move.id)
        down = down or (name == 'cryo' and boss.down > 0)
        if name == 'cryo' and cast and cast.move.id == 'FC01' and not dodged_slam:
            if cast.tick == 54:
                slam_hp = actor.hp
                trip.tick(1, trip.inputs['left'])
                trip.act('dodge')
                continue
            if slam_hp is not None and cast.tick < cast.move.active[1][2]:
                trip.tick(1)
                continue
            if slam_hp is not None:
                assert actor.hp == slam_hp
                dodged_slam = True

        direction = 1 if dx > 86 else -1 if dx < 64 else 0
        if name == 'electro':
            # Move behind the locked attack, then keep the core in front.
            pivot, side = boss.x, -1 if dx>0 else 1
            if cast and cast.move.lock <= cast.tick < cast.move.recover:
                pivot, side = cast.origin, -cast.dir
            offset = pivot + side*57 - actor.x
            direction = (1 if offset>0 else -1) if abs(offset)>6 else 0
            if not direction and dx*actor.dir < 0:
                direction = 1 if dx>0 else -1
            if abs(dx)<130 and dx*actor.dir>0:
                trip.act('skill1')
                trip.act('skill2')
            if cast and cast.tick == cast.move.lock and abs(dx)<90 and dx*actor.dir>0:
                trip.act('dodge')
        hp_before = boss.hp
        recovering = cast and cast.tick >= cast.move.recover
        trip.tick(1, directions[direction])
        counter_hit = counter_hit or bool(recovering and boss.hp < hp_before)

    assert slot.phase == 'respawn' and trip.state.returns == returns, (name, boss.hp, actor.hp)
    assert len(seen) == 3 and recovery and counter_hit, (name, seen, recovery, counter_hit)
    if name == 'cryo':
        assert dodged_slam and down
    assert trip.state.story.quests[quest].count == 1
    elapsed = round(trip.state.t-start, 3)
    rewards = [trip.state.progression.killXp-initial_xp, trip.state.mora-initial_mora]
    result = dict(level=source_level, arena=arena, route=path, sourceSha256=trip.source,
                  attack=initial_atk, startHp=initial_hp, finishHp=actor.hp, seconds=elapsed,
                  moves=sorted(seen), recoveryLabels=sorted(recovery), counterHit=True, rewards=rewards)
    if name == 'cryo':
        result['slamEvadedWithoutDamage'] = dodged_slam
        result['nucleusBrokenByGroundAttacks'] = down
    trip.travel(hub)
    trip.report(quest)
    trip.restore()
    assert trip.state.endgame.bosses[id].clears == 1
    assert trip.state.story.quests[quest].status == 'complete'
    return dict(result, commission=trip.reports[0], restored=True)


if __name__ == '__main__':
    engine = runtime()
    evidence = {}
    for row in ENCOUNTERS:
        proof = clear_encounter(engine, row)
        evidence[row[0]] = proof
        print(row[0], proof['level'], proof['seconds'], proof['finishHp'], flush=True)
    (ROOT/'evidence/earned-starter-bosses-lua.json').write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
