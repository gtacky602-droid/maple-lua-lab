"""Follow the atlas from an earned save to five optional encounters and the pressure-door quest."""
import json
from test_earned_branch_quests import Journey, ROOT

locations = json.loads((ROOT/'sources/map-research/sites-fontaine-dry-legends.json').read_bytes())['legends']
quest = 'fon-hidden-lab-access'
hub, cape, cave = 'fontaine-hub', 'fon-wp-55770', 'fon-wp-55768'
trip = Journey('lv165-save.json')
starting_level = trip.state.progression.level
assert starting_level == 165
trip.warp(hub)
assert trip.state.story.quests[quest] is None
trip.act('story_accept:' + quest)
trip.travel(cape)
trip.travel(cave)
assert trip.state.storySwimming and trip.state.story.quests[quest].count == 1
lab = next(row for row in locations if row['prerequisite'] == quest)
trip.confirm_lock(lab['stage'], '依頼')
trip.mark(quest, 2)
trip.travel(cape)
assert trip.state.story.quests[quest].count == 3
trip.warp(hub)
trip.report(quest)

clears = {}
for room in locations:
    boss, node = room['id'], room['stage']
    trip.travel(node)
    assert not trip.state.storySwimming
    slot = trip.state.fieldSlots[boss]
    record = trip.state.endgame.bosses[boss]
    prior = record.clears if record else 0
    start = trip.state.t
    trip.fight([slot.enemy], trip.totals())
    assert trip.state.endgame.bosses[boss].clears == prior + 1
    clears[boss] = dict(node=node, previous=prior, clears=prior+1, seconds=round(trip.state.t-start,2))
    trip.travel(room['host'])
    trip.warp(hub)
trip.restore()
assert trip.state.story.quests[quest].status == 'complete'
assert all(trip.state.endgame.bosses[b].clears == v['clears'] for b,v in clears.items())
proof = trip.proof() | {'draftBalance': True, 'levelAtStart': starting_level, 'clearsAfterReload': clears}
(ROOT/'evidence/earned-fontaine-land-legends.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
print('Five earned clears and the pressure-door quest persisted after reload.')
