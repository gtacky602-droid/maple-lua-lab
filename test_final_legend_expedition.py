"""Complete the crystal, route and sparring commissions with their local legends."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT, runtime
from test_earned_branch_quests import frostmoon, graph, quests
from test_earned_survey_itineraries import SurveyJourney

parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path)
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
if bool(args.from_save) != bool(args.output_dir):
    parser.error('--from-save and --output-dir must be provided together')
seed = args.from_save.resolve() if args.from_save else ROOT / 'evidence/quest-legend-expedition-save.json'
directory = args.output_dir or ROOT / 'evidence'
directory.mkdir(parents=True, exist_ok=True)
trip = SurveyJourney(seed, runtime(), select_traveler=True)
nodes={n['id']:n for n in graph['nodes']}
roster=json.loads((ROOT/'content/field-boss-spawns.json').read_bytes())['fieldBosses']
legends={b['node']:b for b in roster if b['id'].startswith('legend-')}
start=trip.snapshot()
def cleared(save):
    return {b['id'] for b in legends.values() if save['endgame']['bosses'].get(b['id'],{}).get('clears',0)>0}
if not args.from_save:
    assert len(cleared(start))==49

def accept(q):
    hub=quests[q]['hub']
    trip.warp(hub)
    trip.act('story_accept:'+q)

def inspect(point):
    trip.approach(point['x'],point.get('y',480),trip.state.story.node)
    trip.act('story_collect')

def finish(q,arena):
    trip.travel(arena)
    boss=legends[arena]['id']
    enemy=trip.state.fieldSlots[boss].enemy
    trip.fight([enemy],trip.totals(),allow_collateral=True)
    trip.warp(quests[q]['hub'])
    trip.report(q)
    trip.restore()
    assert trip.state.endgame.bosses[boss].clears==1
    print('clear',boss,flush=True)

q='natlan-toyac-electro-crystals'
accept(q)
trip.act('companion:amber')
assert trip.state.companion=='amber'
shore='toyac-electro-crystal-shore'
trip.travel(shore)
trip.act('swap')
for p in nodes[shore]['breakTargets']:
    e=next(e for e in trip.state.enemies.values() if e.id==p['entity'])
    trip.approach(e.x-40,e.y,q)
    trip.tick(1,trip.inputs['right'])
    for _ in range(600):
        if e.hp==0:break
        trip.act('skill1')
        trip.tick(1)
    assert e.hp==0,(p['id'],trip.state.active)
trip.act('swap')
finish(q,'toyac-cocijo-stone-ring')
trip.act('companion:'+start['companion'])

q='natlan-sulfurous-resonant-stones'
accept(q)
trip.travel(quests[q]['target'])
config=nodes[quests[q]['target']]['resonance']
for index in config['order']:
    inspect(config['stones'][index-1])
finish(q,'night-trial-tlatzacuilotl')

q='natlan-witztli-three-echoes'
accept(q)
bank=quests[q]['target']
trip.travel(bank)
for path in quests[q]['paths']:
    first=path['steps'][0]
    trip.travel(first['node'])
    inspect(first)
    trip.travel(bank)
    assert trip.state.story.quests[q].pathProgress[path['id']].count==2
finish(q,'night-trial-ichcahuipilli')

q='ochka-floating-island-spiritway'
accept(q)
shore='ochka-bronzelock-device-shore'
trip.travel(shore)
for point in nodes[shore]['breakTargets']:
    trip.approach(point['x']-40,point['y'],point['id'])
    trip.tick(1,trip.inputs['right'])
    trip.tick(42,trip.lua.table(attack=True))
    assert all(e.id!=point['entity'] or e.hp==0 for e in trip.state.enemies.values())
finish(q,'ochka-bronzelock-island-court')

q='sne-snow-sculptor-bouts'
accept(q)
for index,step in enumerate(quests[q]['itinerary'],1):
    trip.travel(step['node'])
    if step['kind']=='inspect':
        trip.mark(q,index)
    else:
        e=next(e for e in trip.state.enemies.values() if e.spawnId==step['enemy'])
        trip.fight([e],trip.totals(),allow_collateral=True)
    assert trip.state.story.quests[q].count==index
finish(q,'sne-churin-snow-court')

if not trip.state.story.quests['frost-commander-console-test']:
    frostmoon(trip)
trip.restore()
save=trip.snapshot()
if not args.from_save:
    assert cleared(save)=={b['id'] for b in legends.values()}
else:
    arenas = ('toyac-cocijo-stone-ring', 'night-trial-tlatzacuilotl', 'night-trial-ichcahuipilli',
              'ochka-bronzelock-island-court', 'sne-churin-snow-court')
    assert {legends[node]['id'] for node in arenas} <= cleared(save)
assert all(save['endgame']['bosses'][k]['clears']>=v['clears'] for k,v in start['endgame']['bosses'].items())
assert all(trip.state.story.quests[r['quest']].status=='complete' for r in trip.reports)
assert all(save['story']['quests'][key] == record for key, record in start['story']['quests'].items()
           if record['status']=='complete')
new=[dict(id=b['id'],node=b['node'],name=b['name']) for b in legends.values() if b['id'] not in cleared(start)]
route=dict(seed=seed.name,sourceSha256=trip.source,catalog=len(legends),verifiedClears=len(cleared(save)),newClears=new,reports=trip.reports,
           walks=[dict(start=t['start'],path=[s['id'] for s in t['stops']]) for t in trip.itineraries])
for suffix,data in [('save',save),('route',route)]:
    (directory/f'all-legends-expedition-{suffix}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
print(len(cleared(save)), 'local legend victories verified after reload')
