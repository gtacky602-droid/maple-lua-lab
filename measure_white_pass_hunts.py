"""Measure the old roads and new hunting maps with the same 90-second Lua input."""
import json

from experience import LEVELS
from runtime import ROOT, runtime

lua, core = runtime()
run = lua.eval("function(C,s) local input={} for _=1,5400 do C.step(s,1/60,input) end end")
old_nod,old_snow='nod-field','snezhnaya-field'
new_front,new_low,new_mid,new_high=(
    'winter-frontier-switchback','white-pass-cut','white-pass-woods','white-pass-ridge')
cases = {
    'original': [(old_nod,139),*((old_snow,level) for level in (140,148,155,159))],
    'new': [(new_front,139),(new_low,140),(new_low,145),(new_mid,148),(new_mid,152),
            (new_high,155),(new_high,159)],
}
results={}
for group,series in cases.items():
    results[group]=[]
    for node,level in series:
        state=core.new(12)
        core.action(state,'story_start')
        core.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
        core.enterStoryNode(state,node)
        core.action(state,'auto')
        enemies=len(state.enemies)
        run(core,state)
        assert state.story.node==node and state.returns==0
        result=dict(node=node,player=level,placed=enemies,kills=state.kills,
            perMinute=round(state.kills*60/state.t,2),killExp=state.progression.killXp,returns=state.returns)
        results[group].append(result)
        print(result)
(ROOT/'evidence/white-pass-hunts.json').write_text(json.dumps({
    'secondsPerSample':90,'input':'Default party and built-in auto combat. No equipment or EXP modifiers.',
    'samples':results,
},indent=2)+'\n',encoding='utf8')
