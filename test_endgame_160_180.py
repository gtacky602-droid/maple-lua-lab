"""Replay the ordinary Lv160–180 route through real Lua ticks and ordinary loot handling."""
import json

from experience import LEVELS
from runtime import ROOT, runtime

lua,core=runtime()
station='white-pass-station'
maps=[
    ('aurora-ice-cut',861,160),
    ('aurora-ice-shelf',1780,165),
    ('aurora-steam-channel',1810,170),
    ('aurora-mineral-terraces',1790,175),
]
batch=lua.eval("""
function(C,s,seconds,goal)
 local input,startingNode={},s.story.node
 for _=1,seconds*60 do
  if s.progression.level>=goal or s.story.node~=startingNode then return end
  C.step(s,1/60,input)
 end
end
""")


def session(level,node):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,node)
    return s


def go(s,node,x):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,480,0,True
    core.action(s,'story_nearby_portal')
    assert s.story.node==node,(s.story.node,node,s.storyNotice)


def compare_samples():
    samples=[]
    for node,level in [('white-pass-ridge',175),*((node,level) for node,_,level in maps)]:
        s=session(level,node)
        size=len(s.enemies)
        core.action(s,'auto')
        batch(core,s,90,200)
        assert s.story.node==node
        samples.append(dict(node=node,level=level,enemies=size,kills=s.kills,
                            perMinute=round(s.kills/1.5,2),killXp=s.progression.killXp))
    return samples


def rest(s,index,blocked):
    core.action(s,'story_fast:'+station)
    assert s.story.node==station
    if blocked:
        for item in list(s.inventory['items'].values()):
            if item.owner==0 and not item.locked:
                core.action(s,'artifact_sell:'+str(item.id))
        core.action(s,'artifact_recover')
        assert core.canAttack(s)
    if s.active!=1:
        core.action(s,'swap')
    for node,x,_ in maps[:index+1]:
        go(s,node,x)


samples=compare_samples()
print('90-second samples',samples,flush=True)
s=session(160,station)
initial_exp=s.progression.total
inventory_stops,party_rests=0,0
trace=[]
core.action(s,'auto')
for index,(node,x,level) in enumerate(maps):
    go(s,node,x)
    gate_level=maps[index+1][2] if index+1<len(maps) else 180
    began=s.t
    while s.progression.level<gate_level:
        before=s.kills
        batch(core,s,45,gate_level)
        blocked=not core.canAttack(s)
        injured=any(a.hp<=0 for a in s.actors.values()) or s.story.node!=node
        if blocked or injured:
            inventory_stops+=int(blocked)
            party_rests+=int(injured)
            rest(s,index,blocked)
        else:
            assert s.kills>before,(node,s.progression.level,[(a.x,a.y,a.hp) for a in s.actors.values()])
        assert s.t<began+8*3600,(node,s.progression.level)
    result=dict(node=node,unlockedLv=gate_level,simSeconds=round(s.t,2),kills=s.kills,totalExp=s.progression.total)
    trace.append(result)
    print(result,flush=True)

assert not list(s.story.quests.keys())
assert s.progression.total-initial_exp==s.progression.killXp
proof=dict(
    method='Lv160 fixture, built-in auto combat, default pair without gear changes. Ordinary portal positioning is scripted. Storage recovery and sale use game actions. Hunt simulation excludes walking/handling time.',
    samples=samples,trace=trace,level=s.progression.level,simSeconds=round(s.t,2),optionalQuestsCompleted=0,
    usedStoredLootRecovery=inventory_stops,partyRests=party_rests,combatReturns=s.returns,
)
(ROOT/'evidence/endgame-160-180.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Level 180, loot recoveries',inventory_stops,'party rests',party_rests,flush=True)
