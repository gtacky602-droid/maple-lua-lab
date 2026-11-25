"""Continue the completed regional chapters through all three Dornman Port quests."""
import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, WIND_QUESTS, quests, windward

source=ROOT/'evidence/regional-chapters-save.json'
trip=Journey(source,runtime(),select_traveler=True)
before=trip.snapshot()
assert trip.state.progression.level==200 and all(q not in before['story']['quests'] for q in WIND_QUESTS)
proof=windward(trip)
after=trip.snapshot()
for q,record in before['story']['quests'].items():
    if record['status']=='complete':
        assert after['story']['quests'][q]==record
assert trip.state.returns==0 and trip.state.progression.level==200
assert after['endgame']['bosses']['original-windward-tower']['clears']>=1
proof.update(designs=[quests[q]['designId'] for q in WIND_QUESTS],level=200,preservedRegionalChapters=64)
for name,data in [('dornman-after-chapters-save',after),('dornman-after-chapters-route',proof)]:
    (ROOT/'evidence'/f'{name}.json').write_bytes((json.dumps(data,sort_keys=True,ensure_ascii=False)+'\n').encode('utf8'))
print(proof['designs'],proof['reports'],proof['battles'])
