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
assert normal>0
punch=until(state,slot,'FDK01',48)
lane=(punch.left,punch.right)
spot(hero,punch.origin+92)
hp=hero.hp
until(state,slot,'FDK01',114)
assert hero.hp==hp and not punch.seen[1][1] and (punch.left,punch.right)==lane
spot(hero,sum(lane)/2)
until(state,slot,'FDK01',182)
assert hero.hp==hp-18 and punch.seen[2][1] and punch.source.damageElement=='physical'

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
assert hero.hp==hp and not stomp.seen[1][1]
until(state,slot,'FDK02',143)
assert hero.hp==hp-26 and stomp.seen[1][1] and boss.x==dest and boss.y==480

spot(hero,boss.x-86)
ward=until(state,slot,'FDK03',39)
assert boss.duckWard==0
until(state,slot,'FDK03',62)
assert boss.duckWard==100 and len(state.enemies)==3
assert same(boss,slot.enemy) and boss.id==24100101
left,right=ward.summons[1],ward.summons[2]
assert left.id!=right.id and left.hp==right.hp==16
assert math.isclose(left.x,boss.x-2*88) and math.isclose(right.x,boss.x+2*88)
assert strike(state,boss)==math.floor(24*100/105*.55) and boss.duckWard==99
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert sum(d.source=='knuckle-duckle-field-poses-source-v1.png' for d in png.draws.values())==3
assert len(png.fieldBoss.summons)==2 and png.fieldBoss.summons[1].id==left.id


def break_unit(unit,dir):
    spot(hero,unit.x-dir*55,dir=dir)
    for _ in range(3):
        assert core.attack(state,hero,'normal')
        ticks(state,38)
        if unit.hp<=0:
            return
    raise AssertionError(unit.hp)


hp,kills,mora=boss.hp,state.kills,state.mora
break_unit(left,1)
assert left.resolved=='destroyed' and boss.duckWard==39 and boss.hp==hp
assert len(state.enemies)==2 and ward.summons[2].hp==16
break_unit(right,-1)
assert boss.duckWard==0 and boss.form=='down' and len(state.enemies)==1
assert state.kills==kills and state.mora==mora and boss.hp==hp
assert ward.broken<340 and ward.summons is None and strike(state,boss)==normal
spot(hero,ward.dest)
hp=hero.hp
until(state,slot,'FDK03',ward.broken+143)
assert boss.form=='down' and hero.hp==hp and not ward.seen[1][1]
until(state,slot,'FDK03',ward.broken+144)
assert boss.form=='stand'
until(state,slot,'FDK03',ward.broken+167)
ticks(state)
assert boss.form=='idle' and slot.cast is None

# One unit completes its repair while the other is destroyed.
state,slot,boss,hero=make()
ward=until(state,slot,'FDK03',65)
left,right=ward.summons[1],ward.summons[2]
assert strike(state,left,atk=6)==5
assert strike(state,left,'lunar',atk=6,key='SK54')==9
assert strike(state,left,atk=6)==2
ticks(state)
assert boss.duckWard==40 and left.resolved=='destroyed'
spot(hero,ward.dest+240)
until(state,slot,'FDK03',331)
assert right.resolved=='arrived' and boss.duckWard==65 and len(state.enemies)==1
spot(hero,ward.dest)
hp=hero.hp
until(state,slot,'FDK03',359)
assert hero.hp==hp-32 and ward.seen[1][1] and ward.source.damageElement=='electro'
until(state,slot,'FDK03',384)
assert boss.duckWard==0 and boss.form=='recover'

hero.hp=hero.maxhp
spot(hero,boss.x-88)
ward=until(state,slot,'FDK03',64)
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
portal(restored,60,road)
portal(restored,1110,arena)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==boss.hp and fresh.enemy.duckWard==0 and fresh.cast is None
hp=boss.hp
portal(state,65,road)
assert boss.duckWard==0 and ward.summons is None and slot.cast is None
portal(state,1110,arena)
assert boss.hp==hp and len(state.enemies)==1
hero.hp=hero.maxhp
spot(hero,boss.x-92)
ward=until(state,slot,'FDK03',64)
boss.hp=1
kills,mora=state.kills,state.mora
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None and ward.summons is None
assert len(state.enemies)==1 and state.kills==kills+1 and state.mora==mora+445
assert state.story.quests[quest].count==1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==8500 and restored.mora-mora==570


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(152*60):
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


result=dict(twoPunchBands=True,lockedJumpAndHurtbox=True,normalAttacksDestroyBothBots=True,
            lunarCastBonus=True,bossHpSeparateFromBarrier=True,survivingBotRestoresWard=True,
            interruptionHasNoShockwave=True,doNothingStillHasFixedAvoidableShockwave=True,
            exitSaveAndKillCleanup=True,oneRewardAndReport=True,normalAttackSolo=solo(),
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/knuckle-duckle-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
