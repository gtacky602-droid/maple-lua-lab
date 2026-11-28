import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
boss_id,quest='boss-24090501','overseer-commission'
hub,approach,shelf,arena='natlan-hub','natlan-field','atocpan-lava-field','atocpan-overseer-ruin'
empty=lua.table()
same=lua.eval('rawequal')


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,1


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def enter(state):
    portal(state,1380,'natlan-quarry-road')
    portal(state,64,approach)
    portal(state,1195,shelf)
    portal(state,258,arena)


def make(fixture=False, cryo=False):
    state=core.new(12)
    core.action(state,'story_start')
    level = 140 if fixture or cryo else 112
    core.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    if fixture or cryo:
        core.enterStoryNode(state,'snezhnaya-hub')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK25']
        (ROOT/'work/overseer-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    enter(state)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-94)
    return state,slot,slot.enemy,state.actors[1]


def ticks(state,count=1,inputs=empty):
    for _ in range(count):
        core.step(state,1/60,inputs)


def until(state,slot,move,tick):
    for _ in range(2250):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))


def strike(state,boss,element='physical',**changes):
    hp=boss.hp
    core.resolveCast(state,lua.table_from(dict(id=1,atk=24,x=boss.x,y=480,dir=1,radial=True,range=145,
        limit=2,mult=1,color='#d7f3ff',gain=0,element=element,startedAt=state.t,critRate=0,targetId=boss.id) | changes))
    return hp-boss.hp


state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form)==(112,1125,'hover')
assert math.isclose(boss.hitBottom,480-22-.19*88)
normal=strike(state,boss)
blade=until(state,slot,'FOV01',48)
lane=(blade.lane[1],blade.lane[2])
spot(hero,blade.origin+94)
hp=hero.hp
until(state,slot,'FOV01',119)
assert hero.hp==hp and not blade.seen[1][1]
spot(hero,sum(lane)/2)
until(state,slot,'FOV01',190)
assert hero.hp==hp-17 and blade.seen[2][1] and not blade.seen[3][1]
until(state,slot,'FOV01',265)
assert hero.hp==hp-34 and blade.seen[3][1] and (blade.lane[1],blade.lane[2])==lane

wave=until(state,slot,'FOV02',54)
spot(hero,wave.last)
hp=hero.hp
until(state,slot,'FOV02',107)
assert hero.hp==hp and not wave.seen[1][1] and wave.waveX!=wave.last
until(state,slot,'FOV02',151)
assert math.isclose(wave.waveX,wave.last) and hero.hp==hp-23 and wave.seen[1][1]

hero.hp=hero.maxhp
spot(hero,boss.x-91)
purge=until(state,slot,'FOV03',60)
locked=list(purge.centers.values())
assert all(math.isclose(delta,88*offset) for delta,offset in zip(
    (purge.origin-x for x in locked),(.72,1.72,2.74)))
spot(hero,locked[0])
hp=hero.hp
until(state,slot,'FOV03',109)
assert purge.flow==0
until(state,slot,'FOV03',110)
assert purge.flow==1
assert [d.text for d in core.frame(state,'sprite').draws.values()
        if d.kind=='text' and d.y==501]==['1','2','3']
until(state,slot,'FOV03',173)
assert hero.hp==hp-24 and purge.seen[1][1] and not purge.seen[2][1]
spot(hero,locked[1])
until(state,slot,'FOV03',259)
assert hero.hp==hp-51 and purge.seen[2][1] and not purge.seen[3][1]
spot(hero,locked[2])
until(state,slot,'FOV03',337)
assert purge.flow==5 and purge.seen[3][1] and hero.hp==hp-84
assert locked==list(purge.centers.values())
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert sum(d.source=='overseer-field-poses-source-v1.png' for d in png.draws.values())==2
uncool=purge.damage[3]

state,slot,boss,hero=make(cryo=True)
purge=until(state,slot,'FOV03',300)
assert purge.flow==4
spot(hero,boss.x-92)
assert strike(state,boss,'cryo',reaction=True)==normal and purge.flow==4 and purge.chilled==0
assert strike(state,boss,'cryo',startedAt=purge.openedAt-1/60)==normal
assert purge.flow==4 and purge.chilled==0
hp=boss.hp
assert core.attack(state,hero,'SK25')
assert purge.flow==3 and purge.chilled==72
until(state,slot,'FOV03',322)
assert purge.flow==3 and purge.chilled==50 and boss.form=='cooled' and boss.hp<hp
assert same(boss,slot.enemy) and boss.id==24090501 and len(state.enemies)==1
spot(hero,purge.centers[3])
hero.inv=0
hp=hero.hp
until(state,slot,'FOV03',345)
cooled=purge.damage[3]
assert cooled==27 and uncool==33 and hero.hp==hp-cooled
assert purge.chilled==27 and purge.seen[3][1]

# Cooling neither rolls back an active hit group nor persists into a later cast.
strike(state,boss,'cryo')
assert purge.damage[3]==cooled and purge.flow==2
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
enter(restored)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==boss.hp and fresh.enemy.form=='hover' and fresh.cast is None
until(state,slot,'FOV03',372)
assert boss.form=='recover'
recovery=core.frame(state,'sprite').fieldBoss
assert recovery.recoveryTicks==144 and recovery.flow is None
assert (purge.flow,purge.flowClock,purge.chilled)==(0,0,0)
hp=boss.hp
portal(state,65,shelf)
assert slot.cast is None and boss.form=='hover'
portal(state,258,arena)
assert same(slot.enemy,boss) and boss.hp==hp
spot(hero,boss.x-94)
hero.hp=hero.maxhp
again=until(state,slot,'FOV03',60)
assert again.flow==0 and again.chilled==0
boss.hp=1
kills,mora=state.kills,state.mora
assert strike(state,boss,'cryo')==1 and slot.phase=='respawn' and slot.cast is None
assert strike(state,boss)==0 and state.kills==kills+1 and state.mora==mora+420
assert state.story.quests[quest].count==1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==8200 and restored.mora-mora==540

state,slot,boss,hero=make(cryo=True)
purge=until(state,slot,'FOV03',159)
assert (purge.flow,purge.flowClock)==(1,49)
strike(state,boss,'cryo')
until(state,slot,'FOV03',160)
assert (purge.damage[1],purge.chilled)==(18,71)
until(state,slot,'FOV03',230)
assert (purge.flow,purge.flowClock,purge.chilled)==(0,49,1)
until(state,slot,'FOV03',231)
assert (purge.flow,purge.flowClock,purge.chilled)==(1,0,0)


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(134*60):
        if boss.hp<=0:
            assert moves=={'FOV01','FOV02','FOV03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            assert c.chilled==0
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>83 or (turn and dx>0),
            left=dx<-83 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(threeBladeWindowsOneHitEach=True,waveFixedAndTravels=True,threeFixedPurgeColumns=True,
            thirdPurgeDamage=dict(uncool=uncool,cooled=cooled),multiHitCountsOneCryoCast=True,
            cryoReactionExcluded=True,castStartedBeforePurgeExcluded=True,
            firstFlowTick=110,coolingTicks=72,recoveryTicks=144,
            exitAndSaveClearFlowWithoutResettingHp=True,oneRewardAndSave=True,
            normalAttackWithoutCooling=solo(),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/overseer-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
