"""Test the pressure door and thermal vent quests from first entry through unlocked gates."""

from runtime import ROOT
from test_sumeru_borders import core, edges, lua, map_to, new, read, save, write, xp
from test_visit_quest_round_trips import reported_balances, travel

HUB = 'fontaine-hub'
CASES = {
    'fon-hidden-lab-access': 'deianeira-legend-lab',
    'fon-beryl-thermal-vents': 'iron-viscount-legend-pool',
}


def play(quest, arena):
    id, level = quest['id'], quest['level']
    walk = new(HUB, HUB, level - 1)
    state = walk.state
    core.action(state, 'story_accept:' + id)
    assert not state.story.quests[id]
    core.grantExp(state, xp(level) - state.progression.total, 'quest')
    core.action(state, 'story_accept:' + id)
    assert state.story.quests[id].status == 'active'

    first = quest['itinerary'][0]
    anchor = first.get('from', first['node'])
    travel(walk, anchor)
    browser_ready = core.restore(lua.table_from(save(state), recursive=True), 12)
    core.grantExp(browser_ready, xp(100) - browser_ready.progression.total, 'quest')
    write(f'work/{id}-ready.json', save(browser_ready))

    restored_at = 2
    for index, step in enumerate(quest['itinerary'], 1):
        current = walk.state
        origin = step.get('from', step['node'])
        if current.story.node != origin:
            travel(walk, origin)
        if step['kind'] == 'arrive':
            walk.cross(step['node'])
        else:
            walk.approach(step['x'], step['y'], id)
            core.action(current, 'story_collect')
        assert current.story.quests[id].count == index, (id, step, current.storyNotice)
        if index == restored_at:
            walk.state = core.restore(lua.table_from(save(current), recursive=True), 12)
            assert walk.state.story.node == HUB and walk.state.story.quests[id].count == index

    state = walk.state
    core.grantExp(state, xp(100) - state.progression.total, 'quest')
    route = map_to(state, arena)
    assert route['status'] == 'blocked' and '報告' in route['reason'], (id, route)
    core.action(state, 'story_fast:' + HUB)
    assert state.story.node == HUB
    before = reported_balances(state)
    core.action(state, 'story_report:' + id)
    core.action(state, 'story_report:' + id)
    assert state.story.quests[id].status == 'complete'
    assert reported_balances(state) == (before[0] + quest['xp'], before[1] + quest['mora'])
    walk.state = core.restore(lua.table_from(save(state), recursive=True), 12)
    assert walk.state.story.quests[id].status == 'complete'
    outbound = travel(walk, arena)
    entrance = outbound[-2]
    assert (arena, entrance) in edges
    walk.cross(entrance)
    return dict(steps=quest['goal'], restoredMidSurveyCount=restored_at, unlockedArena=arena,
                arenaRoundTrip=True, payoutXp=quest['xp'], payoutMora=quest['mora'])


if __name__ == '__main__':
    (ROOT / 'work').mkdir(exist_ok=True)
    quests = {q['id']: q for q in read('content/story-graph.json')['quests']}
    results = {id: play(quests[id], arena) for id, arena in CASES.items()}
    write('evidence/fontaine-access-surveys-lua.json', dict(cases=results))
    print('Both Fontaine access quests passed underwater gates, report, reload and arena entry.')
