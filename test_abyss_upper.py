"""Play the three upper chambers from earned checkpoints using normal actions."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


WORK = ROOT / 'work'
MODE = 'abyss_start:upper:troupe'
LOADOUT = [['SK01', 'SK07'], ['SK33'], ['SK18'], ['SK42']] + [[] for _ in range(4)]


def in_town(lua, core, checkpoint):
    state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
    core.action(state, 'story_fast:mond-town')
    assert state.story.node == 'mond-town'
    if state.active != 1:
        core.action(state, 'swap')
    if state.auto:
        core.action(state, 'auto')
    return state


def read_save(path):
    return validate_save(json.loads(path.read_bytes()))


def recover_save(core, state):
    return validate_save(native(core.checkpoint(state)))


def check_clears(lua, core, path, *, fit_traveler=False, browser_input=None):
    checkpoint = read_save(path)
    state = in_town(lua, core, checkpoint)
    traveler = state.actors[1]
    opening_gear = dict(attack=traveler.atk, hp=traveler.maxhp)
    fitted = []
    if fit_traveler:
        for slot in range(1, 6):
            gear = [item for item in state.inventory['items'].values() if item.slot == slot and item.owner in (0, 1)]
            best = max(gear, key=core.artifactStats)
            if best.owner == 0:
                core.action(state, 'artifact_equip:' + str(best.id))
                assert best.owner == 1
                fitted.append(best.id)
        assert traveler.atk > opening_gear['attack']
    gear_at_entry = dict(attack=traveler.atk, hp=traveler.maxhp, fittedBagItems=fitted)
    assert core.configure(state, lua.table_from(LOADOUT, recursive=True))[0]
    if browser_input:
        browser_input.write_text(
            json.dumps(recover_save(core, state), ensure_ascii=False)+'\n', encoding='utf-8')
    assert core.frame(state, 'sprite', 'legacy').endgameDesk.abyss.upper.available
    opening_mora, opening_item, opening_xp = state.mora, state.inventory.nextId, state.progression.total
    core.action(state, MODE)
    walk = TrailWalk(lua, core, state, {}, {})
    advance = lua.eval('function(C,s,n,i) for _=1,n do C.step(s,1/60,i) end end')
    attack = lua.table_from({'attack': True})
    room_counts, splits, patrols = [], [], []
    for room in range(1, 4):
        run = state.endgameRun
        assert run.room == room and run.status == 'fighting'
        room_counts.append(len(state.enemies))
        assert state.macro is None and state.healingField is None
        assert walk.actor.y == 480 and not walk.actor.channel
        if room == 3:
            patrols = [enemy for enemy in state.enemies.values() if enemy.armored]
            assert len(patrols) == 2
            assert core.enemyResistance(lua.table(), patrols[0], 'physical') == .65
            assert core.enemyResistance(lua.table(), patrols[0], 'pyro') == 0

        for _ in range(170):
            if run.status != 'fighting':
                break
            actor = walk.actor
            enemies = [enemy for enemy in state.enemies.values() if enemy.hp > 0]
            target = min(enemies, key=lambda e: abs(e.x-actor.x) + abs(e.y-actor.y)*2)
            platform = next(p for p in state.platforms.values()
                            if p.y == target.y and p.x <= target.home <= p.x+p.w)
            direction = 1 if target.x >= actor.x else -1
            approach_x = max(platform.x+16, min(platform.x+platform.w-16, target.x-direction*47))
            try:
                walk.approach(approach_x, target.y, '螺旋の敵')
            except AssertionError:
                # The companion can clear the room while the traveler is walking.
                if run.status not in ('between', 'clear'):
                    raise
                break
            if run.status != 'fighting':
                break
            advance(core, state, 1, walk.inputs['right' if target.x >= actor.x else 'left'])
            if not state.macro:
                if actor.hp < actor.maxhp*.70 and (actor.cd.SK18 or 0) <= 0:
                    slot = 'slot3'
                elif (actor.cd.SK33 or 0) <= 0:
                    slot = 'slot2'
                elif (actor.cd.SK42 or 0) <= 0:
                    slot = 'slot4'
                else:
                    slot = 'slot1'
                core.action(state, slot)
            advance(core, state, 67, attack)
        assert run.status == ('clear' if room == 3 else 'between'), (room, run.status)
        splits.append(round(state.t-run.start, 3))
        if room < 3:
            assert state.mora == opening_mora and state.inventory.nextId == opening_item
            core.action(state, 'endgame_next')

    assert all(enemy.hp == 0 for enemy in patrols)
    assert state.progression.total == opening_xp
    loot = list(state.inventory['items'].values()) + [drop.item for drop in state.inventory.ground.values()]
    reward = next(item for item in loot if item.id == opening_item)
    assert (reward.setId, reward.rarity, reward.itemLv) == ('troupe', 5, 184)
    assert state.mora - opening_mora == 300000 and state.inventory.nextId == opening_item+1
    record = native(state.endgame.abyss.upper)
    assert record['clears'] == 1 and record['bestStars'] == run.stars
    core.action(state, 'endgame_next')
    advance(core, state, 90, walk.idle)
    assert native(state.endgame.abyss.upper) == record and state.inventory.nextId == opening_item+1

    core.action(state, 'endgame_exit')
    assert state.endgameRun is None and state.story.node == 'mond-town'
    after = recover_save(core, state)
    restored = in_town(lua, core, after)
    assert recover_save(core, restored)['endgame'] == after['endgame']
    assert core.frame(restored, 'sprite', 'legacy').endgameDesk.abyss.upper.available
    return after, dict(level=checkpoint['progression']['level'], sourceSha256=sha256(path.read_bytes()).hexdigest(),
                       roomTargets=room_counts, splitSeconds=splits, stars=run.stars,
                       gearBefore=opening_gear, gearAtEntry=gear_at_entry,
                       companion=state.companion, reward={'mora':300000, 'set':'troupe', 'rank':5, 'itemLevel':184},
                       armoredElitesDefeated=len(patrols), saved=True)


def main(campaign, output):
    lua, core = runtime()
    locked = campaign/'nod-fresh-route/snezhnaya-save.json'
    early_save = campaign/'snez-fresh-route/white-pass-save.json'
    cap_save = campaign/'cap-fresh-route/lv200-save.json'
    output.mkdir(parents=True, exist_ok=True)
    low = in_town(lua, core, read_save(locked))
    assert not core.frame(low, 'sprite', 'legacy').endgameDesk.abyss.upper.available
    core.action(low, MODE)
    assert low.endgameRun is None and 'Lv160' in low.storyNotice

    high = in_town(lua, core, read_save(cap_save))
    core.action(high, MODE)
    advance = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')
    mora, item, history = high.mora, high.inventory.nextId, native(high.endgame)
    advance(core, high, 10803)
    assert high.endgameRun.status == 'failed' and high.t-high.endgameRun.start >= 180
    assert native(high.endgame) == history and (high.mora, high.inventory.nextId) == (mora, item)
    failure_elapsed = round(high.t-high.endgameRun.start, 3)
    core.action(high, 'endgame_exit')
    core.action(high, MODE)
    assert high.endgameRun.room == 1 and high.endgameRun.status == 'fighting'

    coop_state = in_town(lua, core, read_save(cap_save))
    room = core.newCoop(coop_state)
    core.attachCoop(room, coop_state)
    desk = core.frame(coop_state, 'sprite', 'legacy').endgameDesk.abyss
    assert desk.upper.soloBlock and not desk.upper.available
    assert desk.entry.available and desk.elite.available
    core.action(coop_state, MODE)
    assert coop_state.endgameRun is None and 'ソロ' in coop_state.storyNotice

    _, early = check_clears(lua, core, early_save, fit_traveler=True)
    saved, cap = check_clears(lua, core, cap_save, browser_input=output/'upper-browser-save.json')
    (output/'locked-browser-save.json').write_bytes(locked.read_bytes())
    draft_lua, draft_core = runtime(draft_balance=True)
    comparison = in_town(draft_lua, draft_core, saved)
    assert recover_save(draft_core, comparison)['endgame'] == saved['endgame']
    assert draft_core.frame(comparison, 'sprite', 'legacy').endgameDesk.abyss.upper.available
    draft_core.action(comparison, 'abyss_start:elite:gladiator')
    assert comparison.endgameRun.room == 1 and comparison.endgameRun.spec.name == '精鋭'

    proof = dict(profile='standard', lockedLevel=low.progression.level, timeoutSeconds=failure_elapsed,
                 noFailureReward=True, retryStartsFirstRoom=True, soloGateChecked=True, clears=[early, cap],
                 recordSurvivesComparisonImport=True)
    (output/'abyss-upper-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f"Upper abyss: Lv160 {early['splitSeconds'][-1]}s, Lv200 {cap['splitSeconds'][-1]}s. "
          "Gate, timeout, retry, reward and cross-profile save passed.")


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--campaign-dir', type=Path, default=WORK)
    parser.add_argument('--output-dir', type=Path, default=WORK/'abyss-upper-standard')
    args = parser.parse_args()
    main(args.campaign_dir, args.output_dir)
