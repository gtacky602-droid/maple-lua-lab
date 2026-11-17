import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
arena = 'tide-calibration-hall'
boss_id = 'original-tide-surveyor'
quest = 'surveyor-inspection'
idle = lua.table()
spec = next(row for row in json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses']
            if row['id'] == boss_id)


def ticks(state, count=1, **keys):
    inputs = lua.table_from(keys) if keys else idle
    for _ in range(count):
        core.step(state, 1/60, inputs)


def spot(actor, x, y=480, ground=True):
    actor.x, actor.y, actor.vy, actor.ground = x, y, 0, ground


def fixture():
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[29]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, 'liyue-harbor')
    return state


def trial():
    state = fixture()
    hero, ally = state.actors[1], state.actors[2]
    spot(hero,1120)
    core.action(state,'story_nearby_portal')
    assert state.story.node=='liyue-harbor'
    core.action(state,'story_accept:'+quest)
    core.action(state,'story_nearby_portal')
    assert state.story.node==arena
    slot=state.weeklySlots[boss_id]
    ally.hp=0
    hero.inv=0
    spot(hero,400)
    return state, slot, hero


def until(state, slot, move, tick):
    for _ in range(1200):
        if slot.cast and slot.cast.move.id==move and slot.cast.tick==tick:
            return slot.cast
        ticks(state)
    raise AssertionError((move,tick,state.story.node,slot.stage))


def strike(state, boss, damage):
    core.resolveCast(state,lua.table_from(dict(id=1,x=boss.x,y=480,atk=damage,radial=True,range=150,limit=1,
        mult=1,dir=1,element='physical',gain=0,color='#b5ffe9',critRate=0)))


# Attack rectangle is fixed at cast start, including in the visible preview.
state, slot, hero = trial()
cast = until(state,slot,'TS01',1)
left,right = cast.zones[1].left,cast.zones[1].right
spot(hero,600)
until(state,slot,'TS01',53)
assert hero.hp==140 and (cast.zones[1].left,cast.zones[1].right)==(left,right)
info=core.frame(state,'sprite','legacy').weeklyBoss
assert info.zones[1].left==left and info.zones[1].right==right and not info.zones[1].active
ticks(state)
assert hero.hp==140 and slot.marks[1] is None

# An invulnerable player does not receive a mark, and cleanses are actor-specific and grounded.
state,slot,hero=trial()
until(state,slot,'TS01',53)
hero.inv=1
ticks(state,13)
assert hero.hp==140 and slot.marks[1] is None
state,slot,hero=trial()
until(state,slot,'TS01',54)
assert hero.hp==128 and slot.marks[1]>state.t
spot(hero,160,374)
ticks(state)
assert slot.marks[1] is not None
spot(hero,160)
ticks(state)
assert slot.marks[1] is None
assert any(e.kind=='surveyor_cleanse' for e in state.events.values())

# An uncleaned mark adds exactly 12 once. Hit immunity does not consume it.
state,slot,hero=trial()
until(state,slot,'TS02',65)
assert slot.marks[1] is not None
ticks(state)
assert hero.hp==100 and slot.marks[1] is None
ticks(state,20)
assert hero.hp==100
state,slot,hero=trial()
until(state,slot,'TS02',65)
hero.inv=1
ticks(state,13)
assert hero.hp==128 and slot.marks[1] is not None

# Jump a floor wave using normal input.
state,slot,hero=trial()
spot(hero,530)
until(state,slot,'TS03',51)
hp=hero.hp
core.action(state,'jump')
ticks(state,35,jump=True)
assert hero.hp==hp and hero.y<440

# Phase changes occur at action boundaries. Both threshold crossings preserve HP.
state,slot,hero=trial()
until(state,slot,'TS01',20)
strike(state,slot.primary,240)
assert 221<slot.primary.hp<455 and slot.stage==1
until(state,slot,'TS04',1)
assert slot.stage==2
strike(state,slot.primary,250)
assert 0<slot.primary.hp<221
until(state,slot,'TS07',1)
assert slot.stage==3
until(state,slot,'TS08',1)
until(state,slot,'TS09',1)
held=validate_save(native(core.checkpoint(state)))
assert held['weeklyBosses'][boss_id]['hp']==650
before=slot.primary.hp
strike(state,slot.primary,1000)
assert 0<before and slot.phase=='respawn'
assert len(slot.marks)==0 and slot.cast is None and state.kills==1
assert state.story.quests[quest].count==1 and state.mora==340
save=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(save,recursive=True),12)
assert restored.story.node=='liyue-harbor'
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(1800,420)

# Ordinary attacks can finish all three stages with physical movement and no healing.
state,slot,hero=trial()
moves=set()
for _ in range(150*60):
    if slot.phase=='respawn':
        break
    dest=410
    jump=not hero.ground
    cast=slot.cast
    if cast:
        moves.add(cast.move.id)
        for area in cast.zones.values():
            if not area.at-44<=cast.tick<area.untilTick:
                continue
            if area.top>=430 and area.right-area.left>240:
                if hero.ground and cast.tick>=area.at-13:
                    core.action(state,'jump')
                jump=True
            elif area.left-16<dest<area.right+16 and hero.y>area.top:
                dest=min([x for x in [area.left-30,area.right+30] if 20<x<940],
                    key=lambda x:abs(x-hero.x))
    dx=dest-hero.x
    aim=480-hero.x
    turn=abs(aim)>5 and aim*hero.dir<0
    right=dx>7 or abs(dx)<=7 and turn and aim>0
    left=dx<-7 or abs(dx)<=7 and turn and aim<0
    ticks(state,right=right,left=left,jump=jump,attack=abs(aim)<112 and not turn)
    assert state.returns==0
else:
    raise AssertionError((slot.primary.hp,hero.hp,moves))
assert slot.stage==3 and moves==set(spec['moves']) and hero.hp==140
result={'soloSeconds':round(state.t,2),'remainingHp':hero.hp,'movesSeen':sorted(moves),
    'fixedTelegraphs':True,'groundedCleanse':True,'feedbackBonus':12,'invulnerableHitPreservesMark':True,
    'floorWaveJump':True,'threeStageFlow':True,'reportRewardOnce':True,'defeatedCheckpoint':True}
(ROOT/'evidence/tide-surveyor-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
(ROOT/'work/tide-surveyor-fixture.json').write_text(json.dumps(validate_save(native(core.checkpoint(fixture())))),encoding='utf8')
print(result)
