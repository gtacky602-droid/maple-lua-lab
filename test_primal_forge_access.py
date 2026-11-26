"""Compare an earned Lv106 loadout with a deliberately paced run through the same weekly gate."""
import json
from runtime import ROOT, native, runtime
from test_earned_branch_quests import Journey

seed=ROOT/'evidence/natlan-forge-access-save.json'
quest='primal-fire-weekly-commission'
node='primal-fire-sundered-forge'
boss='boss-29091101'
engine=runtime()

def enter(paced):
    trip=Journey(seed,engine,select_traveler=True)
    assert trip.state.progression.level==106
    if paced:
        feather=next(i for i in trip.state.inventory['items'].values() if i.owner==1 and i.slot==2)
        trip.act('artifact_remove:'+str(feather.id))
        trip.act('hold_ally_fire')
    trip.act('story_accept:'+quest)
    trip.approach(351,480,node)
    mode=trip.frame().weeklyDesk.modes[1]
    assert mode.available and mode.level==104
    trip.act('weekly_start:'+boss+':'+mode.id)
    return trip,trip.state.weeklySlots[boss]

def snapshot(trip,w):
    frame=trip.frame()
    draws=list(frame.draws.values())
    index=next(i for i,d in enumerate(draws) if d.kind=='boss_sprite' and d.source==trip.core.primalWeeklyArt.idle.source)
    body=draws[index]
    blades=[]
    for d in draws[index+1:]:
        if d.color not in ('#ffc17d','#af4f38','#bd9aff','#7047b2'):break
        blades.append([round(d.x-body.x,3),round(d.y-body.y,3),d.w,d.h,d.color])
    return dict(height=body.h,blades=blades,tick=w.clock,form=frame.weeklyBoss.formName)

def complete(trip):
    assert trip.state.story.quests[quest].count==1
    trip.warp('natlan-hub')
    trip.report(quest)
    trip.restore()
    assert trip.state.story.quests[quest].status=='complete'
    assert trip.state.endgame.weekly[boss+':entry'].clears==1

trip,w=enter(False)
fight=trip.lua.execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
quick=native(fight(trip.core,trip.state,w,'weekly',18000,'mechanics'))
assert quick['status']=='clear' and w.form==1
complete(trip)
trip,w=enter(True)
views={}
for tick in range(18000):
    if w.cast and w.phase=='warning' and w.form==1 and 'flame' not in views:
        views['flame']=snapshot(trip,w)
    if w.form==2 and w.cuts and 'dual' not in views:
        views['dual']=snapshot(trip,w)
        trip.act('hold_ally_fire')
    dx=w.primary.x-trip.actor.x
    attack=tick>75 and (w.primary.hp>w.primary.maxhp*.75 or 'dual' in views)
    trip.tick(1,trip.lua.table(right=dx>70,left=dx< -70,attack=attack))
    if w.waitUntil:break
assert w.waitUntil and w.form==2 and w.cuts>=1
assert len(views['dual']['blades'])==2*len(views['flame']['blades'])>0
assert any(r[-1]=='#bd9aff' for r in views['dual']['blades'])
complete(trip)
out=dict(level=106,entryLevel=104,carriedTicks=quick['ticks'],pacedTicks=tick+1,views=views)
(ROOT/'evidence/primal-forge-access.json').write_bytes((json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n').encode())
print(out['carriedTicks'],out['pacedTicks'],[(v['form'],v['tick'],len(v['blades'])) for v in views.values()])
