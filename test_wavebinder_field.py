import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
boss_id,quest='boss-25134601','wavebinder-commission'
hub,road,arena='novokichev-camp','novokichev-depth','wavebinder-tide-cavern'
empty=lua.table()

def spot(a,x,y=480): a.x,a.y,a.vy,a.ground,a.dir=x,y,0,y==480,1

def portal(state,x,node):
    spot(state.actors[1],x);core.action(state,'story_nearby_portal')
    assert state.story.node==node,(state.story.node,node)

def enter(state):
    portal(state,1380,road);portal(state,1030,arena)

def make(fixture=False):
    state=core.new(12);core.action(state,'story_start')
    core.grantExp(state,LEVELS[151]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer';save['loadout'][0]=['SK09'];save['loadout'][1]=['SK22']
        (ROOT/'work/wavebinder-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest);enter(state);state.actors[2].hp=0
    slot=state.fieldSlots[boss_id];spot(state.actors[1],slot.enemy.x-88)
    return state,slot,slot.enemy,state.actors[1]

def ticks(state,count=1,inputs=empty):
    for _ in range(count): core.step(state,1/60,inputs)

def until(state,slot,move,tick,kind=None):
    for _ in range(3000):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick and (not kind or c.move.kind==kind): return c
        ticks(state)
    raise AssertionError((move,tick,kind,slot.phase,slot.enemy.form,state.actors[1].hp))

def cast(state,target,element='physical',**changes):
    return lua.table_from(dict(id=1,atk=24,x=target.x,y=480,dir=1,radial=True,range=150,limit=1,
        mult=1,color='#52e3c1',gain=0,element=element,startedAt=state.t,critRate=0,targetId=target.id)|changes)

def strike(state,target,element='physical',**changes):
    hp=target.hp;core.resolveCast(state,cast(state,target,element,**changes));return hp-target.hp

def rage(state,slot,boss):
    c=until(state,slot,'WB03',220)
    assert boss.valiant and boss.courage==12 and c.drinkClosed
    return c

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.courage,boss.valiant)==(152,1160,0,False)
c=until(state,slot,'WB01',48);lane=c.left,c.right
spot(hero,c.origin+70);hp=hero.hp
until(state,slot,'WB01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2);until(state,slot,'WB01',185)
assert hero.hp==hp-21 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'WB02',54);center=c.center
spot(hero,center+180);hp=hero.hp
until(state,slot,'WB02',139)
assert hero.hp==hp and not c.seen[1][1] and c.center==center
spot(hero,(c.origin+center)/2);until(state,slot,'WB02',217)
assert hero.hp==hp-23 and c.seen[2][1]

# The physical alternative interrupts drinking with four distinct fresh casts.
state,slot,boss,hero=make();c=until(state,slot,'WB03',60)
repeated=cast(state,boss,atk=1)
for _ in range(3):core.resolveCast(state,repeated)
assert c.hits==1
strike(state,boss,'electro',atk=1,reaction=True)
strike(state,boss,'electro',atk=1,startedAt=state.t-1)
assert c.hits==1 and boss.courage==0
strike(state,boss,'electro',atk=1);assert c.hits==3
strike(state,boss,atk=1);ticks(state)
assert slot.cast is None and boss.form=='down' and boss.downReason=='drink' and boss.drinkInterrupts==1
assert boss.courage==0 and not boss.valiant
ticks(state,120);assert boss.form=='idle'

# Electro drains already gained Courage once per cast and also speeds the drink interrupt.
state,slot,boss,hero=make();c=until(state,slot,'WB03',100)
assert boss.courage==4
repeated=cast(state,boss,'electro',atk=1)
for _ in range(3):core.resolveCast(state,repeated)
assert boss.courage==1 and c.hits==2
strike(state,boss,'electro',atk=1);ticks(state)
assert boss.courage==0 and boss.downReason=='drink' and not boss.valiant

# An interrupted drink can retain a partial amount, without losing body damage.
state,slot,boss,hero=make();c=until(state,slot,'WB03',160)
assert boss.courage==8
for _ in range(4):assert strike(state,boss,atk=1)>0
ticks(state);assert boss.courage==8 and not boss.valiant and boss.downReason=='drink'

# An untouched drink fills Courage and selects the stronger three-window attacks.
state,slot,boss,hero=make();c=rage(state,slot,boss)
hp=boss.hp;assert strike(state,boss,atk=1)>0 and boss.hp<hp and boss.courage==12
strike(state,boss,'electro',atk=1,startedAt=state.t-1)
strike(state,boss,'electro',atk=1,reaction=True)
assert boss.courage==12
repeated=cast(state,boss,'electro',atk=1)
for _ in range(3):core.resolveCast(state,repeated)
assert boss.courage==9
c=until(state,slot,'WB01',48)
assert len(c.move.active)==3 and c.move.damage==26
spot(hero,sum((c.left,c.right))/2);hero.hp,hero.inv=140,0
until(state,slot,'WB01',255)
assert hero.hp==62 and all(c.seen[i][1] for i in (1,2,3))

# The stronger throw/pull both fit into the finite Valiant phase.
state,slot,boss,hero=make();rage(state,slot,boss)
c=until(state,slot,'WB01',48);spot(hero,c.origin-c.dir*70);hero.hp=140
c=until(state,slot,'WB02',54)
assert boss.valiant and c.move.damage==29 and len(c.move.active)==2
assert boss.rageAge+161<720,(boss.rageAge,c.tick,hero.hp,boss.courage)
spot(hero,(c.origin+c.center)/2);hero.hp,hero.inv=140,0
until(state,slot,'WB02',215)
assert boss.valiant and hero.hp==82 and c.seen[1][1] and c.seen[2][1]

# Courage naturally empties in 720 ticks, then cancels the current cast and staggers.
state,slot,boss,hero=make();rage(state,slot,boss);spot(hero,boss.x+300);hero.hp=140
ticks(state,719)
assert boss.valiant and boss.courage==1 and boss.rageAge==719
ticks(state)
assert not boss.valiant and boss.courage==0 and boss.form=='down' and boss.downReason=='valiant' and slot.cast is None
ticks(state,180);assert boss.form=='idle'

# A partial Courage meter can refill early; the remaining scheduled sips must not refill rage.
state,slot,boss,hero=make();c=until(state,slot,'WB03',60);boss.courage=8
until(state,slot,'WB03',100)
assert boss.valiant and boss.courage==12 and c.drinkClosed
until(state,slot,'WB03',220)
assert boss.rageAge==120 and boss.courage==10

# Electro can remove the remaining Courage before the next damage window.
state,slot,boss,hero=make();rage(state,slot,boss)
c=until(state,slot,'WB01',103)
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
 [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
spot(hero,sum((c.left,c.right))/2);hero.hp,hero.inv=140,0
for _ in range(4):strike(state,boss,'electro',atk=1)
ticks(state)
assert boss.form=='down' and boss.downReason=='valiant' and slot.cast is None and hero.hp==140

# HP0 beats entering rage or losing Courage, so no attack, stagger or reward repeats.
for active in (False,True):
    state,slot,boss,hero=make()
    if active:rage(state,slot,boss);until(state,slot,'WB01',103);boss.courage=1
    else:until(state,slot,'WB03',219)
    boss.hp=1;hp=hero.hp
    assert strike(state,boss,'electro')==1;ticks(state)
    assert boss.hp==0 and slot.cast is None and slot.phase=='respawn' and hero.hp==hp
    assert state.kills==1 and state.mora==570 and state.story.quests[quest].count==1

# Save/exit keeps HP but clears Courage, drink/anchor casts and temporary rage.
state,slot,boss,hero=make();rage(state,slot,boss);hp=boss.hp
snap=validate_save(native(core.checkpoint(state)));restored=core.restore(lua.table_from(snap,recursive=True),12)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.enemy.courage==0 and not fresh.enemy.valiant and fresh.cast is None
portal(state,65,road)
assert slot.cast is None and boss.courage==0 and not boss.valiant and boss.hp==hp and state.kills==state.mora==0
portal(state,1030,arena);spot(hero,boss.x-88);boss.hp=1;assert strike(state,boss)==1
snap=validate_save(native(core.checkpoint(state)));assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(11200,750)
ticks(restored,3600);fresh=restored.fieldSlots[boss_id]
assert fresh.generation==2 and fresh.enemy.hp==1160 and fresh.enemy.courage==0

def solo(interrupt=True):
    state,slot,boss,hero=make();moves=set();drinkBreaks=rageEnds=0;previous=None
    for _ in range(180*60):
        if boss.hp<=0:
            assert moves=={'WB01','WB02','WB03'} and state.returns==0
            assert (drinkBreaks if interrupt else rageEnds),(state.t,drinkBreaks,rageEnds)
            return dict(seconds=round(state.t,2),hp=hero.hp,drinkInterrupts=drinkBreaks,naturalRageEnds=rageEnds)
        c=slot.cast
        reason=boss.downReason if boss.form=='down' else None
        if reason!=previous:
            if reason=='drink':drinkBreaks+=1
            if reason=='valiant':rageEnds+=1
        previous=reason
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):core.action(state,'jump')
        dx=boss.x-hero.x;turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>72 or turn else 0
        attack=abs(dx)<116 and not turn and (interrupt or not c or c.move.kind!='drink')
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,attack=attack,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(twoFixedAnchorSweeps=True,lockedThrowAndPull=True,physicalFreshDrinkInterrupt=True,
 oldReactionsAndMultiHitExcluded=True,electroDrainsCourageAndSpeedsDrinkInterrupt=True,
 partialDrinkRetainsCourage=True,fullDrinkEntersValiantAndThreeSweeps=True,valiantThrowAndPullBothHit=True,
 natural720TickRageEnd=True,earlyRageDoesNotRefillOnLaterSip=True,
 electroStaggerBeatsNextDamageWindow=True,HPZeroBeatsDrinkAndRageEnd=True,
 saveExitAndOneRewardReportRespawn=True,normalAttackWithoutHealing=solo(),
 physicalWithoutDrinkInterrupt=solo(False),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/wavebinder-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
