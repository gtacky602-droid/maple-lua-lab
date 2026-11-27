"""Travel six Novokichev rooms with M-map routes and an earned Lv200 save."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import native, runtime
from test_earned_survey_itineraries import SurveyJourney
from test_earned_terrain_quests import novo


CAMP, DEPTH, CAVERN = 'novokichev-camp', 'novokichev-depth', 'wavebinder-tide-cavern'
WORKS, PASSAGE, VAULT = 'novo-frozen-works', 'novo-drift-passage', 'novo-ice-vault'
ROOMS = {CAMP, DEPTH, CAVERN, WORKS, PASSAGE, VAULT}
SURVEY = 'novokichev-survey'
REGION = 'ノヴォキッチェヴ（仮構造）'
SUSPENDED = 'ナド・クライ特別地域（仮）'


class NovokichevJourney(SurveyJourney):
    def travel(self, target):
        legs = super().travel(target)
        if target in ROOMS:
            platforms = [{'x': p.x, 'y': p.y, 'w': p.w} for p in self.state.platforms.values()]
            assert platforms and self.actor.hp > 0
            self.arrivals[target] = dict(legs=legs, platforms=platforms)
        return legs


def replay(source):
    trip = NovokichevJourney(source.resolve(),runtime(),select_traveler=True)
    trip.arrivals = {}
    original = trip.snapshot()
    trip.warp('snezhnaya-hub')
    trip.travel(CAMP)
    trip.act('story_accept:'+SURVEY)
    trip.travel(DEPTH)
    assert trip.state.story.quests[SURVEY].count==1
    trip.travel(CAVERN)
    trip.travel(DEPTH)
    trip.travel(CAMP)
    trip.report(SURVEY)
    assert novo(trip)['reports']
    checkpoint = trip.snapshot()
    assert checkpoint['story']['node']==CAMP and original['progression']['level']==200
    assert set(trip.arrivals)==ROOMS
    assert checkpoint['story']['quests'][SURVEY]['status']=='complete'
    assert trip.state.returns==0

    pressure = trip.arrivals[WORKS]['platforms']
    assert any(p['x']<=1595<=p['x']+p['w'] and p['y']==385 for p in pressure)
    assert any(p['y']==389 for p in trip.arrivals[PASSAGE]['platforms'])
    assert any(p['y']==388 for p in trip.arrivals[VAULT]['platforms'])

    trip.act('world_map_toggle')
    view=trip.frame().worldMap
    assert view
    visible=native(trip.frame().storyGraph)['nodes']
    assert not any(node.get('region')==SUSPENDED for node in visible)
    assert {node['id'] for node in visible if node.get('region')==REGION}==ROOMS
    trip.act('world_map_close')
    return dict(sourceSha256=trip.source,rooms=trip.arrivals,itineraries=trip.itineraries,
                reports=trip.reports,locks=trip.locks,battles=trip.battles,
                suspendedAbsent=True,returns=trip.state.returns),checkpoint


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    evidence,checkpoint=replay(args.from_save)
    (args.output_dir/'novokichev-travel.json').write_text(
        json.dumps(evidence,ensure_ascii=False,indent=2)+'\n','utf8')
    (args.output_dir/'novokichev-earned-save.json').write_text(
        json.dumps(checkpoint,ensure_ascii=False)+'\n','utf8')
    print(f"{len(evidence['rooms'])} rooms reached. {len(evidence['reports'])} quest reports restored.")
