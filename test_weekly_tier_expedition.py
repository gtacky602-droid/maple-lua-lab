"""Clear every ranked weekly tier using the portals and the carried adventure save."""
import json
from experience import resolve_weekly_rewards
from runtime import ROOT, native, runtime
from test_earned_branch_quests import Journey, graph

def write(path, value):
    path.write_bytes((json.dumps(value, ensure_ascii=False, sort_keys=True)+'\n').encode())

source=ROOT/'evidence/stygian-tier-expedition-save.json'
trip=Journey(source,runtime(),select_traveler=True)
seed=trip.snapshot()
first_drop=trip.state.inventory.nextId
fight=trip.lua.execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
weekly=resolve_weekly_rewards(json.loads((ROOT/'content/weekly-boss-spawns.json').read_bytes())['weeklyBosses'])
wins=[]
repeats=[]
for spec in weekly:
    if spec.get('original'):
        continue
    node,key=spec['node'],spec['id']
    origin,gate=next((n['id'],g) for n in graph['nodes'] for g in n['exits'] if g['to']==node)
    hub=next((q['hub'] for q in graph['quests'] if q.get('target')==spec['storyChallenge']),'mond-town')
    tiers=list(enumerate(spec['modes'],1))
    for index,rules in [*tiers,tiers[-1]]:
        if rules['id']=='entry':
            continue
        trip.warp(hub)
        bag=trip.state.inventory
        trip.act('artifact_recover')
        for item in list(bag['items'].values()):
            if item.id>=first_drop and not item.locked and item.owner==0:
                trip.act('artifact_sell:'+str(item.id))
        trip.act('artifact_recover')
        trip.travel(origin)
        trip.approach(gate['x'],gate.get('y',480),node)
        desk=trip.frame().weeklyDesk
        if desk.remaining>0:
            trip.tick(round(desk.remaining*60)+1)
            desk=trip.frame().weeklyDesk
        mode=desk.modes[index]
        assert mode.available and mode.id==rules['id']
        record_key=key+':'+mode.id
        before=trip.snapshot()['endgame']['weekly']
        prior=before.get(record_key,{}).get('clears',0)
        assert prior==0 or (prior==1 and index==len(tiers))
        trip.act('weekly_start:'+record_key)
        s=trip.state
        slot=s.weeklySlots[key]
        assert s.story.node==node and slot.mode.id==mode.id
        xp,mora=s.progression.total,s.mora
        result=native(fight(trip.core,s,slot,'weekly',60*300,'mechanics'))
        assert result['status']=='clear',(record_key,result['status'],result['hpRemaining'])
        delta=[s.progression.total-xp,s.mora-mora]
        expected=[mode.xp,mode.mora] if prior else [mode.xp+mode.firstXp,mode.mora+mode.firstMora]
        assert delta==expected,(record_key,delta,expected)
        trip.restore()
        after=trip.snapshot()
        records=after['endgame']['weekly']
        assert records[record_key]['clears']==prior+1
        assert {k:v for k,v in records.items() if k!=record_key}=={k:v for k,v in before.items() if k!=record_key}
        rows=repeats if prior else wins
        rows.append(dict(id=key,node=node,mode=mode.id,ticks=result['ticks'],xp=delta[0],mora=delta[1]))
        print(spec['controller'],mode.id,result['ticks'],flush=True)
assert set(records)=={s['id']+':'+m['id'] for s in weekly for m in s.get('modes',[])}
assert after['story']['quests']==seed['story']['quests']
assert after['story']['visited']==seed['story']['visited']
assert after['endgame']['stygian']==seed['endgame']['stygian']
assert {i['id'] for i in seed['inventory']['items']}<={i['id'] for i in after['inventory']['items']}
write(ROOT/'evidence/weekly-tier-expedition.json',dict(source=source.name,wins=wins,repeats=repeats))
write(ROOT/'evidence/weekly-tier-expedition-save.json',after)
