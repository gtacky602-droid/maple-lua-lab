"""Enter both original weekly fights from Liyue and report their quests on the full legend save."""
import json
from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, quests

seed=ROOT/'evidence/all-legends-expedition-save.json'
trip=Journey(seed,runtime(),select_traveler=True)
weekly=json.loads((ROOT/'content/weekly-boss-spawns.json').read_bytes())['weeklyBosses']
starts=trip.snapshot()
rows=[]
for boss in (b for b in weekly if b.get('original')):
    node=boss['node']
    q=next(k for k,v in quests.items() if v.get('target')==boss['id'] and v['hub']=='liyue-harbor')
    trip.warp('liyue-harbor')
    trip.act('story_accept:'+q)
    trip.travel(node)
    s=trip.state
    slot=s.weeklySlots[boss['id']]
    baseline=s.progression.total,s.mora,s.returns,s.t
    seen=set()
    for tick in range(12000):
        if slot.phase=='respawn':break
        target=slot.primary
        if slot.shuttles and not slot.openUntil:
            target=next((part for part in slot.shuttles.values() if part.hp>0),target)
        dx=target.x-trip.actor.x
        move=abs(dx)>62 or trip.actor.dir*dx<0
        if tick%45==0:trip.act('skill1')
        if tick%90==0:trip.act('skill2')
        if slot.cast:seen.add(slot.cast.move.id)
        trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,attack=True))
        assert s.returns==baseline[2] and s.story.node==node
    assert slot.phase=='respawn',(node,slot.primary.hp,slot.cycle)
    rewards=[s.progression.total-baseline[0],s.mora-baseline[1]]
    assert min(rewards)>0
    rows.append(dict(id=boss['id'],name=boss['name'],node=node,quest=q,questName=quests[q]['name'],
                     seconds=round(s.t-baseline[3],2),rewards=rewards,moves=sorted(seen)))
    trip.travel('liyue-harbor')
    trip.report(q)
    trip.restore()
    assert trip.state.endgame.bosses[boss['id']].clears==1 and trip.state.story.quests[q].status=='complete'
    print('clear',node,flush=True)
save=trip.snapshot()
assert len(rows)==2
assert all(save['endgame']['bosses'][k]['clears']>=v['clears'] for k,v in starts['endgame']['bosses'].items())
for suffix,data in [('save',save),('route',dict(seed=seed.name,clears=rows,reports=trip.reports))]:
    (ROOT/f'evidence/original-weekly-expedition-{suffix}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
