"""Follow island, lake and ancient-sea legend routes from an earned level-200 save."""
import json

from test_earned_branch_quests import Journey, ROOT, graph, quests

nodes = {node['id']: node for node in graph['nodes']}
roster = {boss['node']: boss for boss in json.loads((ROOT/'content/field-boss-spawns.json').read_bytes())['fieldBosses']}
trip = Journey('lv200-save.json')
clears = {}
trip.warp('natlan-hub')

def clear_arena(node):
    steps = trip.travel(node)
    gate = steps[-1]
    assert not gate.get('automaticArrival')
    assert any(e['to'] == node and e['x'] == gate['previewX'] and e.get('y',480) == gate.get('previewY',480)
               for e in nodes[gate['from']]['exits'])
    boss = roster[node]['id']
    prior = trip.state.endgame.bosses[boss]
    count = prior.clears if prior else 0
    trip.fight([trip.state.fieldSlots[boss].enemy], trip.totals())
    assert trip.state.fieldSlots[boss].phase == 'cleared'
    clears[boss] = count + 1
    assert trip.state.endgame.bosses[boss].clears == clears[boss]
    trip.travel(gate['from'])

dock = 'ochkanatlan-dock'
quest = 'ochka-floating-island-spiritway'
shore = 'ochka-bronzelock-device-shore'
landing = 'ochka-bronzelock-floating-landing'
trip.travel(dock)
trip.act('story_accept:' + quest)
trip.travel(shore)
targets = nodes[shore]['breakTargets']
assert len(targets) == 2
for index, target in enumerate(targets):
    if index == 1:
        trip.confirm_lock(landing, '二つ')
    trip.approach(target['x']-40, target['y'], target['id'])
    before = trip.totals()
    trip.tick(1,trip.lua.table(right=True))
    trip.tick(42,trip.lua.table(attack=True))
    assert all(enemy.id != target['entity'] or enemy.hp == 0 for enemy in trip.state.enemies.values())
    assert before == trip.totals()
trip.travel(landing)
clear_arena('ochka-bronzelock-island-court')
trip.travel(shore)
trip.warp(dock)
trip.report(quest)
clear_arena('sacred-mountain-east-isle-dais')
sky = 'nat-sky-camp'
quest = 'sky-pavilion-notes'
walk = 'sky-sand-pavilion-walk'
trip.travel(sky)
trip.act('story_accept:' + quest)
trip.travel(walk)
trip.confirm_lock('sky-maha-pavilion-court','マーダヴァ')
for index in (1,2,3):
    trip.mark(quest,index)
clear_arena('sky-maha-pavilion-court')
trip.warp(sky)
trip.report(quest)
trip.warp('mond-town')
trip.travel('dornman-camp')
clear_arena('dorn-churldric-cooking-camp')
trip.warp('fontaine-hub')
sea = 'bygone-camp'
quest = 'fon-mapped-bygone-current'
trip.travel(sea)
trip.act('story_accept:' + quest)
for index, step in enumerate(quests[quest]['itinerary'], 1):
    if step['kind'] == 'arrive':
        assert trip.state.story.node == step['from']
        trip.travel(step['node'])
    else:
        trip.mark(quest, index)
    assert trip.state.story.quests[quest].count == index
trip.warp(sea)
trip.report(quest)
clear_arena('cineas-legend-chamber')
trip.restore()
assert all(trip.state.endgame.bosses[boss].clears == count for boss,count in clears.items())
assert all(trip.state.story.quests[r['quest']].status == 'complete' for r in trip.reports)
proof = trip.proof() | dict(levelAtStart=200, draftBalance=True, clearsAfterReload=clears)
(ROOT/'evidence/earned-island-legends.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
print(f"{sum(len(t['stops']) for t in trip.itineraries)} legs, {len(clears)} clears, {len(trip.reports)} quests")
