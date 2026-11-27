"""Walk every visit quest and travel-and-inspect itinerary from earned saves and reload payouts."""
from argparse import ArgumentParser
from collections import deque
import json
from pathlib import Path

from runtime import runtime
from story_scope import suspended_stage_returns
from test_earned_branch_quests import Journey, ROOT, graph

nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
regional_hubs = dict(sne='snezhnaya-hub', nod='nod-town', nat='natlan-hub', fon='fontaine-hub',
                     sum='sumeru-hub', ina='inazuma-town', liyue='liyue-harbor', mond='mond-town')
field_note_keys = {
    'kind', 'node', 'x', 'y', 'radius', 'name', 'notice', 'objective', 'action', 'completedLabel',
    'outcrop', 'routeBeacon', 'resonanceControl', 'resonanceStone',
}
hidden_entrances = {
    'golden-explore': ('mond-town', 'mond-road', 'golden', 'golden-little-boat'),
    'simulanka-explore': ('fontaine-hub', 'fontaine-hub', 'simulanka', 'simulanka-open-page'),
}

class SurveyJourney(Journey):
    def approach(self, x, y, target):
        origin = self.state.story.node
        try:
            return super().approach(x, y, target)
        except AssertionError:
            if self.state.story.node != origin or self.state.storySwimming or self.actor.hp <= 0:
                raise
        self.tick(90)
        shelves = [(p.x, p.y, p.w) for p in self.state.platforms.values()]
        starts = [i for i, (left, top, width) in enumerate(shelves)
                  if abs(self.actor.y - top) < 10 and left <= self.actor.x <= left + width]
        goals = {i for i, (left, top, width) in enumerate(shelves)
                 if abs(y - top) < 10 and left <= x <= left + width}
        queue = deque((i, []) for i in starts)
        seen = set(starts)
        while queue:
            i, path = queue.popleft()
            if i in goals:
                for px, py in path:
                    super().approach(px, py, target)
                return super().approach(x, y, target)
            lower_x, lower_y, lower_width = shelves[i]
            for j, (upper_x, upper_y, upper_width) in enumerate(shelves):
                left = max(lower_x, upper_x)
                right = min(lower_x + lower_width, upper_x + upper_width)
                if j not in seen and 0 < lower_y - upper_y <= 110 and right - left >= 20:
                    seen.add(j)
                    queue.append((j, path + [((left + right) // 2, upper_y)]))
        raise AssertionError((origin, target, x, y, 'no reachable platform path'))

    def cross(self, target, gate_x=None):
        node = nodes[self.state.story.node]
        edge = next(e for e in node['exits'] if e['to']==target and (gate_x is None or e['x']==gate_x))
        if edge.get('darkOnly') and self.state.storyLightMode=='bright':
            control = next(c for c in node['localLight']['controls'] if not c.get('darkOnly'))
            self.approach(control['x'],control['y'],target)
            self.act('story_collect')
            assert self.state.storyLightMode=='dark'
        super().cross(target,gate_x)

def walk_objectives(trip, q):
    id = q['id']
    first_route = len(trip.itineraries)
    state = trip.state.story.quests[id]
    if not state:
        trip.act('story_accept:'+id)
        state = trip.state.story.quests[id]
    assert state and state.status == 'active', id
    if q['kind'] == 'visit' and state.count < q['goal']:
        trip.travel(q['target'])
    elif q['kind'] != 'visit':
        for index, step in enumerate(q['itinerary'],1):
            if index <= state.count:
                continue
            if step['kind']=='arrive' and trip.state.story.node!=step['from']:
                trip.travel(step['from'])
            if trip.state.story.node!=step['node']:
                trip.travel(step['node'])
            if step['kind']=='inspect':
                if id=='nod-mapped-paha-shadow' and index==2:
                    (ROOT/'work/earned-paha-survey.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False),'utf8')
                trip.mark(id,index)
            assert state.count==index,(id,index,trip.state.story.node,trip.state.storyNotice)
    assert state.count == q['goal'], id
    if trip.state.story.node!=q['hub']:
        trip.travel(q['hub'])
    trip.report(id)
    return {'objectives':state.count,'hub':q['hub'],'routes':trip.itineraries[first_route:]}


def run(checkpoint=None, output_dir=None, *, field_notes=False):
    trip = (SurveyJourney(checkpoint.resolve(), runtime(), select_traveler=True)
            if checkpoint else SurveyJourney('lv200-save.json'))
    assert trip.state.progression.level == 200
    earlier, cases, completed = {}, {}, set()
    before = trip.snapshot()['story']['quests']
    suspended = suspended_stage_returns(graph)
    active = [q for q in quests.values() if not q.get('legacyOnly') and q['hub'] not in suspended
              and q.get('target') not in suspended]
    surveys = [q for q in active if {step['kind'] for step in q.get('itinerary', [])} == {'arrive', 'inspect'}]
    def travel(target):
        if trip.state.story.node != target:
            trip.travel(target)

    def open_veluriyam():
        trip.warp('sumeru-hub')
        travel('sumeru-entry')
        trip.approach(1050, 480, 'veluriyam')
        trip.act('story_collect')
        assert trip.state.story.discovered.veluriyam
        ticket = 'veluriyam-bottle-ticket'
        travel(quests[ticket]['hub'])
        trip.act('story_accept:'+ticket)
        trip.mark(ticket, 1)
        step = quests[ticket]['itinerary'][1]
        trip.approach(step['x'], step['y'], ticket)
        for _ in range(3):
            trip.act('story_collect')
        trip.act('story_airflow_commit')
        assert trip.state.story.quests[ticket].count == 2
        for i in (3,4):
            travel(quests[ticket]['itinerary'][i-1]['node'])
            trip.mark(ticket,i)
        travel(quests[ticket]['hub'])
        trip.report(ticket)

    sources = {'sum-mapped-north-quay': 'sumeru-fresh-route/pre-quay-save.json',
               'natlan-ancient-excavation-wall': 'cap-fresh-route/lv165-save.json'}
    visits = [q for q in active if q['kind']=='visit']
    notes = [q for q in active if field_notes and q.get('itinerary')
             and all(step['kind'] == 'inspect' and set(step) <= field_note_keys for step in q['itinerary'])
             and (not q.get('requires') or before.get(q['requires'], {}).get('status') == 'complete')]
    if field_notes:
        surveys, visits = [], []
    for q in [*surveys, *visits, *notes]:
        id, hub = q['id'], q['hub']
        if checkpoint and before.get(id, {}).get('status') == 'complete':
            completed.add(id)
            continue
        if not checkpoint and id in sources:
            baseline = SurveyJourney(ROOT/'work'/sources[id])
            start_level = baseline.state.progression.level
            assert trip.state.story.quests[id].status=='complete' and not baseline.state.story.quests[id]
            baseline.warp(hub)
            result = walk_objectives(baseline,q)
            baseline.restore()
            assert baseline.state.story.quests[id].status=='complete' and baseline.state.story.quests[id].cycles==1
            earlier[id] = dict(source=sources[id],sha256=baseline.source,levelAtStart=start_level,
                               reportReward=baseline.reports[-1],**result)
            continue
        if id in hidden_entrances:
            base, clue, group, unlock = hidden_entrances[id]
        else:
            unlock = None
        if unlock and before.get(unlock, {}).get('status') != 'complete':
            trip.warp(base)
            travel(clue)
            trip.approach(1050,480,group)
            trip.act('story_collect')
            assert trip.state.story.discovered[group]
            travel(quests[unlock]['hub'])
            trip.act('story_accept:'+unlock)
            for i, step in enumerate(quests[unlock]['itinerary'],1):
                travel(step['node'])
                if group=='simulanka' and i==2:
                    trip.approach(497,480,unlock)
                    trip.act('story_collect')
                    trip.act('story_paper_confirm')
                    assert trip.state.story.quests[unlock].count==2
                    trip.approach(623,480,unlock)
                    trip.act('jump')
                    for _ in range(90):
                        dx=639-trip.actor.x
                        trip.tick(1,trip.lua.table(left=dx < -4,right=dx > 4,jump=True))
                        if trip.actor.ground and abs(trip.actor.y-389)<2 and abs(dx)<8:
                            break
                    else:
                        raise AssertionError('Folded bridge was not reached')
                else:
                    trip.mark(unlock,i)
            travel(quests[unlock]['hub'])
            trip.report(unlock)
        if id == 'veluriyam-trolley-lookout' and before.get('veluriyam-bottle-ticket', {}).get('status') != 'complete':
            open_veluriyam()
        if trip.state.story.visited[hub]:
            trip.warp(hub)
        else:
            regional = regional_hubs.get(id.split('-')[0])
            if regional and trip.state.story.visited[regional]:
                trip.warp(regional)
            travel(hub)
        cases[id] = walk_objectives(trip,q)
        print(id, cases[id]['objectives'], flush=True)
    trip.restore()
    assert set(cases) | set(earlier) | completed == {q['id'] for q in [*visits, *surveys, *notes]}
    assert all(trip.state.story.quests[r['quest']].status=='complete' and trip.state.story.quests[r['quest']].cycles==1 for r in trip.reports)
    if checkpoint:
        saved = trip.snapshot()
        after = saved['story']['quests']
        reports = {r['quest'] for r in trip.reports}
        assert all(after[q] == record for q, record in before.items() if record['status'] == 'complete')
        assert reports == {q for q, record in after.items()
                           if record['status'] == 'complete' and before.get(q, {}).get('status') != 'complete'}
        (output_dir / 'survey-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', 'utf8')
    legs=sum(len(r['stops']) for r in trip.itineraries)
    extra_legs=sum(len(route['stops']) for case in earlier.values() for route in case['routes'])
    proof = dict(sourceSha256=trip.source,levelAtStart=200,draftBalance=checkpoint is None,cases=cases,earlierEarnedSaves=earlier,
                scope={'travelAndInspect':len(surveys),'visit':len(visits)},reportRewards=trip.reports,
                level200Legs=legs,allPhysicalOrTransportLegs=legs+extra_legs,
                restoredReports=len(cases)+len(earlier))
    if field_notes:
        proof['scope']['fieldNotes'] = len(notes)
    if checkpoint:
        proof['newlyReported'] = len(trip.reports)
    return proof

if __name__=='__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--field-notes', action='store_true', help='follow interaction markers from the supplied save')
    args = parser.parse_args()
    if bool(args.from_save) != bool(args.output_dir):
        parser.error('--from-save and --output-dir must be provided together')
    if args.field_notes and not args.from_save:
        parser.error('--field-notes requires --from-save')
    output = ROOT / 'evidence/earned-survey-itineraries.json'
    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        output = args.output_dir / 'survey-proof.json'
    proof=run(args.from_save, args.output_dir, field_notes=args.field_notes)
    output.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
    print(proof['restoredReports'], proof['allPhysicalOrTransportLegs'])
