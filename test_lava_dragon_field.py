import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
boss_id,quest='boss-26270301','lava-dragon-commission'
hub,approach,arena='natlan-hub','natlan-field','atocpan-lava-field'
empty=lua.table()
same=lua.eval('rawequal')


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,1


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[109]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK21']
        save['loadout'][1]=['SK17']
        (ROOT/'work/lava-dragon-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    portal(state,1380,approach)
    portal(state,1195,arena)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-104)
    return state,slot,slot.enemy,state.actors[1]


def ticks(state,count=1,inputs=empty):
    for _ in range(count):
        core.step(state,1/60,inputs)


def until(state,slot,move,tick):
    for _ in range(2200):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))


def direct(state,boss,element,**changes):
    return lua.table_from(dict(id=1,atk=24,x=boss.x,y=480,dir=1,radial=True,range=145,
                               limit=2,mult=1,color='#ffdc9a',gain=0,element=element,
                               startedAt=state.t,critRate=0,targetId=boss.id) | changes)


def strike(state,boss,element='physical',**changes):
    hp=boss.hp
    core.resolveCast(state,direct(state,boss,element,**changes))
    return hp-boss.hp


def center(c,i):
    return (c.bounds[i][1]+c.bounds[i][2])/2


state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form,boss.lavaHeat)==(110,1100,'rock',0)
normal=strike(state,boss)
slam=until(state,slot,'FLD01',48)
area=(slam.bounds[1][1],slam.bounds[1][2])
spot(hero,slam.origin+104)
hp=hero.hp
until(state,slot,'FLD01',116)
assert (slam.bounds[1][1],slam.bounds[1][2])==area and hero.hp==hp
spot(hero,center(slam,1))
until(state,slot,'FLD01',123)
assert hero.hp==hp-22 and slam.seen[1][1] and slam.source.damageElement=='geo'

fissure=until(state,slot,'FLD02',54)
spot(hero,center(fissure,1))
hp=hero.hp
until(state,slot,'FLD02',121)
assert hero.hp==hp-21 and fissure.seen[1][1]
spot(hero,center(fissure,2))
until(state,slot,'FLD02',187)
assert hero.hp==hp-42 and fissure.seen[2][1]

spot(hero,boss.x-86)
hp=boss.hp
assert core.attack(state,hero,'SK21')
ticks(state,25)
assert boss.lavaHeat==1 and boss.form=='rock' and boss.hp<hp
strike(state,boss,'pyro',reaction=True)
assert boss.lavaHeat==1 and boss.form=='rock'
damage=strike(state,boss,'pyro')
assert damage==normal and boss.form=='molten' and boss.lavaHeat==2 and slot.cast is None
assert same(boss,slot.enemy) and len(state.enemies)==1 and boss.id==26270301
assert boss.aura.element=='pyro' and math.isclose(boss.hitBottom,480-.18*88)
hero.hp=hero.maxhp

lunge=until(state,slot,'FLD03',54)
dest=lunge.dest
assert math.isclose(lunge.origin-dest,2.1*88)
spot(hero,dest-20)
hp=hero.hp
until(state,slot,'FLD03',110)
assert boss.x!=lunge.origin and boss.x!=dest and not lunge.seen[1][1]
until(state,slot,'FLD03',133)
assert boss.x==dest and lunge.dest==dest and lunge.seen[1][1]
assert hero.hp==hp-27 and lunge.source.damageElement=='pyro'

spot(hero,boss.x-90)
eruption=until(state,slot,'FLD04',60)
marks=[center(eruption,i) for i in (1,2)]
assert math.isclose(abs(marks[0]-marks[1]),1.5*88)
spot(hero,marks[0])
hp=hero.hp
until(state,slot,'FLD04',137)
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert any(d.source=='lava-dragon-field-poses-source-v1.png' for d in png.draws.values())
assert hero.hp==hp-31 and eruption.seen[1][1] and not eruption.seen[2][1]
spot(hero,marks[1])
until(state,slot,'FLD04',180)
assert marks==[center(eruption,i) for i in (1,2)] and hero.hp==hp-31
until(state,slot,'FLD04',209)
assert hero.hp==hp-62 and eruption.seen[2][1]
hero.hp=hero.maxhp
spot(hero,boss.x-90)
ticks(state,120)
eruption=until(state,slot,'FLD04',180)
spot(hero,center(eruption,2))
x,hp=boss.x,hero.hp
strike(state,boss,'pyro')
assert boss.form=='molten' and boss.lavaHeat==3
strike(state,boss,'pyro')
assert boss.form=='overburn' and boss.lavaHeat==4 and boss.overburnTicks==180
calc_overburn=math.floor(24*100/105*1.25)
assert strike(state,boss)==calc_overburn and calc_overburn>normal
ticks(state,179)
assert boss.form=='overburn' and slot.cast is None and boss.overburnTicks==1
assert hero.hp==hp and not eruption.seen[2][1]
ticks(state)
assert boss.form=='rock' and boss.lavaHeat==0 and boss.x==x

# Cooling uses one increment per successful direct cast, including multi-hit attacks.
state,slot,boss,hero=make()
for _ in range(3):
    strike(state,boss,'pyro')
assert boss.form=='molten' and boss.lavaHeat==3
cast=direct(state,boss,'hydro')
for _ in range(3):
    core.resolveCast(state,cast)
assert boss.form=='molten' and boss.lavaHeat==2
strike(state,boss,'cryo')
assert boss.form=='rock' and boss.lavaHeat==1
for _ in range(3):
    strike(state,boss,'pyro')
assert boss.form=='overburn'
strike(state,boss,'hydro')
assert boss.form=='rock' and boss.lavaHeat==0 and boss.overburnTicks==0

for _ in range(3):
    strike(state,boss,'pyro')
hp=boss.hp
save=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(save,recursive=True),12)
assert restored.story.node==hub
portal(restored,1380,approach)
portal(restored,1195,arena)
saved_boss=restored.fieldSlots[boss_id].enemy
assert saved_boss.hp==hp and saved_boss.form=='rock' and saved_boss.lavaHeat==0
boss.hp=1
kills,mora=state.kills,state.mora
assert strike(state,boss,'pyro')==1 and slot.phase=='respawn' and boss.form=='molten'
assert strike(state,boss)==0 and state.kills==kills+1 and state.mora==mora+410
assert state.story.quests[quest].count==1
save=validate_save(native(core.checkpoint(state)))
assert save['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(save,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==8000 and restored.mora-mora==520


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(130*60):
        assert boss.form=='rock' and boss.lavaHeat==0
        if boss.hp<=0:
            assert moves=={'FLD01','FLD02'} and state.returns==0
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


result=dict(twoFormsOneReceiver=True,normalAttackWithoutHeat=solo(),multiHitAndReactionDedup=True,
            freezeAndCoolWithRealHydroAndCryoHits=True,saveKeepsHpAndResetsHeat=True,
            fixedRockAndMoltenWindows=True,overburnCancelsPendingEruption=True,overburnTicks=180,
            earlyKillOneReward=True,questReportAndSavedCooldown=True,
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/lava-dragon-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
