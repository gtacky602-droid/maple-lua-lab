"""Travel from a previously played save, unlock both sealed approaches and clear all twelve trials."""
import json

from test_earned_branch_quests import Journey, ROOT, graph, quests

hub = 'natlan-hub'
stones = 'natlan-sulfurous-resonant-stones'
lights = 'natlan-witztli-three-echoes'
nodes = {n['id']: n for n in graph['nodes']}
bosses = json.loads((ROOT / 'content/field-boss-spawns.json').read_bytes())['fieldBosses']
trials = [b for b in bosses if any(e.get('nightTotem') == 'return' for e in nodes[b['node']]['exits'])]
assert len(trials) == 12
trip = Journey('lv165-save.json')
assert trip.state.progression.level == 165
trip.warp(hub)
for quest in (stones, lights):
    assert trip.state.story.quests[quest] is None
    trip.act('story_accept:' + quest)

def inspect(spot):
    trip.approach(spot['x'], spot.get('y', 480), trip.state.story.node)
    trip.act('story_collect')

basin = quests[stones]['target']
trip.travel(basin)
trip.confirm_lock('sulfurous-totem-cave', '刻印板')
config = nodes[basin]['resonance']
for index in config['order']:
    inspect(config['stones'][index - 1])
assert trip.state.story.quests[stones].count == 1
bank = quests[lights]['target']
trip.warp(hub)
trip.travel(bank)
trip.confirm_lock('night-trial-ichcahuipilli', '三つの光')
for path in quests[lights]['paths']:
    first = path['steps'][0]
    trip.travel(first['node'])
    inspect(first)
    trip.travel(bank)
    assert trip.state.story.quests[lights].pathProgress[path['id']].count == 2
assert trip.state.story.quests[lights].count == 2

clears = {}
for boss in trials:
    trip.warp(hub)
    arena, name = boss['node'], boss['id']
    entrance = boss['entryThrough'][-1]
    trip.travel(entrance)
    gate = next(e for e in nodes[entrance]['exits'] if e['to'] == arena)
    # Climb the overlapping shelves in order before walking to the pillar.
    height = gate.get('y', 480)
    shelves = sorted(nodes[entrance]['platforms'], key=lambda p: -p['y'])
    for lower, upper in zip(shelves, shelves[1:]):
        if height <= upper['y'] < trip.actor.y:
            left = max(lower['x'], upper['x'])
            right = min(lower['x']+lower['w'], upper['x']+upper['w'])
            assert right > left
            trip.approach((left+right)//2, upper['y'], arena)
    legs = trip.travel(arena)
    assert legs[-1]['from'] == entrance and legs[-1]['mode'] == 'night'
    frame = trip.frame()
    assert frame.story.active and frame.story.node == arena and frame.campaign.zone == 'story:'+arena
    assert (frame.storyScenery or nodes[arena]['scenery']) == 'nightKingdomTrial'
    assert any(p['y'] == trip.actor.y and p['x'] <= trip.actor.x <= p['x']+p['w']
               for p in nodes[arena]['platforms'])
    record = trip.state.endgame.bosses[name]
    previous = record.clears if record else 0
    slot = trip.state.fieldSlots[name]
    trip.fight([slot.enemy], trip.totals())
    assert slot.phase == 'cleared' and trip.state.endgame.bosses[name].clears == previous + 1
    trip.travel(entrance)
    returned = trip.frame()
    assert returned.story.node == entrance
    assert (returned.storyScenery or nodes[entrance]['scenery']) != 'nightKingdomTrial'
    clears[name] = dict(node=arena, entrance=entrance, zone=frame.campaign.zone, clears=previous+1)
    print(arena, flush=True)
trip.warp(hub)
for quest in (stones, lights):
    trip.report(quest)
trip.restore()
assert all(trip.state.story.quests[q].status == 'complete' for q in (stones, lights))
assert all(trip.state.endgame.bosses[b].clears == row['clears'] for b,row in clears.items())
proof = trip.proof() | dict(levelAtStart=165, draftBalance=True, clearsAfterReload=clears)
(ROOT / 'evidence/earned-night-trials.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2)+'\n','utf8')
