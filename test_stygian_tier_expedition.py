"""Play the remaining Stygian difficulty tiers from the reported adventure checkpoint."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from test_earned_branch_quests import Journey

def save(path, value):
    path.write_bytes((json.dumps(value, ensure_ascii=False, sort_keys=True)+'\n').encode())

matches=json.loads((ROOT/'content/stygian-matches.json').read_bytes())['matches']
parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path)
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
if bool(args.from_save) != bool(args.output_dir):
    parser.error('--from-save and --output-dir must be provided together')
source = args.from_save.resolve() if args.from_save else ROOT/'evidence/remaining-survey-save.json'
directory = args.output_dir or ROOT/'evidence'
directory.mkdir(parents=True, exist_ok=True)
trip=Journey(source,runtime(),select_traveler=True)
fight=trip.lua.execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
seed=trip.snapshot()
first_drop=trip.state.inventory.nextId
bag=trip.state.inventory
sold_before_trials=[]
if len(bag.ground):
    trip.warp(next(iter(matches.values()))['hub'])
    inventory=list(bag['items'].values())
    space_needed=max(0,len(inventory)+len(bag.ground)+3-80)
    spares=sorted((item for item in inventory if item.owner==0 and not item.locked),
                  key=lambda item:(item.rarity,item.itemLv,item.id))
    assert len(spares)>=space_needed
    for item in spares[:space_needed]:
        trip.act('artifact_sell:'+str(item.id))
        sold_before_trials.append(item.id)
wins=[]
for key,spec in matches.items():
    for index,rules in enumerate(spec['modes'],1):
        if rules['id']=='normal':
            continue
        trip.warp(spec['hub'])
        bag=trip.state.inventory
        trip.act('artifact_recover')
        for item in list(bag['items'].values()):
            if item.id>=first_drop and item.owner==0 and not item.locked:
                trip.act('artifact_sell:'+str(item.id))
        trip.act('artifact_recover')
        assert len(bag.ground)==0
        trip.cross(spec['node'])
        mode=trip.frame().stygianDesk.modes[index]
        assert mode.id==rules['id'] and mode.available
        record_key=key+':'+mode.id
        before=trip.snapshot()
        assert record_key not in before['endgame']['stygian']
        trip.act('stygian_start:'+record_key+':troupe')
        state=trip.state
        run=state.endgameRun
        assert run and run.match==key
        xp,mora=state.progression.total,state.mora
        result=native(fight(trip.core,state,run,'stygian',(rules.get('limit',300)+1)*60,'mechanics'))
        assert result['status']=='clear',(record_key,result['status'],result['hpRemaining'])
        assert [state.progression.total-xp,state.mora-mora]==[mode.xp+mode.firstXp,mode.mora+mode.firstMora]
        trip.restore()
        after=trip.snapshot()
        records=after['endgame']['stygian']
        assert records[record_key]['clears']==1
        assert {k:v for k,v in records.items() if k!=record_key}==before['endgame']['stygian']
        assert after['story']['quests']==before['story']['quests']
        wins.append(dict(match=key,mode=mode.id,ticks=result['ticks'],node=spec['node'],
                         xp=mode.xp+mode.firstXp,mora=mode.mora+mode.firstMora))
        print(record_key,result['ticks'],flush=True)
assert set(records)=={key+':'+mode['id'] for key,spec in matches.items() for mode in spec['modes']}
assert after['story']['quests']==seed['story']['quests']
assert after['story']['visited']==seed['story']['visited']
assert {i['id'] for i in seed['inventory']['items']} - set(sold_before_trials) <= {
    i['id'] for i in after['inventory']['items']}
save(directory/'stygian-tier-expedition.json',
     dict(source=source.name,sourceSha256=trip.source,soldBeforeTrials=sold_before_trials,wins=wins))
save(directory/'stygian-tier-expedition-save.json',after)
