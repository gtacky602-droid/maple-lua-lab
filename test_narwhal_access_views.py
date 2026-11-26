"""Capture the whale, inner shadow and weakened whale from one earned Lv85 adventure."""
import json
from runtime import ROOT, native, runtime
from test_earned_branch_quests import Journey

node='narwhal-star-sea'
inner='narwhal-inner-echo'
quest='narwhal-weekly-commission'
boss='boss-29090101'
trip=Journey(ROOT/'evidence/fontaine-narwhal-access-save.json',runtime(),select_traveler=True)
s=trip.state
assert s.progression.level==85
trip.act('story_accept:'+quest)
trip.act('artifact_fill_basics')
trip.act('hold_ally_fire')
trip.approach(700,480,node)
mode=trip.frame().weeklyDesk.modes[1]
assert mode.available and mode.level==84
trip.act('weekly_start:'+boss+':'+mode.id)
w=s.weeklySlots[boss]
views={}
def capture(key,pose,tick):
    frame=trip.frame()
    source=trip.core.narwhalWeeklyArt[pose].source
    body=next(d for d in frame.draws.values() if d.kind=='boss_sprite' and d.source==source)
    views[key]=dict(pose=pose,node=s.story.node,tick=tick,x=body.x,y=body.y,height=body.h,
                    flip=body.flip,camera=frame.camera,platforms=native(frame.platforms))
capture('arrival','whale',0)
for tick in range(1,15001):
    stage=w.stage
    attack=stage in ('inner','weak')
    target=w.shadow if stage=='inner' else w.primary
    dx=target.x-trip.actor.x
    if stage=='inner' and 'inside' not in views:
        capture('inside','shadow',tick-1)
        assert s.story.node==inner
    if stage=='weak' and 'return' not in views:
        capture('return','whale',tick-1)
        assert s.story.node==node
    move=attack and (abs(dx)>65 or dx*trip.actor.dir<0)
    trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,attack=attack))
    assert s.returns==0
    if w.waitUntil:break
assert w.waitUntil and set(views)=={'arrival','inside','return'},(w.stage,w.primary.hp,w.entries,views)
trip.warp('fontaine-hub')
trip.report(quest)
trip.restore()
assert trip.state.story.quests[quest].status=='complete'
assert trip.state.endgame.weekly[boss+':entry'].clears==1
result=dict(level=85,entryLevel=84,clearTicks=tick,views=views)
(ROOT/'evidence/narwhal-access-views.json').write_bytes((json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode())
print(result)
