import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
boss_id,quest='boss-26302101','moongecko-commission'
hub,road,arena='nod-town','nod-field','nod-gecko-depths'
empty=lua.table()


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,1


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def enter(state):
    portal(state,60,road)
    portal(state,1260,arena)


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[131]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,'liyue-harbor')
    core.enterStoryNode(state,'fontaine-hub')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK18']
        save['loadout'][1]=['SK05']
        (ROOT/'work/moongecko-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
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
    for _ in range(2500):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))


def cast(state,target,element='physical',**changes):
    return lua.table_from(dict(id=1,atk=24,x=target.x,y=480,dir=1,radial=True,range=150,
        limit=1,mult=1,color='#ffc440',gain=0,element=element,startedAt=state.t,critRate=0,
        targetId=target.id)|changes)


def strike(state,target,element='physical',**changes):
    hp=target.hp
    core.resolveCast(state,cast(state,target,element,**changes))
    return hp-target.hp


state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form)==(132,1160,'idle')
base=strike(state,boss)
geo_base=strike(state,boss,'geo')
c=until(state,slot,'FMG01',48)
lane=c.left,c.right
spot(hero,c.origin+70)
hp=hero.hp
until(state,slot,'FMG01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2)
until(state,slot,'FMG01',185)
assert hero.hp==hp-21 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'FMG02',56)
locked=c.center
spot(hero,locked+160)
until(state,slot,'FMG02',112)
assert boss.form=='airborne' and boss.y==392 and boss.hitBottom==392
assert strike(state,boss)==0 and strike(state,boss,y=392)==base
spot(hero,locked)
hp=hero.hp
until(state,slot,'FMG02',147)
assert boss.y==480 and boss.x==locked and hero.hp==hp-26 and c.seen[1][1]

c=until(state,slot,'FMG03',60)
spot(hero,boss.x-88)
hero.hp,hero.inv=140,0
until(state,slot,'FMG03',96)
assert hero.hp==128 and state.radiantCocoonEffects[1].bound
until(state,slot,'FMG03',112)
unit=c.summon
assert unit.hp==5 and len(state.enemies)==2
hp,kills,mora=boss.hp,state.kills,state.mora
assert strike(state,unit,startedAt=state.t-2)==0 and unit.hp==5
assert strike(state,unit,reaction=True)==0 and unit.hp==5
repeated=cast(state,unit)
for _ in range(3):
    core.resolveCast(state,repeated)
assert unit.hp==4 and boss.hp==hp
assert strike(state,unit,'geo')==2 and unit.hp==2
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.summon.hp==2
assert len([d for d in png.draws.values() if d.source=='moongecko-field-poses-source-v1.png'])==2
strike(state,unit)
strike(state,unit)
ticks(state)
assert boss.form=='down' and c.broken==113 and c.summon is None and len(state.enemies)==1
assert boss.hp<hp and state.kills==kills and state.mora==mora
assert lua.eval('rawequal')(boss,slot.enemy)
assert math.isclose(core.healActor(state,hero,10),7)
spot(hero,boss.x+300)
assert core.attack(state,hero,'SK18')
ticks(state,180)
assert hero.hp==140 and not state.radiantCocoonEffects[1].bound
geo_escape=strike(state,boss,'geo')
assert geo_escape==math.floor(24*100/105*.6*1.5*1.2)>geo_base
assert boss.geoExposedUntil>state.t
assert not c.seen[1][1]
ticks(state,482)
assert state.radiantCocoonEffects is None and state.t>=boss.geoExposedUntil
assert strike(state,boss,'geo')==geo_base

# The fifth normal cast on the last tick cancels the pending release.
state,slot,boss,hero=make()
c=until(state,slot,'FMG03',112)
unit=c.summon
for _ in range(4):
    strike(state,unit)
until(state,slot,'FMG03',479)
strike(state,unit)
ticks(state)
assert c.broken==480 and boss.form=='down' and not c.seen[1][1]

# Lethal anchor backlash wins once and does not leave a downed live body.
state,slot,boss,hero=make()
c=until(state,slot,'FMG03',112)
for _ in range(5):
    strike(state,c.summon)
boss.hp=1
kills,mora=state.kills,state.mora
ticks(state)
assert slot.phase=='respawn' and slot.cast is None and boss.hp==0 and c.summon is None
assert state.kills==kills+1 and state.mora==mora+495 and state.story.quests[quest].count==1

# Ignoring the anchor leaves a single avoidable, fixed-area release.
state,slot,boss,hero=make()
c=until(state,slot,'FMG03',60)
spot(hero,c.right+60)
until(state,slot,'FMG03',479)
assert c.summon.hp==5 and state.radiantCocoonEffects is None
spot(hero,boss.x)
hp=hero.hp
until(state,slot,'FMG03',495)
assert hero.hp==hp-34 and c.seen[1][1]
until(state,slot,'FMG03',520)
assert c.summon is None and len(state.enemies)==1 and boss.form=='recover'

# Save, exit, death and reporting preserve HP and clean up temporary objects.
state,slot,boss,hero=make()
strike(state,boss)
c=until(state,slot,'FMG03',112)
hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.cast is None and restored.radiantCocoonEffects is None
enter(restored)
assert len(restored.enemies)==1
portal(state,65,road)
assert c.summon is None and slot.cast is None and state.radiantCocoonEffects is None and boss.hp==hp
portal(state,1260,arena)
spot(hero,boss.x-88)
hero.hp=hero.maxhp
c=until(state,slot,'FMG03',112)
boss.hp=1
mora,kills=state.mora,state.kills
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
assert c.summon is None and len(state.enemies)==1 and state.radiantCocoonEffects is None
assert state.kills==kills+1 and state.mora==mora+495 and state.story.quests[quest].count==1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(9600,670)


def solo():
    state,slot,boss,hero=make()
    moves=set()
    interruptions=set()
    for _ in range(200*60):
        if boss.hp<=0:
            assert moves=={'FMG01','FMG02','FMG03'} and state.returns==0 and interruptions
            return dict(seconds=round(state.t,2),hp=hero.hp,anchorInterruptions=len(interruptions))
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if c.broken:
                interruptions.add(round(state.t-c.tick/60,3))
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>82 or (turn and dx>0),
            left=dx<-82 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(twoTailWindowsAndLockedLanding=True,airborneHurtbox=True,distinctCastsBreakAnchor=True,anchorBacklashDealsDamageAndCanDefeat=True,
    previousCastsAndReactionsRejected=True,geoRemovesTwoLayers=True,anchorHasNoKillRewards=True,
    finalTickBreakCancelsRelease=True,fullHealthEscapeLowersGeoResistance=True,
    geoDamage=dict(base=geo_base,escaped=geo_escape),unbrokenAnchorHasOneRelease=True,
    saveExitAndDeathCleanUp=True,oneRewardAndReport=True,normalAttackWithoutHealing=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/moongecko-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
