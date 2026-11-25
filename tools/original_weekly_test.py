"""Play the repeat route for a fixed-difficulty original weekly encounter."""

import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def check_original_weekly_replay(lua, core, state, spec, quest, report_reward, fight):
    boss_id, arena = spec['id'], spec['node']
    graph = json.loads((ROOT / 'content/story-graph.json').read_text(encoding='utf8'))
    nodes = {node['id']: node for node in graph['nodes']}
    harbor = nodes[arena]['checkpoint']
    exits = {node: nodes[node]['exits'] for node in (arena, harbor)}
    edges = {(node, edge['to']): edge for node, rows in exits.items() for edge in rows}

    def snapshot(session):
        return validate_save(native(core.checkpoint(session)))

    walk = TrailWalk(lua, core, state, edges, exits)
    assert state.endgame.bosses[boss_id].clears == 1 and state.story.quests[quest].count == 1
    walk.cross(harbor)
    before_report = state.progression.questXp, state.mora
    for _ in range(2):
        core.action(state, 'story_report:' + quest)
    assert state.story.quests[quest].status == 'complete'
    assert (state.progression.questXp - before_report[0], state.mora - before_report[1]) == report_reward
    saved = snapshot(state)
    wait_ticks = saved['weeklyBosses'][boss_id]['waitTicks']
    assert 0 < wait_ticks < spec['respawnTicks']
    (ROOT / 'work' / f'{boss_id}-replay-fixture.json').write_text(
        json.dumps(saved, ensure_ascii=False), encoding='utf8',
    )
    walk.state = core.restore(lua.table_from(saved, recursive=True), 12)
    state = walk.state
    assert state.story.node == harbor and state.story.quests[quest].status == 'complete'

    entry = edges[harbor, arena]
    walk.approach(entry['x'], entry.get('y', 480), arena)
    frame = core.frame(state)
    portal = frame.storyNearbyPortal
    assert frame.weeklyDesk is None and portal.to == arena and portal.available
    remaining = portal.weeklyRespawnSeconds
    assert 0 < remaining < wait_ticks / 60
    run_ticks = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
    core.action(state, 'pause')
    run_ticks(core, state, 60, walk.idle)
    assert core.frame(state).storyNearbyPortal.weeklyRespawnSeconds == remaining
    core.action(state, 'pause')

    slot = state.weeklySlots[boss_id]
    assert slot.generation == 1 and slot.primary.hp == 0
    run_ticks(core, state, round(remaining * 60), walk.idle)
    assert core.frame(state).storyNearbyPortal.weeklyRespawnSeconds is None
    walk.cross(arena)
    assert slot.generation == 2 and slot.primary.hp == spec['hp'] and slot.mode is None

    before = state.kills, state.progression.killXp, state.progression.questXp, state.mora
    battle = fight(state, slot)
    after = state.kills, state.progression.killXp, state.progression.questXp, state.mora
    earned = tuple(end - start for start, end in zip(before, after))
    base_xp = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    expected_xp = int(base_xp * RUNTIME_EXP['roles'][spec['expRole']] + .5)
    assert earned == (1, expected_xp, 0, spec['mora']), (boss_id, earned)
    assert state.endgame.bosses[boss_id].clears == 2 and state.endgame.weekly is None
    walk.cross(harbor)
    core.action(state, 'story_report:' + quest)
    assert (state.kills, state.progression.killXp, state.progression.questXp, state.mora) == after
    loaded = core.restore(lua.table_from(snapshot(state), recursive=True), 12)
    assert loaded.weeklySlots[boss_id].generation == 2 and loaded.weeklySlots[boss_id].phase == 'respawn'
    assert loaded.story.quests[quest].status == 'complete' and loaded.endgame.bosses[boss_id].clears == 2
    return dict(arena=arena, fixedLevel=spec['level'], savedCooldownTicks=wait_ticks,
                portalCooldownPauses=True, reportXp=report_reward[0], reportMora=report_reward[1],
                replayKillXp=earned[1], replayKillMora=earned[3],
                restoredClears=loaded.endgame.bosses[boss_id].clears, battle=battle)
