"""Follow town commissions and visit unexplored map points on the continuing save."""
import argparse
import json
from collections import deque

from runtime import ROOT, runtime
from test_earned_branch_quests import graph, quests
from test_earned_survey_itineraries import SurveyJourney

groups={
    'remaining':('boss-commission-tour',[(hub,None,hub) for hub in
        ('sne-east-camp','nod-port','nod-north-harbor','nat-resort-pier','inazuma-port','wingspan-camp','liyue-harbor')]),
    'north':('fon-nat-survey',[('ナド・クライ','region-07','nod-town'),('スネージナヤ','region-08','snezhnaya-hub')]),
    'mond-liyue':('original-weekly-expedition',[('モンド','region-01','mond-town'),('璃月','region-02','liyue-harbor')]),
    'fon-nat':('ina-sum-survey',[('フォンテーヌ','region-05','fontaine-hub'),('ナタ','region-06','natlan-hub')]),
    'ina-sum':('mond-liyue-survey',[('稲妻','region-03','inazuma-town'),('スメール','region-04','sumeru-hub')]),
}
atlas=json.loads((ROOT/'content/world-atlas.json').read_bytes())
branch_hubs={
    'branch-01':'dragonspine-camp','branch-02':'chenyu-camp','branch-03':'enkanomiya-camp',
    'branch-04':'tunigi-camp','branch-05':'bygone-camp','branch-06':'dornman-camp',
    'branch-07':'ochkanatlan-dock','branch-08':'nod-special-camp','branch-09':'novokichev-camp',
    'hidden-01':'golden-hub','hidden-02':'veluriyam-hub','hidden-03':'simulanka-hub',
    'official-area-6':'chasm-camp','official-area-12':'nat-mountain-camp',
    'official-area-14':'nat-sky-camp','official-area-15':'frostmoon-camp',
}
groups['branches']=('north-survey',[(area['name'],area['id'],branch_hubs[area['id']])
                                    for area in atlas['regions'] if area['id'] in branch_hubs])
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--group',choices=groups,default='mond-liyue')
group=parser.parse_args().group
seed,regions=groups[group]
source=ROOT/f'evidence/{seed}-save.json'
trip=SurveyJourney(source,runtime(),select_traveler=True)
before=trip.snapshot()
nodes={n['id']:n for n in graph['nodes']}
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
        if q['id']=='nod-north-landmark-round':
            for path in q['paths']:
                for mark in path['steps']:
                    trip.travel(mark['node'])
                    trip.approach(mark['x'],mark['y'],q['id'])
                    trip.act('story_collect')
                assert state.pathProgress[path['id']].count==len(path['steps'])
        elif q['id']=='threadline-restore':
            for index,step in enumerate(q['itinerary'],1):
                trip.travel(step['node'])
                if step['kind']=='inspect':
                    trip.mark(q['id'],index)
                else:
                    slot=trip.state.weeklySlots[step['boss']]
                    for tick in range(18000):
                        if state.count==index:break
                        target=slot.primary
                        if not slot.openUntil:
                            target=next((part for part in slot.shuttles.values() if part.hp>0),target)
                        dx=target.x-trip.actor.x
                        move=abs(dx)>48 or trip.actor.dir*dx<0
                        trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,attack=True))
                assert state.count==index
        elif q['kind']=='visit':
            trip.travel(q['target'])
        elif q['kind']=='kill':
            trip.warp(hub)
            bag=trip.state.inventory
            if len(bag.ground):
                items=list(bag['items'].values())
                spare=sorted((a for a in items if a.owner==0 and not a.locked),
                             key=lambda a:(a.rarity,a.itemLv,a.id))
                for a in spare[:max(0,len(items)+len(bag.ground)+4-80)]:
                    trip.act('artifact_sell:'+str(a.id))
                trip.act('artifact_recover')
            trip.travel(q['target'])
            for tick in range(18000):
                if state.count>=q['goal']:break
                enemies=[e for e in trip.state.enemies.values() if e.hp>0]
                if not enemies:
                    trip.warp(hub)
                    trip.travel(q['target'])
                    continue
                enemy=min(enemies,key=lambda e:abs(e.x-trip.actor.x)+2*abs(e.y-trip.actor.y))
                if tick%90==0:
                    trip.act('skill1')
                    trip.act('skill2')
                if tick and tick%1200==0:
                    trip.warp(hub)
                    trip.travel(q['target'])
                    continue
                dx=enemy.x-trip.actor.x
                move=abs(dx)>22 or trip.actor.dir*dx<0
                trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,jump=enemy.y<trip.actor.y-45,attack=True))
            assert state.count>=q['goal'],(q['id'],state.count,trip.state.story.node,trip.actor.x,trip.actor.y)
        elif '-mapped-' in q['id'] or q['id'] in ('threadline-survey','fon-morte-sluice-survey','natlan-ancient-excavation-wall','natlan-seaward-signs','natlan-two-pillar-trails','natlan-atocpan-landmarks','natlan-southern-trail-survey'):
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

for region,area_id,hub in regions:
    commissions(region,hub)
    if area_id is None:continue
    area=next(a for a in atlas['regions'] if a['id']==area_id)
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
            if target=='narwhal-inner-echo':
                trip.warp(hub)
                trip.approach(700,480,'narwhal-star-sea')
                trip.act('hold_ally_fire')
                trip.act('weekly_start:boss-29090101:entry')
                for _ in range(180):
                    trip.tick(60)
                    if trip.state.story.node==target:break
                assert trip.state.story.node==target,'呑星の鯨の腹中に到達せず'
                trip.act('hold_ally_fire')
                slot=trip.state.weeklySlots['boss-29090101']
                fight=trip.lua.execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
                result=fight(trip.core,trip.state,slot,'weekly',60*240,'mechanics')
                assert result.status=='clear',result.status
                trip.warp(hub)
                continue
            if target=='mond-old-canopy':
                trip.travel('mond-old-road')
                trip.approach(510,390,target)
                trip.approach(510,300,target)
            trip.travel(target)
        except AssertionError as error:
            if target=='narwhal-inner-echo':raise
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
    (ROOT/f'evidence/{group}-survey-{name}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
