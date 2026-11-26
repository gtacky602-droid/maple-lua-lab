"""Open the False Moon rift and the railway depot on a continuous exploration save."""
import argparse
import json
from runtime import ROOT,runtime
from test_earned_survey_itineraries import SurveyJourney,quests

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--seed',default='branches-survey')
args=parser.parse_args()
source=ROOT/f'evidence/{args.seed}-save.json'
trip=SurveyJourney(source,runtime(),select_traveler=True)
start=trip.snapshot()
trip.warp('nod-town')
trip.approach(210,480,'nod-false-moon-court')
trip.act('hold_ally_fire')
trip.act('weekly_start:boss-29130201:entry')
slot,spec=trip.core.currentWeeklyBoss(trip.state)
trip.approach(spec.rift.x,spec.floorY,'裂け目')
for tick in range(18000):
    if trip.state.story.node==spec.innerNode:
        break
    if slot.cast and slot.cast.key=='WM13' and slot.cast.t>=spec.rift.enterTick:
        trip.act('encounter_interact')
    dx=spec.rift.x-trip.actor.x
    trip.tick(1,trip.lua.table(left=dx < -8,right=dx > 8))
assert trip.state.story.node==spec.innerNode
trip.act('hold_ally_fire')
fight=trip.lua.execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
result=fight(trip.core,trip.state,slot,'weekly',60*240,'mechanics')
assert result.status=='clear',result.status
trip.warp('nod-town')
trip.restore()
assert trip.state.story.visited[spec.innerNode]
print('rift returned and reloaded',flush=True)

hub='snezhnaya-hub'
q='snow-rail-pressure'
trip.warp(hub)
trip.act('story_accept:'+q)
for i,step in enumerate(quests[q]['itinerary'],1):
    trip.travel(step['node'])
    if step['kind']=='inspect':
        trip.mark(q,i)
    else:
        slot=trip.state.fieldSlots[step['boss']]
        for tick in range(9000):
            if trip.state.story.quests[q].count==i:break
            target=slot.enemy
            dx=target.x-trip.actor.x
            move=abs(dx)>24 or dx*trip.actor.dir<0
            if tick%45==0:trip.act('skill1')
            if tick%90==0:trip.act('skill2')
            trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,attack=True))
    assert trip.state.story.quests[q].count==i,(step['node'],trip.state.story.quests[q].count)
trip.warp(hub)
trip.report(q)
trip.restore()
save=trip.snapshot()
assert all(save['story']['visited'].get(n) for n in start['story']['visited'])
assert save['story']['quests'][q]['status']=='complete' and save['story']['visited']['steam-stabling-depot']
assert save['endgame']['bosses']['original-snow-sweeper']['clears']>=1
for suffix,data in [('save',save),('route',dict(seed=source.name,rift='nod-false-moon-rift',battleTicksAfterEntry=result.ticks,reports=trip.reports))]:
    (ROOT/f'evidence/northern-gates-{suffix}.json').write_bytes((json.dumps(data,sort_keys=True,ensure_ascii=False)+'\n').encode())
print('railway depot reported')
