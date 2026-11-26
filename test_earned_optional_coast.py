"""Finish the optional coast on the earned save after the forest route was reported."""
import json
from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, quests
from test_coop_local import Client, lab

source = ROOT/'evidence/weekly-tier-expedition-save.json'
trip = Journey(source, runtime(), select_traveler=True)
seed = trip.snapshot()
active = {key for key, q in quests.items() if not q.get('legacyOnly')}
completed = {key for key, row in seed['story']['quests'].items() if row['status'] == 'complete'}
assert completed == active
quest = quests['nod-moon-crossroads']
def progress():
    return trip.state.story.quests[quest['id']]

assert progress().pathProgress.wood.count == 2 and progress().pathProgress.coast.count == 0
trip.warp(quest['hub'])
steps = next(p['steps'] for p in quest['paths'] if p['id'] == 'coast')
coast = steps[0]['node']
trip.travel(coast)
ore = trip.state.inventory.upgradeOre
for index, step in enumerate(steps, 1):
    if index == 3:
        trip.approach(1060, 292, coast)
    trip.approach(step['x'], step['y'], step['name'])
    trip.act('story_collect')
    assert progress().pathProgress.coast.count == index
    assert progress().status == 'complete'
    left = trip.state.inventory.upgradeOre
    trip.act('story_collect')
    assert trip.state.inventory.upgradeOre == left
assert left == ore + 2
trip.travel('nod-box-inlet')
trip.warp(quest['hub'])
balance = trip.state.mora, trip.state.progression.total
trip.act('story_report:'+quest['id'])
assert balance == (trip.state.mora, trip.state.progression.total)
trip.restore()
assert progress().pathProgress.coast.count == 3 and progress().pathProgress.wood.count == 2
after = trip.snapshot()
assert all(after['story']['quests'][key]['status']=='complete' for key in active)
assert after['endgame'] == seed['endgame']
assert all(after['story']['visited'].get(k) for k,v in seed['story']['visited'].items() if v)
with lab() as url:
    imported = Client(url).frame(restore=after, checkpoint=True)['checkpoint']
    assert imported['story']['quests'] == after['story']['quests']
    assert imported['story']['visited'] == after['story']['visited']
    assert imported['endgame'] == after['endgame']
report = dict(httpImportVerified=True, source=source.name, sourceSha256=trip.source, currentQuestReports=len(active),
              legacyQuests=sorted(set(quests)-active), optionalSteps=[s['name'] for s in steps],
              oreAward=left-ore, duplicateReportReward=0, endgameRecordsPreserved=True)
for name,data in [('optional-coast-finished-save',after),('optional-coast-finished',report)]:
    (ROOT/f'evidence/{name}.json').write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())
print(report)
