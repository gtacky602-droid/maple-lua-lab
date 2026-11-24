"""Exercise ordinary hunt progress, save restoration and repeat contracts."""

from experience import resolve_story_exp
from savegame import validate_save
from test_sumeru_borders import core, lua, new, nodes, read, save, write
from test_visit_quest_round_trips import reported_balances, travel


def defeat_until(walk, quest_id, count):
    state = walk.state
    for _ in range(3600):
        if state.story.quests[quest_id].count >= count:
            return
        enemy = next((e for e in state.enemies.values() if e.hp > 0 and not e.boss and not e.noRewards), None)
        if enemy:
            assert core.defeatEnemy(state, enemy, walk.actor.id)
        else:
            core.step(state, 1/60, walk.idle)
    raise AssertionError((quest_id, state.story.node, state.story.quests[quest_id].count, count))


def play(quest):
    id, hub, target = (quest[key] for key in ('id', 'hub', 'target'))
    level = max(nodes[hub]['level'], nodes[target]['level'], quest.get('level', 1))
    walk = new(hub, hub, level)
    rounds = 2 if quest.get('repeatable') else 1
    goal = quest['goal']
    restored_count = None

    for index in range(rounds):
        state = walk.state
        core.action(state, 'story_accept:' + id)
        assert state.story.quests[id].status == 'active' and state.story.quests[id].count == 0
        travel(walk, target)
        if index == 0:
            defeat_until(walk, id, goal // 2)
            snapshot = save(state)
            resumed = core.restore(lua.table_from(snapshot, recursive=True), 12)
            assert resumed.story.quests[id].status == 'active'
            restored_count = resumed.story.quests[id].count
            assert restored_count == goal // 2
            walk.state = resumed
            for actor in resumed.actors.values():
                actor.inv = 1000
            travel(walk, target)
        defeat_until(walk, id, goal)
        travel(walk, hub)
        state = walk.state
        xp, mora = reported_balances(state)
        for _ in range(2):
            core.action(state, 'story_report:' + id)
        assert reported_balances(state) == (xp + quest['xp'], mora + quest['mora'])
        assert state.story.quests[id].status == 'complete' and state.story.quests[id].cycles == index + 1
        walk.state = core.restore(lua.table_from(save(state), recursive=True), 12)
        assert walk.state.story.quests[id].cycles == index + 1

    return dict(goal=goal, level=level, reportHub=hub, target=target,
                restoredMidHuntCount=restored_count, savedCompletedCycles=rounds,
                xpPerReport=quest['xp'], moraPerReport=quest['mora'])

def resume_legacy(quest):
    id, hub, target = (quest[key] for key in ('id', 'hub', 'target'))
    level = max(nodes[hub]['level'], nodes[target]['level'], quest.get('level', 1))
    walk = new(hub, hub, level)
    core.action(walk.state, 'story_accept:' + id)
    assert not walk.state.story.quests[id]
    checkpoint = save(walk.state)
    checkpoint['story']['visited'][target] = True
    checkpoint['story']['quests'][id] = dict(status='active', count=quest['goal'] - 1, cycles=0)
    state = core.restore(lua.table_from(validate_save(checkpoint), recursive=True), 12)
    walk.state = state
    travel(walk, target)
    defeat_until(walk, id, quest['goal'])
    travel(walk, hub)
    xp, mora = reported_balances(state)
    core.action(state, 'story_report:' + id)
    core.action(state, 'story_report:' + id)
    assert reported_balances(state) == (xp + quest['xp'], mora + quest['mora'])
    loaded = core.restore(lua.table_from(save(state), recursive=True), 12)
    assert loaded.story.quests[id].status == 'complete'
    core.action(loaded, 'story_select_joined:' + id)
    assert loaded.companion == quest['join']
    return dict(savedBeforeFinalKill=True, reportedAfterReload=True, companion=loaded.companion)


if __name__ == '__main__':
    quests = resolve_story_exp(read('content/story-graph.json'))['quests']
    cases = {q['id']: play(q) for q in quests
             if q['kind'] == 'kill' and not q.get('legacyOnly') and not q.get('designId')}
    legacy = {q['id']: resume_legacy(q) for q in quests if q.get('legacyOnly')}
    write('evidence/hunt-quest-round-trips-lua.json', dict(
        cases=cases, count=len(cases), legacyCases=legacy,
        scope='Prepared levels and hubs. Physical gate routes and ordinary defeat settlement, not a combat difficulty test.',
    ))
    print(f'{len(cases)} hunt quests and {len(legacy)} legacy companion records passed.')
