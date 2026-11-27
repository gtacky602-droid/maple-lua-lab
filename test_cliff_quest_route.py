"""Play the cliff alternative, then gather and survey on the same earned save."""

import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey
from test_earned_worksites import CLIFF, HUB, MEAL, POST, RIVER, STONE, play_marks_and_meal
from test_quest_daily_fields import buffer_clear


CARAVAN = 'liyue-caravan-search'
WORK = ROOT/'work/cliff-quest-routes'
WORK.mkdir(parents=True, exist_ok=True)


def save(trip, name):
    snapshot=trip.snapshot()
    (WORK/f'{name}.json').write_text(json.dumps(snapshot,ensure_ascii=False)+'\n','utf8')


def active_guide(trip, quest, point):
    guide=trip.frame().storyHunts[quest]
    assert guide.point==point, (quest,guide.point)
    return guide


def route():
    trip=Journey(ROOT/'work/quest-daily-fields/liyue-after-commission.json',engine=runtime())
    assert trip.state.story.node==HUB and trip.state.story.quests[CARAVAN] is None
    assert trip.state.story.quests[MEAL] is None and trip.state.story.quests[STONE] is None
    locked=trip.guide(CLIFF)
    assert locked['status']=='blocked'
    assert '山道に消えた商隊' in locked['reason'] and '山のごちそう、港の一皿' in locked['reason']
    save(trip,'cliff-before')

    for quest in (CARAVAN,MEAL):
        trip.act('story_accept:'+quest)
    assert trip.travel(CLIFF)[0]['from']==HUB
    assert len(trip.state.enemies)==4
    points=[(560,305),(720,305),(905,305)]
    buffer_clear(trip,points+[(a.x,a.y) for a in trip.state.actors.values()])
    active_guide(trip,CARAVAN,'rest-tag')
    active_guide(trip,MEAL,'herb')
    save(trip,'cliff-active')
    trip.approach(520,395,'低い足場')
    trip.approach(520,305,'二段目')
    trip.approach(720,305,'荷札')
    trip.act('story_collect')
    assert trip.state.story.quests[CARAVAN].inspected['rest-tag']
    assert trip.state.story.quests[CARAVAN].count==1 and trip.state.story.quests[MEAL].count==0
    trip.restore()
    assert trip.state.story.quests[CARAVAN].inspected['rest-tag']
    assert trip.state.story.quests[CARAVAN].count==1
    trip.travel(CLIFF)
    trip.approach(1410,390,'詰所側の低い足場')
    trip.approach(1410,305,'詰所側の二段目')
    trip.cross(POST)
    trip.approach(385,480,'商隊')
    trip.act('story_collect')
    guard=next(e for e in trip.state.enemies.values() if e.spawnId=='liyue-quarry-post-1')
    trip.fight([guard],trip.totals(),allow_collateral=True)
    assert trip.state.story.quests[CARAVAN].count==3
    legs=trip.travel(HUB)
    assert legs[0]['mode']=='lift' and legs[0]['from']==POST
    trip.report(CARAVAN)

    def photograph(shared):
        assert shared.state.story.node==CLIFF
        active_guide(shared,MEAL,'herb')
        active_guide(shared,STONE,'tool-mark')
        buffer_clear(shared,points)
        save(shared,'cliff-surveys')

    play_marks_and_meal(trip,on_cliff=photograph)
    assert [r['quest'] for r in trip.reports]==[CARAVAN,MEAL,STONE]
    assert trip.state.returns==0 and all(trip.state.story.quests[q].status=='complete' for q in (CARAVAN,MEAL,STONE))
    save(trip,'cliff-after')
    trip.cross(RIVER)
    trip.cross(CLIFF)
    assert (trip.actor.x,trip.actor.y)==(340,395)
    buffer_clear(trip,[(a.x,a.y) for a in trip.state.actors.values()])
    trip.cross(RIVER)
    assert (trip.actor.x,trip.actor.y)==(1120,480)
    return trip.proof() | dict(lockedBefore=locked['reason'],points=points,
                               cliffLiftRoundTrip=True,walked=sorted(trip.crossings))


if __name__=='__main__':
    (WORK/'cliff-earned-route.json').write_text(
        json.dumps(route(),ensure_ascii=False,indent=2)+'\n','utf8')
    print('Earned cliff alternative, three reports, both lift directions and restores passed.')
