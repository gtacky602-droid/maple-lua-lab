import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


# The former full-HP escape remains playable through the comparison profile.
lua,core=runtime(draft_balance=True,draft_field_boss_hp=False)
boss_id,quest='boss-26301101','moonfly-commission'
hub,road,arena='nod-town','nod-field','nod-moonfly-hollow'
empty=lua.table()


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,1


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def enter(state):
    portal(state,60,road)
    portal(state,180,arena)


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[129]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,'fontaine-hub')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK18']
        save['loadout'][1]=['SK17']
        (ROOT/'work/moonfly-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    enter(state)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-88)
    return state,slot,slot.enemy,state.actors[1]


def ticks(state,count=1,inputs=empty):
    for _ in range(count):
        core.step(state,1/60,inputs)


def until(state,slot,move,tick):
    for _ in range(2600):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))


def strike(state,boss,element='physical',**changes):
    hp=boss.hp
    cast=lua.table_from(dict(id=1,atk=24,x=boss.x,y=480,dir=1,radial=True,range=150,
        limit=1,mult=1,color='#c9db48',gain=0,element=element,startedAt=state.t,critRate=0,
        targetId=boss.id)|changes)
    core.resolveCast(state,cast)
    return hp-boss.hp


state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form,boss.y)==(130,1050,'idle',444)
base=strike(state,boss)
c=until(state,slot,'FMF01',48)
lane=c.left,c.right
spot(hero,c.origin+70)
hp=hero.hp
until(state,slot,'FMF01',111)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2)
until(state,slot,'FMF01',179)
assert hero.hp==hp-19 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'FMF02',54)
centers=list(c.centers.values())
assert math.isclose(abs(centers[0]-centers[1]),1.3*88)
spot(hero,centers[0])
hp=hero.hp
until(state,slot,'FMF02',125)
assert hero.hp==hp-22 and c.seen[1][1]
spot(hero,centers[1])
until(state,slot,'FMF02',193)
assert hero.hp==hp-44 and c.seen[2][1]

# Begin the light flash at full health and validate independent party effects.
c=until(state,slot,'FMF03',60)
spot(hero,boss.x-88)
hero.hp,hero.inv=hero.maxhp,0
until(state,slot,'FMF03',96)
assert hero.hp==128 and state.radiantCocoonEffects[1].bound
assert state.radiantCocoonEffects[2] is None
bound=strike(state,boss)
assert bound==math.floor(24*100/105*.75)<base
assert math.isclose(core.healActor(state,hero,10),7)
assert hero.hp==135
spot(hero,boss.x+300)
assert core.attack(state,hero,'SK18')
ticks(state,180)
mark=state.radiantCocoonEffects[1]
assert hero.hp==hero.maxhp and not mark.bound
escaped=strike(state,boss)
assert escaped==math.floor(24*100/105*1.2)>base
assert core.frame(state,'sprite','legacy').radiantCocoons[1].bound is False
assert boss.element=='pyro' and boss.pose=='flame'
strike(state,boss,'hydro')
ticks(state)
assert boss.element=='dendro' and boss.pose=='green' and c.source.damageElement=='dendro'
strike(state,boss,'pyro',reaction=True,key='reaction:fixture')
assert boss.element=='dendro'
strike(state,boss,'pyro')
ticks(state)
assert boss.element=='pyro' and boss.pose=='flame' and c.source.damageElement=='pyro'
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert any(d.source=='moonfly-field-poses-source-v1.png' for d in png.draws.values())
assert png.fieldBoss.hp==boss.hp and lua.eval('rawequal')(boss,slot.enemy)
ticks(state,482)
assert state.radiantCocoonEffects is None and strike(state,boss)==base

# Avoiding the initial flash leaves the actor unaffected.
state,slot,boss,hero=make()
c=until(state,slot,'FMF03',60)
spot(hero,c.right+60)
hp=hero.hp
until(state,slot,'FMF03',96)
assert hero.hp==hp and state.radiantCocoonEffects is None
until(state,slot,'FMF03',398)
assert boss.form=='charging' and boss.pose=='cocoon'
spot(hero,boss.x)
hp=hero.hp
until(state,slot,'FMF03',465)
assert hero.hp==hp-25 and c.seen[3][1]
until(state,slot,'FMF03',490)
assert boss.form=='recover' and boss.pose=='down' and boss.y==480

# Healing one affected character leaves the other character's cocoon active.
state,slot,boss,hero=make()
until(state,slot,'FMF03',60)
for a in state.actors.values():
    a.hp,a.inv=a.maxhp,0
    spot(a,boss.x-88)
until(state,slot,'FMF03',96)
assert state.radiantCocoonEffects[1].bound and state.radiantCocoonEffects[2].bound
core.healActor(state,hero,100)
ticks(state)
assert not state.radiantCocoonEffects[1].bound and state.radiantCocoonEffects[2].bound
assert state.actors[2].hp<state.actors[2].maxhp
meal_quest='liyue-harbor-meal'
state.story.quests[meal_quest]=lua.table_from(
    dict(status='complete',count=4,cooking=dict(gathered={},meals=2,flavor='herbal')),recursive=True)
state.active=2
state.actors[2].hp=100
core.action(state,'story_eat_meal:'+meal_quest)
assert math.isclose(state.actors[2].hp,124.5) and state.radiantCocoonEffects[2].bound
core.action(state,'story_eat_meal:'+meal_quest)
assert state.actors[2].hp==140 and not state.radiantCocoonEffects[2].bound
assert state.story.quests[meal_quest].cooking.meals==0

# Saving and exiting cancel the transient effects while preserving boss HP.
state,slot,boss,hero=make()
strike(state,boss)
c=until(state,slot,'FMF03',60)
spot(hero,boss.x-88)
hero.hp,hero.inv=hero.maxhp,0
until(state,slot,'FMF03',96)
hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
assert restored.fieldSlots[boss_id].enemy.hp==hp and restored.radiantCocoonEffects is None
portal(state,65,road)
assert state.radiantCocoonEffects is None and slot.cast is None and boss.hp==hp
portal(state,180,arena)
boss.hp=1
mora=state.mora
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
assert state.radiantCocoonEffects is None and state.story.quests[quest].count==1 and state.mora==mora+485
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(9400,650)


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(200*60):
        if boss.hp<=0:
            assert moves=={'FMF01','FMF02','FMF03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>82 or (turn and dx>0),
            left=dx<-82 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(twoKicksAndMoonlightAreas=True,cocoonOnlyAffectsInRangeLivingActor=True,partyCocoonsHealIndependently=True,
    damage=dict(base=base,bound=bound,escaped=escaped),healingReductionAndHydroSkillEscape=True,cookingHealsAndEscapesThroughStoryAction=True,
    fullHealthEscapeExpires=True,elementSwitchUpdatesSpriteAndDamage=True,
    chargedExplosionOnce=True,exitAndSavePreserveHpAndClearEffects=True,oneRewardAndReport=True,
    normalAttackWithoutHealing=solo(),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/moonfly-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
