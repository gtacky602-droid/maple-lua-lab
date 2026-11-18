import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
arena = 'buried-weaving-room'
boss_id = 'original-twin-shuttle-loom'
quest = 'loom-stopped'
empty = lua.table()
spec = next(row for row in json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses']
            if row['id'] == boss_id)


def step(state, n=1, **keys):
    inputs = lua.table_from(keys) if keys else empty
    for _ in range(n):
        core.step(state, 1/60,inputs)


def place(actor, x, y=480):
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def fixture():
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[33]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,'liyue-harbor')
    return state


def trial():
    state=fixture()
    player,ally=state.actors[1],state.actors[2]
    place(player,1240)
    core.action(state,'story_nearby_portal')
    assert state.story.node=='liyue-harbor'
    core.action(state,'story_accept:'+quest)
    core.action(state,'story_nearby_portal')
    assert state.story.node==arena
    ally.hp=0
    player.inv=0
    return state,state.weeklySlots[boss_id],player


def attack(state, target, atk=80):
    core.resolveCast(state,lua.table_from(dict(id=1,x=target.x,y=480,atk=atk,radial=True,range=135,limit=1,
        targetId=target.id,mult=1,dir=1,element='physical',gain=0,color='#ffc987',critRate=0)))


def wait_for(state, slot, move, tick):
    for _ in range(1500):
        cast=slot.cast
        if cast and cast.move.id==move and cast.tick==tick:
            return cast
        step(state)
    raise AssertionError((move,tick,state.story.node))


state,slot,player=trial()
body=slot.primary
place(player,298)
wait_for(state,slot,'LW01',40)
attack(state,body,1000)
assert body.hp==spec['hp'] and body.invulnerable
left,right=slot.shuttles[1],slot.shuttles[2]
attack(state,left)
assert left.hp==0 and right.hp==spec['shuttleHP']
assert slot.openUntil is None and state.kills==state.mora==0 and state.story.quests[quest].count==0
wait_for(state,slot,'LW01',65)
assert player.hp==140
place(player,662)
wait_for(state,slot,'LW01',106)
assert player.hp==123  # The other shuttle's line remains live.
attack(state,right)
step(state)
assert slot.openUntil and not body.invulnerable and slot.cycle==1 and slot.cast is None
assert state.kills==state.mora==0
info=core.frame(state,'sprite','legacy').weeklyBoss
assert info.openTicks==spec['openTicks'] and info.stage=='open'
attack(state,body,70)
wounded=body.hp
assert 0<wounded<spec['hp']
end=slot.openUntil
step(state,spec['openTicks']-1)
assert slot.openUntil==end and not body.invulnerable
step(state)
assert slot.openUntil is None and body.invulnerable and body.hp==wounded
assert slot.shuttles[1].hp==slot.shuttles[2].hp==spec['shuttleHP']
assert slot.cast.move.id=='LW04' and len(state.enemies)==3
attack(state,body,1000)
assert body.hp==wounded

# Rebuilt shuttles strike the upper platforms, then a separate low pulse hits the center.
player.inv=0
place(player,220,376)
wait_for(state,slot,'LW04',64)
assert player.hp==104
player.inv=0
place(player,480)
wait_for(state,slot,'LW04',126)
assert player.hp==85
place(player,480)
column=wait_for(state,slot,'LW02',1)
place(player,640)
wait_for(state,slot,'LW02',70)
assert player.hp==85 and column.zones[1].left==408
wait_for(state,slot,'LW02',83)
place(player,480)
wait_for(state,slot,'LW03',54)
core.action(state,'jump')
step(state,28,jump=True)
assert player.hp==85 and player.y<438,(player.hp,player.y,player.vy)

# An unfinished save, departure, and return start a new fight.
checkpoint=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(checkpoint,recursive=True),12)
assert restored.story.node=='liyue-harbor' and restored.weeklySlots[boss_id].primary.hp==spec['hp']
place(player,45)
core.action(state,'story_nearby_portal')
assert state.story.node=='liyue-harbor'
place(player,1240)
core.action(state,'story_nearby_portal')
assert slot.primary.hp==spec['hp'] and slot.cycle==0 and slot.shuttles[2].hp==spec['shuttleHP']

