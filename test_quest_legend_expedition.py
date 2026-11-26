"""Open local legend arenas through their authored quest itineraries on standard balance."""
import json
from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, graph, quests
def win_arena(quest,hub,node):
    trip.travel(node)
    boss=bosses[node]
    slot=trip.state.fieldSlots[boss['id']]
    xp,mora=trip.state.progression.total,trip.state.mora
    for tick in range(7200):
        if slot.phase=='cleared':
            break
        enemy=slot.enemy
        dx=enemy.x-trip.actor.x
        move=abs(dx)>60 or dx*trip.actor.dir<0
        if tick%45==0: trip.act('skill1')
        if tick%90==0: trip.act('skill2')
        trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,
                                  jump=enemy.y<trip.actor.y-60,attack=True))
        assert trip.state.story.node==node
    assert slot.phase=='cleared',node
    wins.append(dict(node=node,id=boss['id'],name=boss['name'],quest=quest,
                     xp=trip.state.progression.total-xp,mora=trip.state.mora-mora))
    trip.warp(hub)
    trip.restore()
    after=trip.snapshot()
    assert all(after['endgame']['bosses'][k]['clears']>=v['clears'] for k,v in start['endgame']['bosses'].items())
    assert all(after['endgame']['bosses'][win['id']]['clears']==1 and win['xp']>0 and win['mora']>0 for win in wins)
    assert all(trip.state.story.quests[r['quest']].status=='complete' for r in trip.reports)
    print('clear',len(wins),quest,node,flush=True)

seed = ROOT / 'evidence/legend-expedition-save.json'
trip = Journey(seed, runtime(), select_traveler=True)
roster = json.loads((ROOT/'content/field-boss-spawns.json').read_bytes())['fieldBosses']
bosses = {b['node']: b for b in roster if b['id'].startswith('legend-')}
routes = {
    'fon-mapped-bygone-current': ['cineas-legend-chamber'],
    'fon-hidden-lab-access': ['deianeira-legend-lab'],
    'fon-beryl-thermal-vents': ['iron-viscount-legend-pool'],
    'fon-erinnyes-root-water-survey': ['erinnyes-corrouge-cleft'],
    'natlan-rainbow-cave-keys': ['toyac-balachko-inner-cave'],
    'sky-pavilion-notes': ['sky-maha-pavilion-court'],
    'nod-bonemos-offerings': ['nod-sigurd-grave-court'],
    'nod-hiisi-palace-mirrors': ['nod-crab-tsar-palace'],
    'nod-bureau-lift-check': ['nod-raskolnikov-upper-ring'],
    'sne-crystal-stream-survey': ['sne-crystal-tree-refuge'],
    'sne-suspicious-lantern': ['sne-novokichev-ore-yard'],
    'sne-svetloredovka-cavern-check': ['sne-bandersnatch-ice-cavern'],
    'sne-rescue-three-mice': ['sne-ancient-mouse-den'],
}
start = trip.snapshot()
wins = []
for quest, arenas in routes.items():
    q = quests[quest]
    hub = q['hub']
    if trip.state.story.visited[hub]:
        trip.warp(hub)
    else:
        trip.warp('natlan-hub' if hub=='nat-sky-camp' else 'fontaine-hub')
        trip.travel(hub)
    trip.act('story_accept:'+quest)
    for index, step in enumerate(q['itinerary'], 1):
        if step['kind']=='arrive':
            if trip.state.story.node!=step['from']:
                trip.travel(step['from'])
            trip.travel(step['node'])
        else:
            assert step['kind']=='inspect',step
            if trip.state.story.node!=step['node']:
                trip.travel(step['node'])
            if 'reflect' in step:
                trip.approach(step['x'],step['y'],quest)
                for _ in step['reflect']['faces']:
                    trip.act('story_collect')
                    if trip.state.story.quests[quest].count==index:
                        break
            else:
                trip.mark(quest,index)
        assert trip.state.story.quests[quest].count==index
    trip.warp(hub)
    trip.report(quest)
    for node in arenas:
        win_arena(quest,hub,node)

node_names = {node['id']:node['name'] for node in graph['nodes']}
trials = {
    'canopy-square-plateau':'night-trial-cihuacoatl',
    'flower-feather-statue-back-cliff':'night-trial-tupayo',
}
platforms = {n['id']:n.get('platforms',[]) for n in graph['nodes']}
climbs = {}
for host,node in trials.items():
    trip.warp('natlan-hub')
    trip.travel(host)
    steps = [p for p in platforms[host] if p.get('raceRock')]
    for p in steps:
        trip.approach(p['x']+40,p['y'],node)
    climbs[host] = [p['y'] for p in steps]
    win_arena(host,'natlan-hub',node)

guides = {key:dict(name=quests[key]['name'],hub=node_names[quests[key]['hub']],giver=quests[key]['giver'],
                   steps=[step['objective'] for step in quests[key]['itinerary']]) for key in routes}
for host,heights in climbs.items():
    guides[host]=dict(hub=node_names[host],name='夜魂の試練',giver='',steps=[
        node_names[host]+'へ向かう',str(len(heights))+'段の岩棚を順番に登る','上段の柱に触れて試練へ入る'])
for name,data in [('save',trip.snapshot()),('route', dict(seed=seed.name,newClears=wins,guides=guides,climbs=climbs,reports=trip.reports,
    walks=[dict(start=leg['start'],path=[s['id'] for s in leg['stops']]) for leg in trip.itineraries]))]:
    (ROOT/f'evidence/quest-legend-expedition-{name}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
