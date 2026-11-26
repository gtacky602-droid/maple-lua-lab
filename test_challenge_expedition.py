"""Carry first wins from the field expedition through the weekly and Stygian gates."""
import json
from runtime import ROOT,native,runtime
from test_earned_branch_quests import Journey,graph

def read(path):return json.loads((ROOT/path).read_bytes())
def write(path,obj):(ROOT/path).write_bytes((json.dumps(obj,ensure_ascii=False,sort_keys=True)+'\n').encode())
weekly=read('content/weekly-boss-spawns.json')['weeklyBosses']
duels=read('content/stygian-matches.json')['matches']
engine=runtime()
fight=engine[0].execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
source='evidence/field-expedition-save.json'
rows=[]
pending=[]
for kind,spec in [('weekly',w) for w in weekly if not w.get('original')]+[('stygian',v|{'id':k}) for k,v in duels.items()]:
    trip=Journey(ROOT/source,engine,select_traveler=True)
    s=trip.state
    node,id=spec['node'],spec['id']
    try:
        if kind=='weekly':
            origin,gate=next((n['id'],g) for n in graph['nodes'] for g in n['exits'] if g['to']==node)
            trip.travel(origin)
            trip.approach(gate['x'],gate.get('y',480),node)
            mode=trip.frame().weeklyDesk.modes[1]
            trip.act('weekly_start:'+id+':'+mode.id)
            encounter=s.weeklySlots[id]
        else:
            trip.travel(spec['hub'])
            trip.cross(node)
            mode=trip.frame().stygianDesk.modes[1]
            trip.act('stygian_start:'+id+':'+mode.id+':troupe')
            encounter=s.endgameRun
        assert mode.available and encounter
        baseline=s.progression.total,s.mora
        result=native(fight(trip.core,s,encounter,kind,60*240,'mechanics'))
        assert result['status']=='clear',(result['status'],result['hpRemaining'])
        delta=[s.progression.total-baseline[0],s.mora-baseline[1]]
        assert delta==[mode.xp+mode.firstXp,mode.mora+mode.firstMora],delta
        trip.restore()
        after=trip.snapshot()
        assert after['endgame'][kind][id+':'+mode.id]['clears']==1
        assert len([b for b in after['endgame']['bosses'].values() if b['clears']])>=49
        source='work/challenge-expedition-progress.json'
        write(source,after)
        rows.append(dict(id=id,name=spec['name'],node=node,kind=kind,mode=mode.id,rewards=delta,seconds=result['elapsed']))
        print('clear',kind,id,mode.id,flush=True)
    except (AssertionError,AttributeError,KeyError) as error:
        pending.append(dict(id=id,node=node,reason=str(error)))
        print('pending',id,str(error)[:150],flush=True)
assert len(rows)==sum(not w.get('original') for w in weekly)+len(duels) and not pending,pending
write('evidence/challenge-expedition-route.json',dict(clears=rows,pending=pending))
write('evidence/challenge-expedition-save.json',read(source))
