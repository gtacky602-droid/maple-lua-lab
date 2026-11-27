"""Finish the active highland quest chains on one earned adventure."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
import re

from runtime import ROOT, runtime
from story_scope import suspended_stage_returns
from test_earned_branch_quests import graph, quests, windward
from test_earned_highland_quests import dragonspine, chenyu, ochkanatlan
from test_earned_survey_itineraries import SurveyJourney
from test_earned_terrain_quests import enkanomiya, tunigi, bygone, novo

routes = {
    'Q-B01': dragonspine, 'Q-B02': chenyu, 'Q-B03': enkanomiya, 'Q-B04': tunigi,
    'Q-B05': bygone, 'Q-B06': windward, 'Q-B07': ochkanatlan, 'Q-B09': novo,
}


def completed(save):
    return {q:record for q,record in save['story']['quests'].items() if record['status']=='complete'}


def write(path, value):
    path.write_bytes((json.dumps(value,sort_keys=True,ensure_ascii=False)+'\n').encode('utf8'))


def main(seed, work):
    raw = seed.read_bytes()
    initial = json.loads(raw)
    assert initial['progression']['level'] == 200
    suspended = suspended_stage_returns(graph)
    branch = {q['id']: q['designId'] for q in quests.values()
              if re.fullmatch(r'Q-B\d{2}-\d{2}', q.get('designId', ''))
              and q['hub'] not in suspended and q.get('target') not in suspended}
    assert set(routes) == {design_id.rsplit('-', 1)[0] for design_id in branch.values()}
    work.mkdir(parents=True,exist_ok=True)
    source=seed
    evidence=[]
    engine = runtime()
    save = initial
    for region, route in routes.items():
        trip = SurveyJourney(source, engine, select_traveler=True)
        before=completed(trip.snapshot())
        expected = {qid for qid, code in branch.items() if code.startswith(region + '-')} - before.keys()
        if not expected:
            continue
        bag=trip.state.inventory
        items=list(bag['items'].values())
        recovery=None
        if len(bag.ground)>=10:
            pending=len(bag.ground)
            spare=sorted((item for item in items if item.owner==0 and not item.locked),
                         key=lambda item:(item.rarity,item.itemLv,item.id))
            sold=[]
            for item in spare[:max(0,len(items)+pending-80)]:
                sold.append(item.id)
                trip.act('artifact_sell:'+str(item.id))
            trip.act('artifact_recover')
            assert not len(bag.ground) and trip.core.canAttack(trip.state)
            recovery=dict(recovered=pending,sold=sold)

        if route is dragonspine:
            result=route(trip,on_shelter=lambda save:write(work/'shelter-three-prints.json',save))
        else:
            result=route(trip)
        trip.restore()
        save=trip.snapshot()
        after=completed(save)
        assert all(after.get(q)==record for q,record in before.items())
        gained=after.keys()-before.keys()
        assert gained==expected=={row['quest'] for row in result['reports']}
        assert save['progression']['level']==200 and trip.state.returns==0
        source=work/(route.__name__+'.json')
        write(source,save)
        evidence.append(dict(region=region, quests=sorted(branch[q] for q in gained),
                             reports=result['reports'], battles=result['battles'],
                             supplies=recovery, crossings=sorted(trip.crossings), stop=save['story']['node'],
                             inputSha256=trip.source, outputSha256=sha256(source.read_bytes()).hexdigest()))
        print(route.__name__, len(gained), save['story']['node'], flush=True)
    after = completed(save)
    assert all(q in after for q in branch)
    write(work/'branch-expedition-save.json',save)
    write(work/'branch-expedition-route.json',dict(seed=seed.name,sourceSha256=sha256(raw).hexdigest(),
          level=200,regions=len(routes),branchReports=len(branch),previousReports=len(completed(initial)),
          complete=len(after),stages=evidence))

if __name__=='__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, default=ROOT/'evidence/dornman-after-chapters-save.json')
    parser.add_argument('--output-dir', type=Path, default=ROOT/'work/earned-branch-expedition')
    args = parser.parse_args()
    main(args.from_save.resolve(), args.output_dir.resolve())
