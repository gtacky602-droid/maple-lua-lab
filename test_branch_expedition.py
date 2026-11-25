"""Play the nine authored branch chains on one adventure after the regional chapters."""
from hashlib import sha256
import json
import re

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, quests
from test_earned_highland_quests import dragonspine, chenyu, ochkanatlan, moonlit
from test_earned_terrain_quests import enkanomiya, tunigi, bygone, novo


def completed(save):
    return {q:record for q,record in save['story']['quests'].items() if record['status']=='complete'}


def write(path, value):
    path.write_bytes((json.dumps(value,sort_keys=True,ensure_ascii=False)+'\n').encode('utf8'))


def main():
    seed=ROOT/'evidence/dornman-after-chapters-save.json'
    initial=json.loads(seed.read_bytes())
    already=completed(initial)
    branch={q['id']:q['designId'] for q in quests.values() if re.fullmatch(r'Q-B\d{2}-\d{2}',q.get('designId',''))}
    regional=[q['id'] for q in quests.values() if re.fullmatch(r'Q-(MON|LIY|INA|SUM|FON|NAT|NOD|SNE)-[MS]\d{2}',q.get('designId',''))]
    assert len(regional)==64 and all(q in already for q in regional)
    assert len(branch)==27 and {branch[q] for q in already if q in branch}=={'Q-B06-01','Q-B06-02','Q-B06-03'}
    work=ROOT/'work/earned-branch-expedition'
    work.mkdir(parents=True,exist_ok=True)
    source=seed
    evidence=[]
    for route in (dragonspine,chenyu,enkanomiya,tunigi,bygone,ochkanatlan,moonlit,novo):
        trip=Journey(source,runtime(),select_traveler=True)
        before=completed(trip.snapshot())
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
        assert len(gained)==3 and gained=={row['quest'] for row in result['reports']}
        assert save['progression']['level']==200 and trip.state.returns==0
        region=sorted(branch[q] for q in gained)
        assert [id[-2:] for id in region]==['01','02','03'] and len({id[:5] for id in region})==1
        evidence.append(dict(region=region[0][:5], quests=region, reports=result['reports'], battles=result['battles'],
                             supplies=recovery,crossings=sorted(trip.crossings), stop=save['story']['node']))
        source=work/(route.__name__+'.json')
        write(source,save)
        print(route.__name__,region,save['story']['node'],flush=True)
    assert all(q in after for q in branch)
    write(ROOT/'evidence/branch-expedition-save.json',save)
    write(ROOT/'evidence/branch-expedition-route.json',dict(seed=seed.name,sourceSha256=sha256(seed.read_text('utf8').encode('utf8')).hexdigest(),
          level=200,regions=9,branchReports=27,regionalReports=64,returns=trip.state.returns,stages=evidence))

if __name__=='__main__':
    main()
