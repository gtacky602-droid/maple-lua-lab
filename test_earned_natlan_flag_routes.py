"""Replay both flag routes with the checkpoint earned by crossing into Natlan."""
import json

from runtime import ROOT, runtime
from test_earned_survey_itineraries import SurveyJourney, quests


HUB, STAGING = 'natlan-hub', 'natlan-flag-staging'
CLEFT, SUMMIT = 'natlan-flag-cleft', 'natlan-flag-summit'
ID = 'natlan-ridge-flag'
NEXT = 'natlan-two-trials'
SOURCE = ROOT / 'work/earned-fontaine-natlan/natlan-browser-start.json'
WORK = ROOT / 'work/earned-natlan-flag'
ROUTES = {
    'slope': ('natlan-flag-slope', 5, ((445,480), (1445,391)), ((844,391),)),
    'ledges': ('natlan-flag-ledges', 1, ((560,390), (1170,302)), ((353,390), (1009,302))),
}


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def replay(name, route):
    stage, enemy_count, marks, climbs = route
    trip = SurveyJourney(SOURCE, runtime(), select_traveler=True)
    assert trip.state.story.node == HUB and trip.state.progression.level == 100
    baseline = trip.snapshot()['story']['quests']
    assert baseline[ID]['status'] == 'active' and baseline[ID]['count'] == 0
    trip.cross(STAGING)
    trip.confirm_lock(stage, '案内板に近づいてG')
    assert '案内板に近づいてG' in trip.guide(stage)['reason']
    trip.mark(ID,1)
    trip.cross(stage)
    assert len(trip.state.enemies) == enemy_count
    if name == 'ledges':
        trip.approach(*climbs[0], stage)
    trip.approach(*marks[0], ID)
    trip.act('story_collect')
    assert trip.state.story.quests[ID].count == 2
    trip.restore()
    assert trip.state.story.node == STAGING and trip.state.story.quests[ID].count == 2
    trip.cross(stage)
    assert '中継印を二つ' in trip.guide(CLEFT)['reason']
    for x,y in climbs:
        trip.approach(x,y,CLEFT)
    trip.approach(*marks[1], ID)
    trip.act('story_collect')
    assert trip.state.story.quests[ID].count == 3
    trip.cross(CLEFT)
    assert '足場が下りるまで' in trip.guide(SUMMIT)['reason']
    assert 'カチーナのそばでG' in trip.frame().storyFlagStatus
    trip.approach(750,391,ID)
    trip.act('story_collect')
    trip.tick(33)
    before = trip.frame().storyFlagLowering.remaining
    assert 0 < before < 1.25 and '残り' in trip.frame().storyFlagStatus
    trip.act('pause')
    trip.tick(60)
    assert trip.frame().storyFlagLowering.remaining == before
    trip.act('pause')
    trip.tick(44)
    assert trip.state.story.quests[ID].count == 4
    assert not trip.frame().storyFlagLowering and '右へ渡って頂上へ' in trip.frame().storyFlagStatus
    trip.restore()
    assert trip.state.story.node == STAGING
    trip.cross(stage)
    for x,y in climbs:
        trip.approach(x,y,CLEFT)
    trip.cross(CLEFT)
    assert any(p.raceBridge for p in trip.state.platforms.values())
    trip.cross(SUMMIT)
    assert '上段の旗' in trip.frame().storyFlagStatus
    trip.mark(ID,5)
    assert '戻って報告' in trip.frame().storyFlagStatus
    assert trip.state.flagTrial is None
    trip.cross(HUB)
    ore_before = trip.state.inventory.upgradeOre
    trip.report(ID)
    ore = trip.state.inventory.upgradeOre - ore_before
    trip.restore()
    after = trip.snapshot()
    assert trip.state.returns == 0 and trip.state.story.node == HUB
    assert all(after['story']['quests'][q] == saved for q,saved in baseline.items() if q != ID)
    assert trip.state.story.quests[ID].cycles == 1 and trip.state.story.quests[ID].flagBestTicks is None
    award = trip.reports[-1]
    assert (award['xp'],award['mora'],ore) == (quests[ID]['xp'],quests[ID]['mora'],quests[ID]['ore'])
    write(WORK / f'{name}-complete.json', after)
    trip.act('story_accept:'+NEXT)
    assert trip.state.story.quests[NEXT].status == 'active'
    return dict(sourceSha256=trip.source, initialLevel=100, finalLevel=after['progression']['level'],
                route=stage, entryEnemies=enemy_count, marks=marks, readyAtCleft=True,
                bridgeCountdownPaused=True, bridgeRestored=True, award=dict(**award,ore=ore),
                nextQuestAvailable=NEXT, reported=True, returns=0)


if __name__ == '__main__':
    WORK.mkdir(parents=True, exist_ok=True)
    results = {}
    for name, route in ROUTES.items():
        results[name] = replay(name, route)
        print(f"Flag course {name} reported at Lv{results[name]['finalLevel']}.", flush=True)
    write(ROOT/'evidence/earned-natlan-flag-lua.json', results)
