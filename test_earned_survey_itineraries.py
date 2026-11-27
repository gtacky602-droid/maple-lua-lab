"""Walk every visit quest and travel-and-inspect itinerary from earned saves and reload payouts."""
import json

from story_scope import suspended_stage_returns
from test_earned_branch_quests import Journey, ROOT, graph

nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
regional_hubs = dict(sne='snezhnaya-hub', nod='nod-town', nat='natlan-hub', fon='fontaine-hub',
                     sum='sumeru-hub', ina='inazuma-town', liyue='liyue-harbor', mond='mond-town')

class SurveyJourney(Journey):
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
    trip.act('story_accept:'+id)
    state = trip.state.story.quests[id]
    assert state and state.status=='active' and state.count==0, id
    if q['kind']=='visit':
        trip.travel(q['target'])
        assert state.count==q['goal']
    else:
        for index, step in enumerate(q['itinerary'],1):
            if step['kind']=='arrive' and trip.state.story.node!=step['from']:
                trip.travel(step['from'])
            if trip.state.story.node!=step['node']:
                trip.travel(step['node'])
            if step['kind']=='inspect':
                if id=='nod-mapped-paha-shadow' and index==2:
                    (ROOT/'work/earned-paha-survey.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False),'utf8')
                trip.mark(id,index)
            assert state.count==index,(id,index,trip.state.story.node,trip.state.storyNotice)
    if trip.state.story.node!=q['hub']:
        trip.travel(q['hub'])
    trip.report(id)
    return {'objectives':state.count,'hub':q['hub'],'routes':trip.itineraries[first_route:]}


def run():
    trip = SurveyJourney('lv200-save.json')
    assert trip.state.progression.level == 200
    earlier, cases = {}, {}
    suspended = suspended_stage_returns(graph)
    active = [q for q in quests.values() if q['hub'] not in suspended and q.get('target') not in suspended]
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
    for q in [*surveys,*visits]:
        id, hub = q['id'], q['hub']
        if id in sources:
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
        if id in ('golden-explore','simulanka-explore'):
            base,clue,group = ('mond-town','mond-road','golden') if id=='golden-explore' else ('fontaine-hub','fontaine-hub','simulanka')
            trip.warp(base)
            travel(clue)
            trip.approach(1050,480,group)
            trip.act('story_collect')
            assert trip.state.story.discovered[group]
            unlock = 'golden-little-boat' if group=='golden' else 'simulanka-open-page'
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
        if id=='veluriyam-trolley-lookout':
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
    assert set(cases) | set(earlier) == {q['id'] for q in [*visits, *surveys]}
    assert all(trip.state.story.quests[r['quest']].status=='complete' and trip.state.story.quests[r['quest']].cycles==1 for r in trip.reports)
    legs=sum(len(r['stops']) for r in trip.itineraries)
    extra_legs=sum(len(route['stops']) for case in earlier.values() for route in case['routes'])
    return dict(sourceSha256=trip.source,levelAtStart=200,draftBalance=True,cases=cases,earlierEarnedSaves=earlier,
                scope={'travelAndInspect':len(surveys),'visit':len(visits)},reportRewards=trip.reports,
                level200Legs=legs,allPhysicalOrTransportLegs=legs+extra_legs,
                restoredReports=len(cases)+len(earlier))

if __name__=='__main__':
    proof=run()
    (ROOT/'evidence/earned-survey-itineraries.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
    print(proof['restoredReports'], proof['allPhysicalOrTransportLegs'])
