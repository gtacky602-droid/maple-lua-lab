import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
boss_id,quest='boss-23090101','battleship-commission'
hub,road,arena='nod-town','nod-field','nod-battleship-depot'
empty=lua.table()


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,1


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def enter(state):
    portal(state,60,road)
    portal(state,945,arena)


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[123]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,'natlan-hub')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK21']
        save['loadout'][1]=['SK22']
        (ROOT/'work/battleship-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    enter(state)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-92)
    return state,slot,slot.enemy,state.actors[1]


def ticks(state,count=1,inputs=empty):
    for _ in range(count):
        core.step(state,1/60,inputs)


def until(state,slot,move,tick):
    for _ in range(2400):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))


def cast(state,boss,element,**changes):
    return lua.table_from(dict(id=1,atk=24,x=boss.x,y=480,dir=1,radial=True,range=145,
        limit=4,mult=1,color='#ffddb3',gain=0,element=element,startedAt=state.t,critRate=0,targetId=boss.id) | changes)


def strike(state,boss,element='physical',**changes):
    hp=boss.hp
    core.resolveCast(state,cast(state,boss,element,**changes))
    return hp-boss.hp

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form)==(124,1170,'idle')
normal=strike(state,boss)
saw=until(state,slot,'FBT01',48)
lane=(saw.left,saw.right)
spot(hero,saw.origin+95)
hp=hero.hp
until(state,slot,'FBT01',120)
assert hero.hp==hp and not saw.seen[1][1] and (saw.left,saw.right)==lane
spot(hero,sum(lane)/2)
until(state,slot,'FBT01',129)
assert hero.hp==hp-24 and saw.seen[1][1]

cannons=until(state,slot,'FBT02',56)
centers=list(cannons.centers.values())
assert len(centers)==2
markers=[d for d in core.frame(state,'sprite').draws.values() if d.kind=='text' and d.y==500]
assert [d.text for d in markers]==['1','2']
spot(hero,centers[0])
hp=hero.hp
until(state,slot,'FBT02',129)
assert hero.hp==hp-21 and cannons.seen[1][1] and not cannons.seen[2][1]
spot(hero,centers[1])
hero.inv=0
until(state,slot,'FBT02',197)
assert hero.hp==hp-42 and list(cannons.centers.values())==centers

hero.hp=hero.maxhp
spot(hero,boss.x-90)
opening=until(state,slot,'FBT03',59)
old=cast(state,boss,'physical',x=opening.origin+opening.dir*.60*88,range=18)
ticks(state)
plate=opening.plate
assert opening.tick==60 and opening.plateLayers==5 and boss.heat==boss.iceWard==0
core.resolveCast(state,old)
assert opening.plateLayers==5
assert strike(state,boss,'pyro',x=plate.x,range=18,reaction=True)==0 and opening.plateLayers==5
assert strike(state,boss,x=plate.x,y=350,vertical=12,range=18)==0 and opening.plateLayers==5
assert strike(state,boss,range=18)==normal and opening.plateLayers==5
punch=cast(state,boss,'physical',x=plate.x,range=18)
hp=boss.hp
for _ in range(3): core.resolveCast(state,punch)
assert opening.plateLayers==4 and boss.hp==hp
assert strike(state,boss,'pyro',x=plate.x,range=18)==0 and opening.plateLayers==2
assert strike(state,boss,x=plate.x,range=88)==normal and opening.plateLayers==1
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.thermal is None and png.fieldBoss.coolingPlate.layers==1

until(state,slot,'FBT03',299)
assert strike(state,boss,x=plate.x,range=18)==0 and opening.plateLayers==0
ticks(state)
assert opening.broken==300 and boss.form=='down'
assert core.frame(state).fieldBoss.recoveryTicks==168 and not opening.plate
spot(hero,(opening.left+opening.right)/2)
hp=hero.hp
until(state,slot,'FBT03',467)
assert boss.form=='down' and hero.hp==hp and not opening.seen[1][1]
ticks(state)
assert boss.form=='standing'
until(state,slot,'FBT03',491)
ticks(state)
assert slot.cast is None and boss.form=='idle'

hero.hp=hero.maxhp
spot(hero,boss.x-92)
natural=until(state,slot,'FBT03',60)
spot(hero,(natural.left+natural.right)/2)
hp=hero.hp
until(state,slot,'FBT03',300)
assert natural.plate is None and strike(state,boss,range=18)==normal
until(state,slot,'FBT03',323)
assert hero.hp==hp
ticks(state)
assert hero.hp==hp-33
until(state,slot,'FBT03',360)
assert core.frame(state).fieldBoss.recoveryTicks==144

state,slot,boss,hero=make()
strike(state,boss)
opening=until(state,slot,'FBT03',60)
snapshot=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
enter(restored)
assert restored.fieldSlots[boss_id].enemy.hp==boss.hp and restored.fieldSlots[boss_id].cast is None
hp=boss.hp
portal(state,65,road)
assert slot.cast is None and boss.form=='idle'
portal(state,945,arena)
assert boss.hp==hp
spot(hero,boss.x-92)
hero.hp=hero.maxhp
until(state,slot,'FBT03',60)
boss.hp=1
kills,mora=state.kills,state.mora
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
assert state.kills==kills+1 and state.mora==mora+455
assert state.story.quests[quest].count==1
snapshot=validate_save(native(core.checkpoint(state)))
assert snapshot['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==8800 and restored.mora-mora==590

state,slot,boss,hero=make()
edge=until(state,slot,'FBT03',1)
boss.x=edge.origin=402
spot(hero,350)
until(state,slot,'FBT03',60)
assert edge.reposition and edge.plate is None and edge.left is None
ticks(state,100)
assert boss.x>402 and not edge.seen[1][1]


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(145*60):
        if boss.hp<=0:
            assert moves=={'FBT01','FBT02','FBT03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>83 or (turn and dx>0),
            left=dx<-83 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(fixedSweepAndTwinFrostShots=True,naturalCoolingWithoutHeating=True,plateLayers=5,
            freshDirectHitsOnly=True,plateAndHealthIndependent=True,normalChip=1,pyroChip=2,
            finalAcceptedTick=299,brokenAtTick=300,interruptedRecoveryTicks=168,naturalRecoveryTicks=144,
            dischargeDamage=33,edgeReposition=True,exitAndSaveKeepHp=True,oneRewardAndReport=True,
            normalAttackSolo=solo(),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/battleship-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