# Killing the exposed body pays once. A defeated checkpoint preserves the wait and quest.
step(state,spec['noticeTicks']+1)
attack(state,slot.shuttles[1])
attack(state,slot.shuttles[2])
step(state)
attack(state,slot.primary,1000)
assert slot.phase=='respawn' and state.kills==1 and state.mora==360 and len(state.enemies)==0
assert state.story.quests[quest].count==1
save=validate_save(native(core.checkpoint(state)))
assert save['weeklyBosses'][boss_id]['hp']==0
core.enterStoryNode(state,'tide-calibration-hall')
other_id='original-tide-surveyor'
other=state.weeklySlots[other_id]
assert len(state.enemies)==1 and state.enemies[1].id==other.primary.id
save=validate_save(native(core.checkpoint(state)))
assert save['weeklyBosses'][boss_id]['hp']==0 and save['weeklyBosses'][other_id]['hp']==650
restored=core.restore(lua.table_from(save,recursive=True),12)
assert restored.weeklySlots[boss_id].primary.hp==0 and restored.weeklySlots[other_id].primary.hp==650
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(2100,450)
step(restored,save['weeklyBosses'][boss_id]['waitTicks'])
assert restored.weeklySlots[boss_id].generation==2

# Full normal-attack route. Keyboard movement stays inside the physical arena.
state,slot,player=trial()
seen_moves=set()
for _ in range(170*60):
    if slot.phase=='respawn':
        break
    target=slot.primary
    if not slot.openUntil:
        target=next((part for part in slot.shuttles.values() if part.hp>0),slot.primary)
    dest=max(25,target.x-57)
    jump=not player.ground
    cast=slot.cast
    if cast:
        seen_moves.add(cast.move.id)
        for area in cast.zones.values():
            if area.sourceIndex and slot.shuttles[area.sourceIndex].hp<=0:
                continue
            if not area.at-48<=cast.tick<area.untilTick:
                continue
            if area.top>=422 and area.right-area.left>=170:
                if cast.tick>=area.at-15 and player.ground and area.left-12<player.x<area.right+12:
                    core.action(state,'jump')
                jump=jump or cast.tick>=area.at-15
            elif area.top<400 and player.y>area.top and player.y-50<area.bottom:
                if area.left-16<dest<area.right+16:
                    dest=min([area.left-24,area.right+24],key=lambda x:abs(x-player.x))
    dx=dest-player.x
    aim=target.x-player.x
    turn=abs(aim)>5 and aim*player.dir<0
    step(state,left=dx<-8 or abs(dx)<=8 and turn and aim<0,right=dx>8 or abs(dx)<=8 and turn and aim>0,
         attack=abs(aim)<110 and not turn,jump=jump)
    assert state.returns==0,(seen_moves,state.t,slot.primary.hp,player.hp,slot.cycle)
else:
    raise AssertionError((state.t,slot.primary.hp,player.hp,slot.cycle))
assert slot.cycle>=2 and state.kills==1
data={'closedBodyIgnoresHits':True,'independentShuttles':True,
      'brokenSourceCancelsOnlyItsLine':True,'noPartRewards':True,'openedTicks':spec['openTicks'],
      'upperAndLowerPatterns':True,'fixedColumnAndFloorJump':True,
      'rebuildPreservesBodyHp':True,'defeatAndReportOnce':True,'unfinishedCheckpointRestarts':True,
      'separateWeeklySlotsInOneSave':True,
      'respawnGeneration':2,'solo':{'seconds':round(state.t,2),'hp':player.hp,
      'exposures':slot.cycle,'patternIds':sorted(seen_moves)}}
(ROOT/'evidence/twin-shuttle-loom-lua.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
(ROOT/'work/twin-shuttle-loom-fixture.json').write_text(json.dumps(validate_save(native(core.checkpoint(fixture())))),encoding='utf8')
print(data)
