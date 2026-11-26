"""Finish the seven remaining local legends on the continuous standard-balance save."""
import json
from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, frostmoon, graph, quests

seed=ROOT/'evidence/quest-legend-expedition-save.json'
trip=Journey(seed,runtime(),select_traveler=True)
nodes={n['id']:n for n in graph['nodes']}
roster=json.loads((ROOT/'content/field-boss-spawns.json').read_bytes())['fieldBosses']
legends={b['node']:b for b in roster if b['id'].startswith('legend-')}
start=trip.snapshot()
def cleared(save):
    return {b['id'] for b in legends.values() if save['endgame']['bosses'].get(b['id'],{}).get('clears',0)>0}
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

frostmoon(trip)
trip.restore()
save=trip.snapshot()
assert cleared(save)=={b['id'] for b in legends.values()}
assert all(save['endgame']['bosses'][k]['clears']>=v['clears'] for k,v in start['endgame']['bosses'].items())
assert all(trip.state.story.quests[r['quest']].status=='complete' for r in trip.reports)
new=[dict(id=b['id'],node=b['node'],name=b['name']) for b in legends.values() if b['id'] not in cleared(start)]
route=dict(seed=seed.name,catalog=len(legends),newClears=new,reports=trip.reports,
           walks=[dict(start=t['start'],path=[s['id'] for s in t['stops']]) for t in trip.itineraries])
for suffix,data in [('save',save),('route',route)]:
    (ROOT/f'evidence/all-legends-expedition-{suffix}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
print('all 56 verified after reload')
