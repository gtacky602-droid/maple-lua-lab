"""Test the pressure door and thermal vent quests from first entry through unlocked gates."""

import sys

from runtime import ROOT, runtime
from test_earned_survey_itineraries import SurveyJourney
from test_sumeru_borders import core, edges, lua, map_to, new, read, save, write, xp
from test_visit_quest_round_trips import reported_balances, travel

HUB = 'fontaine-hub'
CASES = {
    'fon-hidden-lab-access': 'deianeira-legend-lab',
    'fon-beryl-thermal-vents': 'iron-viscount-legend-pool',
}
WORK = ROOT/'work/earned-fontaine-access'
SOURCE = ROOT/'work/earned-fontaine-waterworks/waterworks-complete.json'


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


def earned_gate(trip, arena, report_missing):
    guide = trip.guide(arena)
    leg = guide['stops'][-1]
    assert guide['status']=='blocked' and leg['id']==arena and leg['reason']=='必要Lv100'
    quest_reason = leg.get('questReason')
    if report_missing:
        assert '報告' in quest_reason
    else:
        assert quest_reason is None
    if trip.state.story.node!=leg['from']:
        trip.travel(leg['from'])
    trip.confirm_lock(arena,'必要レベル 100')
    assert trip.frame().storyNearbyPortal.questReason==quest_reason
    return dict(entrance=leg['from'], level=100, questReason=quest_reason)


def earned_play(trip, quest, arena):
    id = quest['id']
    trip.act('story_accept:'+id)
    depth_hints = []
    for index,step in enumerate(quest['itinerary'],1):
        origin = step.get('from',step['node'])
        if trip.state.story.node!=origin:
            trip.travel(origin)
        if step['kind']=='arrive':
            trip.cross(step['node'])
        else:
            if trip.state.storySwimming:
                offset = -72 if step['y']>=360 else 78
                trip.approach(step['x'],step['y']+offset,id)
                hint = trip.frame().storySwimInstrument
                assert hint.objective==step['objective'] and hint.direction==('up' if offset>0 else 'down')
                trip.act('story_collect')
                assert trip.state.story.quests[id].count==index-1
                depth_hints.append(dict(instrument=step['waterInstrument'], direction=hint.direction))
            trip.mark(id,index)
        assert trip.state.story.quests[id].count==index
        if index==2:
            trip.restore()
            assert trip.state.story.node==HUB and trip.state.story.quests[id].count==2
    before = earned_gate(trip,arena,True)
    trip.warp(HUB)
    trip.report(id)
    payout = trip.reports[-1]
    assert payout==dict(quest=id,xp=quest['xp'],mora=quest['mora'])
    trip.restore()
    assert trip.state.story.quests[id].cycles==1
    after = earned_gate(trip,arena,False)
    trip.warp(HUB)
    return dict(steps=quest['goal'],restoredMidSurveyCount=2,payout=payout,
                gateBefore=before,gateAfter=after,depthHints=depth_hints)


def earned_run(quests):
    WORK.mkdir(parents=True,exist_ok=True)
    trip = SurveyJourney(SOURCE,runtime(),select_traveler=True)
    assert trip.state.story.node==HUB and trip.state.progression.level==94
    assert all(trip.state.story.quests[q].status=='complete'
               for q in ('fon-morte-sluice-survey','fon-erinnyes-root-water-survey'))
    results = {id: earned_play(trip,quests[id],arena) for id,arena in CASES.items()}
    assert trip.state.returns==0 and trip.state.progression.level==94
    write(WORK/'access-complete.json',trip.snapshot())
    write('evidence/earned-fontaine-access-surveys.json',dict(sourceSha256=trip.source,
          level=94,returns=trip.state.returns,cases=results))
    print('Earned Lv94 surveys restored. Both requirements reduce to Lv100 after report.')


if __name__ == '__main__':
    (ROOT / 'work').mkdir(exist_ok=True)
    quests = {q['id']: q for q in read('content/story-graph.json')['quests']}
    if '--earned' in sys.argv:
        earned_run(quests)
    else:
        results = {id: play(quests[id], arena) for id, arena in CASES.items()}
        write('evidence/fontaine-access-surveys-lua.json', dict(cases=results))
        print('Both Fontaine access quests passed underwater gates, report, reload and arena entry.')
