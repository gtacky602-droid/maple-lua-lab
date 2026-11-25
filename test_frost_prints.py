"""Compare the shelter's display packets at two points in the same earned expedition."""
import json
from runtime import ROOT, native, runtime
from test_earned_branch_quests import Journey
from test_regional_quest_prop_packing import measure

records={}
for source,expected in [('shelter-three-prints',3),('dragonspine',4)]:
    trip=Journey(ROOT/'work/earned-branch-expedition'/f'{source}.json',runtime(),select_traveler=True)
    trip.warp('spine-shelter')
    trip.approach(777,480,'峰下の観測板')
    display=native(trip.frame().storyFrostPrints)
    assert len(display['entries'])==expected and len(display['shape'])==14
    assert [p['ink'] for p in display['entries'][:3]]==['#8199af','#536e91','#24456c']
    if expected==4:
        assert display['entries'][-1]['node']=='spine-trace-ridge'
    packed={p:measure(trip.core,trip.state,p) for p in ('legacy','h48c32','h32c16')}
    assert all(sample['stamps']>sample['batches'] for sample in packed.values())
    trip.approach(375,480,'小屋の入口')
    assert not trip.frame().storyFrostPrints
    records[expected]=packed
(ROOT/'evidence/spine-shelter-packing.json').write_text(json.dumps(records,indent=2)+'\n','utf8')
print(records)
