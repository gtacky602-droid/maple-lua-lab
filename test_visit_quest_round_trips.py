"""Play each visit quest through its map route, one payout and two reloads."""

from experience import resolve_story_exp
from test_sumeru_borders import core, lua, map_to, new, nodes, read, save, write


def travel(walk, destination):
    route = map_to(walk.state, destination)
    assert route['status'] == 'ready', (walk.state.story.node, destination, route)
    stages = [stop['id'] for stop in route['stops']]
    for stage in stages:
        walk.cross(stage)
    return stages


def reported_balances(state):
    return state.progression.questXp, state.mora


def play(quest):
    id, hub, target = (quest[key] for key in ('id', 'hub', 'target'))
    level = max(nodes[hub]['level'], nodes[target]['level'], quest.get('level', 1))
    walk = new(hub, hub, level)
    state = walk.state
    discovered = nodes[hub].get('hiddenGroup')
    if discovered:
        state.story.discovered[discovered] = True
    initial = reported_balances(state)
    core.action(state, 'story_accept:' + id)
    core.action(state, 'story_report:' + id)
    assert state.story.quests[id].status == 'active' and state.story.quests[id].count == 0
    assert reported_balances(state) == initial

    outbound = travel(walk, target)
    away = reported_balances(state)
    core.action(state, 'story_report:' + id)
    assert state.story.quests[id].status == 'active' and state.story.quests[id].count == quest['goal']
    assert reported_balances(state) == away
    inbound = travel(walk, hub)
    resumed = core.restore(lua.table_from(save(state), recursive=True), 12)
    assert resumed.story.node == hub and resumed.story.visited[target]
    assert resumed.story.quests[id].status == 'active' and resumed.story.quests[id].count == quest['goal']

    xp_before, mora_before = reported_balances(resumed)
    for _ in range(2):
        core.action(resumed, 'story_report:' + id)
    amounts = xp_before + quest['xp'], mora_before + quest['mora']
    assert reported_balances(resumed) == amounts
    final = core.restore(lua.table_from(save(resumed), recursive=True), 12)
    assert final.story.quests[id].status == 'complete' and final.story.quests[id].cycles == 1
    assert reported_balances(final) == amounts
    return dict(level=level, outbound=outbound, inbound=inbound, reportHub=hub,
                priorDiscovery=discovered, xp=quest['xp'], mora=quest['mora'],
                savedReadyToReport=True, savedAfterReport=True)


if __name__ == '__main__':
    quests = resolve_story_exp(read('content/story-graph.json'))['quests']
    cases = {quest['id']: play(quest) for quest in quests if quest['kind'] == 'visit'}
    write('evidence/visit-quest-round-trips-lua.json', dict(
        cases=cases, count=len(cases),
        scope='Level and starting hub are fixtures. The three hidden-area tests start after discovery.',
    ))
    print(f'{len(cases)} visit quests passed real gates, payout and both reloads.')
