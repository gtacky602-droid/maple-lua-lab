"""Capture both Knave forms and the crimson moon through the weekly desk on an earned save."""
import json
from runtime import ROOT, runtime, native
from savegame import validate_save
from test_earned_branch_quests import Journey

node='knave-crimson-court'
quest='knave-weekly-commission'
uid='boss-29091001'
trip=Journey(ROOT/'evidence/fontaine-revisit-save.json',runtime(),select_traveler=True)
s=trip.state
trip.warp('fontaine-hub')
trip.act('story_accept:'+quest)
trip.act('artifact_fill_basics')
trip.act('hold_ally_fire')
trip.approach(186,480,node)
mode=trip.frame().weeklyDesk.modes[1]
assert mode.available and mode.level==88
level=s.progression.level
trip.act('weekly_start:'+uid+':'+mode.id)
slot=s.weeklySlots[uid]
views={}

def capture(key,pose,tick):
    frame=trip.frame()
    source=trip.core.knaveWeeklyArt[pose].source
    draws=list(frame.draws.values())
    i=next(i for i,d in enumerate(draws) if d.kind=='boss_sprite' and d.source==source)
    body=draws[i]
    def rectangles(commands, colors):
        return [[d.x,d.y,d.w,d.h,d.color,d.opacity or 1] for d in commands
                if d.kind=='rect' and d.color in colors]
    views[key]=dict(node=node,pose=pose,tick=tick,camera=frame.camera,x=body.x,y=body.y,
                    flip=body.flip,height=body.h,platforms=native(frame.platforms),
                    behind=rectangles(draws[:i],{'#752642'}),
                    front=rectangles(draws[i+1:],{'#671e39','#ffe5dc','#ff6575'}))

capture('court','single',0)
for tick in range(1,12001):
    if slot.form==2 and 'frenzy' not in views:
        capture('frenzy','double',tick-1)
    if slot.cast and slot.cast.key=='WK18' and slot.cast.t==126:
        capture('moon','double',tick-1)
    dx=slot.primary.x-trip.actor.x
    move=abs(dx)>62 or dx*trip.actor.dir<0
    attack=slot.form==1 or 'moon' in views
    trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,attack=attack))
    assert s.returns==0
    if slot.waitUntil:break
assert slot.waitUntil and len(views)==3,(slot.form,slot.primary.hp,slot.phase,tick)
assert views['moon']['behind'] and all(len(v['front'])>=4 for v in views.values())
trip.warp('fontaine-hub')
trip.report(quest)
damage=s.damage
assert isinstance(damage,float)
legacy=trip.snapshot()
assert validate_save({**legacy,'damage':damage})['damage']==int(damage)
trip.restore()
assert trip.state.damage==int(damage)
assert trip.state.story.quests[quest].status=='complete' and trip.state.endgame.weekly[uid+':entry'].clears>=1
result=dict(level=level,entryLevel=88,clearTicks=tick,damage=damage,savedDamage=trip.state.damage,views=views)
(ROOT/'evidence/knave-access-views.json').write_bytes((json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode())
print(level,tick,[(k,v['height'],len(v['behind']),len(v['front'])) for k,v in views.items()])
