"""Exercise entry, rewards, cooldown, repeat and save for the reviewed normal roster."""

from experience import LEVELS, RUNTIME_EXP, resolve_story_exp
from runtime import native
from test_sumeru_borders import core, edges, exits, lua, new, nodes, read, save, write, xp
from tools.waypoint_test import TrailWalk

encounters = read('content/encounters.json')['encounters']
fields = {spec['id']: spec for spec in read('content/field-boss-spawns.json')['fieldBosses']}
normal = {row['id']: fields[row['id']] for row in encounters if row['kind'] == 'normal'}
review = read('content/encounter-roster-review.json')
official_ids = {id for family in review['normal'] for id in family['rows']}
assert official_ids == {id for id, spec in normal.items() if not spec.get('original')}
scenarios = read('evidence/boss-roster-lua-audit.json')['scenarios']
commissions = {q['target']: q for q in resolve_story_exp(read('content/story-graph.json'))['quests']
               if q['kind'] == 'boss'}
origins = {id: [origin for origin, target in edges if target == spec['node']]
           for id, spec in normal.items()}
idle = lua.table()


def settle(state, boss):
    before = state.kills, state.mora, state.progression.killXp
    targets = list(boss.fieldMembers.values()) if boss.fieldMembers else [boss]
    for index, target in enumerate(targets, 1):
        assert core.defeatEnemy(state, target, 1)
        if index < len(targets):
            assert state.kills == before[0]
    after = state.kills, state.mora, state.progression.killXp
    assert not core.defeatEnemy(state, boss, 1)
    assert after == (state.kills, state.mora, state.progression.killXp)
    return tuple(end - start for start, end in zip(before, after))


def check_field(id, spec):
    arena = spec['node']
    gate_level = nodes[arena]['level']
    hub = nodes[arena]['checkpoint']
    origin = origins[id][0]
    gate = edges[origin, arena]
    walk = new(hub, origin, gate_level - 1)
    state = walk.state
    walk.approach(gate['x'], gate.get('y', 480), arena)
    portal = core.frame(state).storyNearbyPortal
    assert portal and portal.to == arena and not portal.available and str(gate_level) in portal.reason, (
        id, origin, arena, native(portal),
    )
    core.action(state, 'story_nearby_portal')
    assert state.story.node == origin
    core.grantExp(state, xp(gate_level) - state.progression.total, 'quest')
    commission = commissions.get(spec.get('storyChallenge'))
    if commission:
        core.enterStoryNode(state, commission['hub'])
        core.action(state, 'story_accept:' + commission['id'])
        assert state.story.quests[commission['id']].status == 'active'
        core.enterStoryNode(state, origin)
    walk.cross(arena)
    core.step(state, 1/60, idle)
    slot = state.fieldSlots[id]
    assert slot.enemy.hp == spec['hp']
    assert state.progression.level == spec['level']
    first = settle(state, slot.enemy)
    base_xp = LEVELS[spec['level']-1]['normal_enemy_base_exp']
    expected_xp = int(base_xp * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert first == (1, spec['mora'], expected_xp), (id, first)
    assert slot.phase == 'respawn' and state.endgame.bosses[id].clears == 1
    assert state.endgame.bosses[id].bestTicks >= 1
    snapshot = save(state)
    walk.cross(origin)

    assert snapshot['fieldBosses'][id]['waitTicks'] > 0
    replay = core.restore(lua.table_from(snapshot, recursive=True), 12)
    assert replay.story.node == hub and replay.endgame.bosses[id].clears == 1, (id, hub, replay.story.node)
    if commission:
        key = commission['id']
        assert replay.story.quests[key].count == commission['goal']
        core.enterStoryNode(replay, commission['hub'])
        before_report = replay.progression.questXp, replay.mora
        core.action(replay, 'story_report:' + key)
        core.action(replay, 'story_report:' + key)
        assert replay.story.quests[key].status == 'complete'
        assert (replay.progression.questXp, replay.mora) == (
            before_report[0] + commission['xp'], before_report[1] + commission['mora'],
        )
        paid = replay.progression.questXp, replay.mora, replay.inventory.upgradeOre
        replay = core.restore(lua.table_from(save(replay), recursive=True), 12)
        assert replay.story.quests[key].status == 'complete' and replay.story.quests[key].count == commission['goal']
        assert (replay.progression.questXp, replay.mora, replay.inventory.upgradeOre) == paid
        if replay.story.node != commission['hub']:
            core.enterStoryNode(replay, commission['hub'])
        core.action(replay, 'story_report:' + key)
        assert (replay.progression.questXp, replay.mora, replay.inventory.upgradeOre) == paid

    core.enterStoryNode(replay, origin)
    retry = TrailWalk(lua, core, replay, edges, exits)
    retry.cross(arena)
    current = replay.fieldSlots[id]
    assert current.enemy.hp == 0 and current.generation == 1
    assert not core.defeatEnemy(replay, current.enemy, 1)
    replay.t = current.waitUntil - 1/60
    core.step(replay, 1/60, idle)
    assert current.generation == 2 and current.enemy.hp == spec['hp']
    core.step(replay, 1/60, idle)
    repeat = settle(replay, current.enemy)
    assert repeat[:2] == (1, spec['mora']) and repeat[2] > 0
    final = save(replay)
    assert final['endgame']['bosses'][id]['clears'] == 2
    return dict(
        arena=arena, approach=origin, gateLevel=gate_level, restoredAt=hub,
        firstKillXp=first[2], firstKillMora=first[1], redoKillXp=repeat[2],
        commission=commission and commission['id'], commissionRestored=bool(commission), cooldownResumed=True,
        encounterScenario=scenarios[id]['script'],
    )


if __name__ == '__main__':
    proof = {}
    for id in sorted(official_ids):
        proof[id] = check_field(id, normal[id])
    write('evidence/normal-boss-lifecycle-lua.json', dict(
        rosterVersion=review['game_version'], cases=proof, tested=len(proof),
        scope='Input-driven gate entry and return from fixture waypoints. Terminal defeat is supplied to the normal Lua settlement; separate encounter scripts exercise move behavior.',
    ))
    print(f'{len(proof)} normal encounters: gates, one reward per clear, commissions, restart and retries passed.')
