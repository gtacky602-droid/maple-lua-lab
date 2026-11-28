"""Complete both Natlan trials from the earned flag-course checkpoint."""
import json

from runtime import ROOT, runtime
from test_earned_survey_itineraries import SurveyJourney, quests


SOURCE = ROOT / 'work/earned-natlan-flag/ledges-browser-complete.json'
WORK = ROOT / 'work/earned-natlan-two-trials'
ID, NEXT = 'natlan-two-trials', 'natlan-sunset-duel'
HUB, SUMMIT, MEET = 'natlan-hub', 'natlan-flag-summit', 'natlan-duel-entry'
STEPS, HIGH = 'natlan-high-trial-steps', 'natlan-high-trial-field'
RIVER, TURN = 'natlan-river-float-run', 'natlan-river-turn-basin'


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def wait(trip, ready, controls=None, limit=1400):
    for _ in range(limit):
        if ready():
            return
        trip.tick(1, controls)
    a = trip.actor
    raise AssertionError((trip.state.story.node, a.x, a.y, trip.state.storyNotice))


def jump(trip, x, y):
    trip.act('jump')
    for _ in range(110):
        a = trip.actor
        if a.ground and a.y == y and abs(a.x-x)<8:
            return
        trip.tick(1, trip.lua.table(left=a.x>x+3, right=a.x<x-3, jump=True))
    raise AssertionError((trip.state.story.node, x, y, trip.actor.x, trip.actor.y))


def inspect(trip, x, y, expected, branch=None):
    trip.approach(x,y,ID)
    trip.act('story_collect')
    quest = trip.state.story.quests[ID]
    progress = quest.pathProgress[branch] if branch else quest
    assert progress.count == expected, (branch, expected, progress.count, trip.state.storyNotice)


def restore_summit(trip):
    trip.restore()
    assert trip.state.story.node == SUMMIT
    assert trip.state.returns == 0
    if not trip.state.holdAllyFire:
        trip.act('hold_ally_fire')


def highland(trip):
    trip.cross(STEPS)
    inspect(trip,522,391,1,'high')
    assert trip.guide(HIGH)['status'] == 'blocked'
    inspect(trip,1044,302,2,'high')
    trip.cross(HIGH)
    enemies = list(trip.state.enemies.values())
    assert len(enemies) == 3
    trip.fight(enemies[:1],trip.totals())
    partial = trip.state.story.quests[ID].pathProgress.high
    assert sum(1 for _ in partial.sweep.values()) == 1
    restore_summit(trip)
    trip.cross(STEPS)
    trip.approach(1044,302,HIGH)
    trip.cross(HIGH)
    remaining = list(trip.state.enemies.values())
    assert len(remaining) == 2
    trip.fight(remaining,trip.totals())
    inspect(trip,1534,390,4,'high')
    trip.cross(SUMMIT)
    return {'enemies':3,'remainingAfterReload':2}


def waterside(trip):
    trip.cross(RIVER)
    inspect(trip,252,480,1,'water')
    raft = trip.state.riverDecks[1].platform
    trip.approach(388,480,RIVER)
    wait(trip,lambda:raft.x!=340)
    wait_board = trip.frame().storyRiverBoarding
    assert wait_board.phase == 'wait' and wait_board.side == 'left' and wait_board.seconds > 0
    wait(trip,lambda:raft.x==340)
    board = trip.frame().storyRiverBoarding
    assert board.phase == 'board' and 0 < board.seconds <= 2.2
    jump(trip,388,430)
    wait(trip,lambda:raft.x>420)
    riding = trip.frame().storyRiverBoarding
    assert riding.phase == 'riding' and riding.side == 'right'
    trip.act('pause')
    trip.tick(62)
    assert trip.frame().storyRiverBoarding.seconds == riding.seconds
    trip.act('pause')
    wait(trip,lambda:raft.x==914)
    landed = trip.frame().storyRiverBoarding
    assert landed.phase == 'landed' and landed.side == 'right'
    jump(trip,1117,480)
    foes = [e for e in trip.state.enemies.values() if e.hp>0]
    if foes:
        trip.fight(foes,trip.totals())
    assert trip.state.story.quests[ID].pathProgress.water.count == 2
    trip.cross(TURN)
    trip.approach(397,480,TURN)
    jump(trip,478,411)
    jump(trip,646,390)
    wait(trip,lambda:trip.actor.x>=846,trip.inputs['right'])
    wait(trip,lambda:trip.actor.ground and trip.actor.y==411)
    second = trip.state.riverDecks[1].platform
    wait(trip,lambda:785<second.x<805 and trip.state.riverDecks[1].direction==1)
    wait(trip,lambda:trip.actor.x>=906,trip.inputs['right'])
    wait(trip,lambda:trip.actor.ground and trip.actor.y==435,limit=120)
    wait(trip,lambda:second.x==1070)
    jump(trip,1270,480)
    foes = [e for e in trip.state.enemies.values() if e.hp>0]
    if foes:
        trip.fight(foes,trip.totals())
    inspect(trip,1480,480,4,'water')
    trip.cross(SUMMIT)
    trip.restore()
    assert trip.state.story.node == 'natlan-flag-staging'
    if not trip.state.holdAllyFire:
        trip.act('hold_ally_fire')
    assert trip.state.story.quests[ID].pathProgress.water.count == 4
    trip.cross(HUB)
    trip.cross(SUMMIT)
    return {'enemies':5,'boardingPhases':['wait','board','riding','landed'],'pausedKeepsArrival':True}


def replay(order):
    trip = SurveyJourney(SOURCE, runtime(), select_traveler=True)
    assert trip.state.story.quests['natlan-ridge-flag'].status == 'complete'
    assert trip.state.progression.level == 101
    trip.act('hold_ally_fire')
    assert trip.state.holdAllyFire
    trip.act('story_accept:'+ID)
    trip.cross(SUMMIT)
    inspect(trip,795,390,1)
    result = {}
    for branch in order:
        result[branch] = (highland if branch=='high' else waterside)(trip)
        if branch != order[-1]:
            assert trip.guide(MEET)['status'] == 'blocked'
    assert trip.state.story.quests[ID].count == 2
    trip.cross(MEET)
    inspect(trip,431,480,3)
    inspect(trip,847,390,4)
    trip.cross(HUB)
    ore = trip.state.inventory.upgradeOre
    trip.report(ID)
    payout = trip.reports[-1]
    assert (payout['xp'],payout['mora'],trip.state.inventory.upgradeOre-ore) == (
        quests[ID]['xp'],quests[ID]['mora'],quests[ID]['ore'])
    trip.restore()
    assert trip.state.story.quests[ID].status == 'complete' and trip.state.returns == 0
    saved = trip.snapshot()
    write(WORK / (order[0]+'-first-complete.json'), saved)
    trip.act('story_accept:'+NEXT)
    assert trip.state.story.quests[NEXT].status == 'active'
    print('Then '.join(order), saved['progression']['level'], flush=True)
    return dict(order=order, branches=result, payout=payout, ore=quests[ID]['ore'],
                level=saved['progression']['level'], sourceSha256=trip.source,
                reportRestored=True, nextQuestAvailable=NEXT, returns=0)


if __name__ == '__main__':
    WORK.mkdir(parents=True, exist_ok=True)
    results = [replay(order) for order in (('water','high'),('high','water'))]
    write(ROOT/'evidence/earned-natlan-two-trials-lua.json', results)
