"""Play the Wanderer's daily in the nine optional rooms backed by the field design."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

def read(file):
    return json.loads((ROOT/file).read_text('utf8'))

lua,core=runtime()
quest='daily-sum-elites'
hub='sumeru-hub'
design=next(row for row in read('design/world/quest-bindings.json')['bindings'] if row['design_quest_id']=='Q-SUM-D03')
nodes={n['id']:n for n in read('content/story-graph.json')['nodes']}
spawns=read('content/enemy-spawns.json')['nodes']
rooms=[n['id'] for n in nodes.values() if n['region']=='スメール'
       and nodes.get(n.get('atlasParent'),{}).get('designField') in design['design_field_refs']
       and any(e.get('dailyElite') and not e.get('dailyExclude') for e in spawns.get(n['id'],[]))]
config=next(q for q in read('content/daily-quests.json')['quests'] if q['id']==quest)
assert set(config['filter']['nodes'])=={'sumeru-field','sum-kaveh-timberyard',*rooms}

fight=lua.eval("""function(C,s)
 local target=s.enemies[1]
 local actor=s.actors[s.active]
 for tick=1,7200 do
   local dx=target.x-actor.x
   C.step(s,1/60,{left=dx < -65,right=dx > 65,attack=true})
   if target.hp<=0 then return tick end
   if actor.hp<=0 then break end
 end
 return 0
end""")

def progress(state):
    return next(slot for slot in state.daily.ledger.activeSlots.values() if slot.id==quest)

def resume(state):
    save=validate_save(native(core.checkpoint(state)))
    return core.restore(lua.table_from(save,recursive=True))

report={}
for start in range(0,len(rooms),3):
    state=core.new(12)
    core.action(state,'story_start')
    core.dailyBind(state,'47e2b06f7ae34a4da029360fb7514087',20803,None)
    core.grantExp(state,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    core.action(state,'daily_accept:'+quest)
    parent=nodes[rooms[start]]['atlasParent']
    core.enterStoryNode(state,parent)
    assert core.defeatEnemy(state,state.enemies[1],1) and progress(state).count==0
    for index,room in enumerate(rooms[start:start+3],1):
        core.enterStoryNode(state,room)
        assert len(state.enemies)==1
        ticks=fight(core,state)
        assert ticks and progress(state).count==index,(room,ticks,progress(state).count)
        state=resume(state)
        assert progress(state).count==index
        report[room]={'normalCombatTicks':ticks,'countAfterSaveLoad':index}
    core.enterStoryNode(state,hub)
    core.action(state,'daily_claim:'+quest)
    core.dailySettle(state)
    state=resume(state)
    core.action(state,'daily_claim:'+quest)
    core.dailySettle(state)
    assert (state.daily.paidXp,state.daily.paidMora)==(11990,800)
(ROOT/'evidence/sumeru-daily-spur-elites.json').write_text(json.dumps({'rooms':report,'claimXp':11990,'claimMora':800},indent=2)+'\n','utf8')
print('Nine room clears with normal attacks, ordinary kill exclusions and saved progress / single claims passed.')
