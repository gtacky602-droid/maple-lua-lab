"""Run the Lv139-to-160 route with the real combat loop and provisional report rewards."""
import json

from experience import LEVELS
from runtime import ROOT, runtime

lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
seed_exp = LEVELS[138]['maple_reference_total_exp_to_reach']
core.grantExp(state, seed_exp, 'quest')
core.enterStoryNode(state, 'nod-town')
nod, frontier = 'nod-town', 'winter-frontier-switchback'
hub, road, station = 'snezhnaya-hub', 'snezhnaya-field', 'white-pass-station'
cut, woods, ridge, basin = 'white-pass-cut', 'white-pass-woods', 'white-pass-ridge', 'white-rainbow-basin'
main = ['white-pass-ticket', 'white-pass-trail', 'white-pass-summit']
rows=[]
interruptions=[]
rests=0
inventory_stops=0
batch = lua.eval("""
function(C,s,seconds,goal)
 local input={}
 local node=s.story.node
 for _=1,seconds*60 do
  if s.progression.level>=goal or s.story.node~=node then break end
  C.step(s,1/60,input)
 end
end
""")


def press(action):
    core.action(state, action)


def put(x,y=480):
    a=state.actors[state.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(x,node):
    put(x)
    press('story_nearby_portal')
    assert state.story.node==node,(node,state.story.node,state.storyNotice)


def fast(node):
    press('story_fast:'+node)
    assert state.story.node==node,(node,state.story.node,state.storyNotice)


def snap(label):
    p=state.progression
    row=dict(label=label,level=p.level,xp=p.xp,combatAndRideSeconds=round(state.t,2),
             kills=state.kills,returns=state.returns,killExp=p.killXp,reportAndFirstClearExp=p.questXp-seed_exp)
    rows.append(row)
    print(row,flush=True)


def sell_spare_artifacts():
    for id in [item.id for item in state.inventory['items'].values() if item.owner==0 and not item.locked]:
        press('artifact_sell:'+str(id))


def reopen(target):
    global rests,inventory_stops
    recovering=any(a.hp<=0 for a in state.actors.values())
    blocked=not core.canAttack(state)
    fast(nod if target==frontier else hub if target==cut else station)
    if blocked:
        # Use the existing town actions. Ground drops remain real, recoverable items.
        inventory_stops+=1
        sell_spare_artifacts()
        press('artifact_recover')
        sell_spare_artifacts()
        assert core.canAttack(state)
    if state.active!=1: press('swap')
    if target==frontier:
        gate(814,frontier)
    elif target==cut:
        gate(1380,road)
        gate(865,cut)
    else:
        gate(1144,woods)
        if target==ridge:
            gate(1774,ridge)
    if recovering: rests+=1


def hunt(target,level):
    if state.story.node!=target:
        reopen(target)
    if not state.auto: press('auto')
    since=state.t
    while state.progression.level<level:
        assert state.t<since+12*3600,(target,level,state.progression.level)
        kills=state.kills
        batch(core,state,45,level)
        blocked=not core.canAttack(state)
        stalled=state.kills==kills and state.story.node==target and not blocked
        if stalled:
            details={
                'level':state.progression.level,'node':target,'time':round(state.t,2),
                'active':state.active,'auto':state.auto,
                'party':[{key:a[key] for key in ('hp','x','y','lock','channel','ground')} for a in state.actors.values()],
            }
            interruptions.append(details)
            print('Resupply after 45 seconds without kills',details,flush=True)
            assert len(interruptions)<=20,interruptions
        if blocked or stalled or state.story.node!=target or any(a.hp<=0 for a in state.actors.values()):
            reopen(target)
    if state.auto: press('auto')
    snap('earned '+str(level))


def action_at(x,y=480):
    put(x,y)
    press('story_collect')


def accept(id):
    press('story_accept:'+id)
    assert state.story.quests[id] is not None,id


def report(id):
    press('story_report:'+id)
    assert state.story.quests[id].status=='complete',id
    snap(id)


hunt(frontier,140)
at_140=rows[-1]
gate(60,nod)
gate(1380,'snezhnaya-entry')
gate(1380,hub)
hunt(cut,141)
fast(hub)
accept(main[0])
reopen(cut)
action_at(282)
unit=next(e for e in state.enemies.values() if e.spawnId=='white-pass-route-cart')
put(unit.x-42)
press('auto')
for _ in range(30):
    batch(core,state,1,200)
    if state.story.quests[main[0]].count>=2: break
assert state.story.quests[main[0]].count==2
press('auto')
action_at(685,382)
fast(hub)
report(main[0])

hunt(cut,145)
fast(hub)
accept('white-pass-footprints')
reopen(cut)
action_at(440)
action_at(580,382)
fast(hub)
report('white-pass-footprints')
hunt(cut,148)
fast(hub)
gate(800,'white-pass-coach')
batch(core,state,10,200)
assert state.story.node==station
accept(main[1])
gate(1144,woods)
action_at(300)
action_at(1115,382)
action_at(1660)
fast(station)
report(main[1])

hunt(woods,149)
fast(station)
accept('white-pass-footwork')
action_at(450,390)
action_at(670)
report('white-pass-footwork')
hunt(woods,153)
fast(station)
accept('white-pass-rest')
action_at(895)
gate(1144,woods)
action_at(185)
fast(station)
report('white-pass-rest')
hunt(woods,155)
hunt(ridge,156)
fast(station)
accept(main[2])
gate(1144,woods)
gate(1774,ridge)
gate(1774,basin)
put(641)
press('auto')
slot=state.fieldSlots['original-frost-antler']
for _ in range(180):
    batch(core,state,1,200)
    if slot.phase=='respawn' or state.story.node!=basin: break
assert slot.phase=='respawn' and state.story.node==basin,(slot.enemy.hp,state.story.node)
press('auto')
action_at(1380)
fast(station)
report(main[2])
hunt(ridge,160)

path=ROOT/'evidence/white-pass-pacing.json'
path.write_text(json.dumps({
    'method':'One Lv139 fixture. Real party automation, XP and enemy respawn on 60 Hz Lua ticks. Quest and gate positions are set by the test. The party rests at a visited hub if anyone is defeated or kills stall. No subsequent EXP grant, daily or gear injection.',
    'trace':rows,'secondsLv140To160':round(state.t-at_140['combatAndRideSeconds'],2),
    'totalExp':state.progression.total,'seedExp':seed_exp,'stalls':interruptions,
    'partyResupplies':rests,'inventoryStops':inventory_stops,
},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
