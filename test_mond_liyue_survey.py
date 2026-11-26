"""Follow town commissions and visit unexplored map points on the continuing save."""
import json
from collections import deque

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, graph, quests

source=ROOT/'evidence/original-weekly-expedition-save.json'
trip=Journey(source,runtime(),select_traveler=True)
before=trip.snapshot()
nodes={n['id']:n for n in graph['nodes']}
regions={'モンド':'mond-town','璃月':'liyue-harbor'}
regions_proof={}

def report_ready(hub):
    trip.warp(hub)
    for q in quests.values():
        state=trip.state.story.quests[q['id']]
        if q['hub']==hub and state and state.status!='complete' and state.count>=q['goal']:
            trip.report(q['id'])

def commissions(region,hub):
    trip.warp(hub)
    selected=[q for q in quests.values() if q['hub']==hub and q['kind'] in ('visit','kill','boss','itinerary')]
    for q in selected:
        if not trip.state.story.quests[q['id']]:
            trip.act('story_accept:'+q['id'])
    for q in selected:
        state=trip.state.story.quests[q['id']]
        if not state or state.status=='complete' or state.count>=q['goal']: continue
        if q['kind']=='visit':
            trip.travel(q['target'])
        elif q['kind']=='kill':
            trip.travel(q['target'])
            for _ in range(18000):
                if state.count>=q['goal']:break
                enemies=[e for e in trip.state.enemies.values() if e.hp>0]
                if not enemies:
                    trip.tick(30)
                    continue
                enemy=min(enemies,key=lambda e:abs(e.x-trip.actor.x))
                dx=enemy.x-trip.actor.x
                move=abs(dx)>65 or trip.actor.dir*dx<0
                trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,attack=True))
            assert state.count>=q['goal'],q['id']
        elif q['id'] in ('liyue-mapped-east-shore','mond-mapped-lakeside','threadline-survey'):
            for index,step in enumerate(q['itinerary'],1):
                if state.count>=index:continue
                if step['kind']=='arrive':
                    trip.travel(step['from'])
                    trip.cross(step['node'])
                else:
                    trip.travel(step['node'])
                    trip.mark(q['id'],index)
                assert state.count>=index
    report_ready(hub)

for region,hub in regions.items():
    commissions(region,hub)
    atlas=json.loads((ROOT/'content/world-atlas.json').read_bytes())
    area=next(a for a in atlas['regions'] if a['id']=={'モンド':'region-01','璃月':'region-02'}[region])
    targets={point['id'] for point in area['points']}
    failures={}
    while True:
        pending=targets-set(failures)-{n for n in targets if trip.state.story.visited[n]}
        if not pending:break
        # Prefer nearby destinations. Lua still selects and validates the actual route.
        queue=deque([trip.state.story.node])
        seen=set(queue)
        while queue:
            target=queue.popleft()
            if target in pending:break
            for edge in nodes[target]['exits']:
                dst=edge['to']
                if dst not in seen:
                    seen.add(dst)
                    queue.append(dst)
        else:
            target=sorted(pending)[0]
        try:
            if target=='mond-old-canopy':
                trip.travel('mond-old-road')
                trip.approach(510,390,target)
                trip.approach(510,300,target)
            trip.travel(target)
        except AssertionError as error:
            detail=error.args[0] if error.args else ''
            reason=detail[2].get('reason') if isinstance(detail,tuple) and len(detail)>2 and isinstance(detail[2],dict) else str(detail)
            failures[target]=reason or '経路未確認'
            trip.warp(hub)
    report_ready(hub)
    trip.restore()
    visited=sorted(n for n in targets if trip.state.story.visited[n])
    regions_proof[region]=dict(catalog=len(targets),visited=visited,
        newVisits=[n for n in visited if not before['story']['visited'].get(n)],
        pending={n:failures[n] for n in sorted(targets-set(visited))})
    print(region,len(visited),'/',len(targets),len(trip.reports),'reports',flush=True)
after=trip.snapshot()
assert all(after['story']['visited'].get(n) for n,v in before['story']['visited'].items() if v)
assert all(after['endgame']['bosses'][k]['clears']>=v['clears'] for k,v in before['endgame']['bosses'].items())
for name,data in [('save',after),('route',dict(seed=source.name,regions=regions_proof,reports=trip.reports))]:
    (ROOT/f'evidence/mond-liyue-survey-{name}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
