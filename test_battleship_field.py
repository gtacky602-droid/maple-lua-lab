import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
boss_id,quest='boss-23090101','battleship-commission'
hub,road,arena='nod-town','nod-field','nod-battleship-depot'
empty=lua.table()
same=lua.eval('rawequal')


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
assert (boss.level,boss.hp,boss.form,boss.heat)==(124,1170,'idle',0)
normal=strike(state,boss)
saw=until(state,slot,'FBT01',48)
lane=(saw.left,saw.right)
spot(hero,saw.origin+95)
hp=hero.hp
until(state,slot,'FBT01',122)
assert hero.hp==hp and not saw.seen[1][1] and (saw.left,saw.right)==lane
spot(hero,sum(lane)/2)
until(state,slot,'FBT01',129)
assert hero.hp==hp-24 and saw.seen[1][1] and saw.source.damageElement=='pyro'

fire=until(state,slot,'FBT02',56)
marks=list(fire.centers.values())
assert math.isclose(abs(marks[0]-marks[1]),1.42*88)
spot(hero,marks[0])
hp=hero.hp
until(state,slot,'FBT02',129)
assert hero.hp==hp-21 and fire.seen[1][1] and not fire.seen[2][1]
spot(hero,marks[1])
until(state,slot,'FBT02',197)
assert hero.hp==hp-42 and fire.seen[2][1] and fire.source.damageElement=='cryo'

spot(hero,boss.x-88)
assert core.attack(state,hero,'SK21')
ticks(state,25)
assert boss.heat==1 and boss.iceWard==0
strike(state,boss,'pyro',reaction=True,key='reaction:swirl')
assert boss.heat==1
strike(state,boss,'pyro',reaction=True,key='reaction:burning')
assert boss.heat==2 and boss.iceWard==0
hot=strike(state,boss)
assert hot==math.floor(24*100/105*1.25)>normal
hp=boss.hp
for _ in range(2):
    strike(state,boss,'pyro')
ward=slot.cast
assert boss.hp<hp and same(boss,slot.enemy) and boss.id==23090101
assert boss.heat==4 and boss.iceWard==5 and ward.move.id=='FBT03' and ward.tick==0
assert len(state.enemies)==1 and ward.centers is None
guarded=strike(state,boss)
assert guarded==math.floor(24*100/105*.45)<normal and boss.iceWard==4
until(state,slot,'FBT03',100)
assert boss.heat==3 and boss.iceWard==4
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert any(d.source=='battleship-field-poses-source-v1.png' for d in png.draws.values())
assert '氷バリア' in png.fieldBoss.label

same_cast=cast(state,boss,'pyro')
for _ in range(3):
    core.resolveCast(state,same_cast)
assert boss.iceWard==2
strike(state,boss,'pyro')
assert boss.iceWard==0
ticks(state)
assert boss.form=='down' and ward.broken==101 and boss.heat==0
spot(hero,(ward.left+ward.right)/2)
hp=hero.hp
until(state,slot,'FBT03',268)
assert boss.form=='down' and not ward.seen[1][1] and hero.hp==hp
ticks(state)
assert boss.form=='idle' and slot.cast is None

state,slot,boss,hero=make()
for _ in range(4):
    strike(state,boss,'pyro')
ward=until(state,slot,'FBT03',60)
locked=(ward.left,ward.right)
spot(hero,ward.right+142)
until(state,slot,'FBT03',256)
assert boss.heat==1 and boss.iceWard==5 and (ward.left,ward.right)==locked and not ward.seen[1][1]
spot(hero,sum(locked)/2)
hp=hero.hp
until(state,slot,'FBT03',269)
assert hero.hp==hp-33 and ward.seen[1][1]
until(state,slot,'FBT03',340)
assert boss.heat==0 and boss.iceWard==0 and boss.form=='recover'
until(state,slot,'FBT03',423)
ticks(state)
assert boss.form=='idle' and slot.cast is None

for _ in range(4):
    strike(state,boss,'pyro')
hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
enter(restored)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.enemy.iceWard==fresh.enemy.heat==0 and fresh.cast is None
portal(state,65,road)
assert slot.cast is None and boss.heat==boss.iceWard==0
portal(state,945,arena)
assert boss.hp==hp
for _ in range(4):
    strike(state,boss,'pyro')
boss.hp=1
kills,mora=state.kills,state.mora
assert strike(state,boss,'pyro')==1 and slot.phase=='respawn' and slot.cast is None
assert state.story.quests[quest].count==1 and state.kills==kills+1 and state.mora==mora+455
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==8800 and restored.mora-mora==590


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(145*60):
        assert boss.heat==0 and boss.iceWard==0
        if boss.hp<=0:
            assert moves=={'FBT01','FBT02'} and state.returns==0
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


result=dict(fixedSweepAndTwinFrostShots=True,pyroCastsDeduplicated=True,burningAddsHeat=True,
            sameReceiverAtOverheatAndWard=True,normalTestDamage=dict(base=normal,heated=hot,ward=guarded),
            brokenWardCancelsDischarge=True,unbrokenWardDischargesLocallyAndResets=True,
            exitAndSaveKeepHp=True,oneRewardAndReport=True,normalAttackWithoutHeating=solo(),
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/battleship-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
