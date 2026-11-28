import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
boss_id,quest='boss-24100101','knuckle-duckle-commission'
hub,road,arena='nod-town','nod-field','nod-duckle-workyard'
empty=lua.table()
same=lua.eval('rawequal')


def spot(actor,x,y=480,dir=1):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,dir


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[121]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK17']
        (ROOT/'work/knuckle-duckle-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    portal(state,60,road)
    portal(state,1110,arena)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-92)
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


def strike(state,enemy,element='physical',**changes):
    hp=enemy.hp
    core.resolveCast(state,lua.table_from(dict(id=1,atk=24,x=enemy.x,y=480,dir=1,radial=True,range=145,
        limit=4,mult=1,color='#fff2b5',gain=0,element=element,startedAt=state.t,critRate=0,targetId=enemy.id) | changes))
    return hp-enemy.hp

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form)==(122,1135,'idle')
normal=strike(state,boss)
punch=until(state,slot,'FDK01',48)
lane=(punch.left,punch.right)
spot(hero,punch.origin+92)
hp=hero.hp
until(state,slot,'FDK01',114)
assert hero.hp==hp and not punch.seen[1][1] and (punch.left,punch.right)==lane
spot(hero,sum(lane)/2)
until(state,slot,'FDK01',182)
assert hero.hp==hp-18 and punch.seen[2][1]

stomp=until(state,slot,'FDK02',60)
dest=stomp.dest
spot(hero,dest+152)
until(state,slot,'FDK02',110)
assert boss.form=='airborne' and math.isclose(boss.x,(stomp.origin+dest)/2)
assert math.isclose(boss.y,480-.83*88) and strike(state,boss)==0
assert strike(state,boss,y=boss.y)==normal
spot(hero,dest)
hp=hero.hp
until(state,slot,'FDK02',127)
assert hero.hp==hp
until(state,slot,'FDK02',143)
assert hero.hp==hp-26 and stomp.seen[1][1] and boss.x==dest and boss.y==480

spot(hero,boss.x-86)
cast=until(state,slot,'FDK03',64)
assert cast.dir==-1 and cast.summons is None
lane=(cast.left,cast.right)
assert strike(state,boss)==normal
until(state,slot,'FDK03',76)
first,second=cast.summons.values()
assert second.x<first.x<boss.x and first.hp==second.hp==16
assert math.isclose(first.x,boss.x-1.3*88) and math.isclose(second.x,boss.x-2.5*88)
assert strike(state,boss)==normal and len(state.enemies)==3
until(state,slot,'FDK03',197)
goal=cast.repairDestination
assert all(math.isclose(unit.x,(start+goal)/2) for unit,start in zip((first,second),cast.repairStarts.values()))
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert sum(d.source=='knuckle-duckle-field-poses-source-v1.png' for d in png.draws.values())==3
assert png.fieldBoss.repairWard is None and png.fieldBoss.repairSequence.arrivalTicks==103
marks=[d for d in png.draws.values() if d.kind=='text' and d.text=='放電']
assert len(marks)==1 and math.isclose(marks[0].x+png.camera,sum(lane)/2)
kills,mora,hp=state.kills,state.mora,boss.hp
assert strike(state,first)==16
until(state,slot,'FDK03',299)
assert cast.defeatedRepairs==1 and not second.resolved and cast.broken is None
ticks(state)
assert second.x==goal and second.resolved=='arrived' and cast.summons is None
assert (state.kills,state.mora,boss.hp)==(kills,mora,hp)
spot(hero,sum(lane)/2)
hero.inv=0
hp=hero.hp
until(state,slot,'FDK03',339)
assert hero.hp==hp
ticks(state)
assert hero.hp==hp-32 and cast.seen[1][1] and (cast.left,cast.right)==lane
until(state,slot,'FDK03',384)
assert core.frame(state).fieldBoss.recoveryTicks==144

# Two eligible hits through the last open tick interrupt the fixed discharge.
state,slot,boss,hero=make()
cast=until(state,slot,'FDK03',76)
first,second=cast.summons.values()
hp,kills,mora=boss.hp,state.kills,state.mora
assert strike(state,first)==16
until(state,slot,'FDK03',299)
assert cast.defeatedRepairs==1 and cast.broken is None
assert strike(state,second)==16
ticks(state)
assert cast.broken==300 and cast.defeatedRepairs==2 and cast.summons is None
assert (boss.hp,state.kills,state.mora)==(hp,kills,mora)
assert core.frame(state).fieldBoss.recoveryTicks==144 and strike(state,boss)==normal
spot(hero,cast.dest)
hp=hero.hp
until(state,slot,'FDK03',443)
assert boss.form=='down' and hero.hp==hp and not cast.seen[1][1]
until(state,slot,'FDK03',444)
assert boss.form=='stand'
until(state,slot,'FDK03',467)
ticks(state)
assert boss.form=='idle' and slot.cast is None

# Body HP and paid-clear state persist; live repair units do not survive a reload.
state,slot,boss,hero=make()
strike(state,boss)
cast=until(state,slot,'FDK03',76)
snapshot=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
portal(restored,60,road)
portal(restored,1110,arena)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==boss.hp and fresh.cast is None and len(restored.enemies)==1
hp=boss.hp
portal(state,65,road)
assert cast.summons is None and slot.cast is None
portal(state,1110,arena)
assert boss.hp==hp and len(state.enemies)==1
spot(hero,boss.x-92)
hero.hp=hero.maxhp
cast=until(state,slot,'FDK03',76)
boss.hp=1
kills,mora=state.kills,state.mora
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None and cast.summons is None
assert len(state.enemies)==1 and state.kills==kills+1 and state.mora==mora+445
assert state.story.quests[quest].count==1
snapshot=validate_save(native(core.checkpoint(state)))
assert snapshot['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snapshot,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==8500 and restored.mora-mora==570

# An edge that cannot fit both units starts no attacks or units during the return walk.
state,slot,boss,hero=make()
cast=until(state,slot,'FDK03',1)
boss.x=cast.origin=408
spot(hero,351)
until(state,slot,'FDK03',64)
assert cast.reposition and not cast.left and cast.summons is None
for _ in range(100):
    ticks(state)
    assert cast.summons is None and not cast.seen[1][1]
assert boss.x>408

def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(155*60):
        if boss.hp<=0:
            assert moves=={'FDK01','FDK02','FDK03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>84 or (turn and dx>0),
            left=dx<-84 or (turn and dx<0),attack=abs(dx)<117 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(twoPunchBands=True,lockedJumpAndHurtbox=True,sameSideRepairs=True,mechaHp=16,arrivalsAtTick=300,
            arrivalLeavesBossHpUnchanged=True,damageWithFixedDischarge=32,brokenAtTick=300,recoveryTicks=144,
            defeatsCancelDischarge=True,edgeReposition=True,exitSaveAndKillCleanup=True,oneRewardAndReport=True,
            normalAttackSolo=solo(),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/knuckle-duckle-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
