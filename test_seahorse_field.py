import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'fontaine-hub', 'fontaine-field', 'seahorse-field-cavern'
boss_id, quest = 'boss-26180101', 'seahorse-commission'
source = 'seahorse-field-poses-source-v1.png'
empty = lua.table()


def spot(actor, x, y=480):
    actor.x,actor.y,actor.vy,actor.inv,actor.ground=x,y,0,0,y==480


def make(fixture=False):
    game=core.new(12)
    core.action(game,'story_start')
    core.grantExp(game,LEVELS[83]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(game,hub)
    core.action(game,'story_accept:'+quest)
    assert game.story.quests[quest].status=='active'
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        saved=validate_save(native(core.checkpoint(game)))
        (ROOT/'work/seahorse-field-fixture.json').write_text(json.dumps(saved),encoding='utf8')
    for x,node in ((1380,approach),(985,arena)):
        spot(game.actors[1],x)
        core.action(game,'story_nearby_portal')
        assert game.story.node==node
    game.actors[2].hp=0
    return game,game.fieldSlots[boss_id],game.actors[1]


def until(game,slot,move,tick):
    for _ in range(1900):
        cast=slot.cast
        if cast and cast.move.id==move and cast.tick==tick:
            return cast
        core.step(game,1/60,empty)
    raise AssertionError((move,tick,slot.phase))


def attack(x,**extra):
    return lua.table_from(dict(id=1,atk=20,x=x,y=480,dir=1,radial=True,range=125,limit=2,mult=1,
                               color='#fff0ac',gain=0,element='physical',critRate=0)|extra)


def hit(game,boss,x,**extra):
    hp=boss.hp
    core.resolveCast(game,attack(x,**extra))
    return hp-boss.hp


game,slot,hero=make(fixture=True)
boss=slot.enemy
spot(hero,boss.x-102)
sweep=until(game,slot,'FSH01',42)
assert sweep.dir==-1 and hit(game,boss,boss.x-45)>0
spot(hero,sweep.origin+105)
hp=hero.hp
until(game,slot,'FSH01',99)
assert hero.hp==hp and sweep.dir==-1
spot(hero,sweep.origin-105)
until(game,slot,'FSH01',102)
assert hero.hp==hp-21
hero.inv=0
until(game,slot,'FSH01',112)
assert hero.hp==hp-21

bolts=until(game,slot,'FSH02',48)
hp=hero.hp
for i,fired in enumerate((90,138),1):
    until(game,slot,'FSH02',fired-1)
    spot(hero,bolts.origin+108)
    until(game,slot,'FSH02',fired)
    assert bolts.projectiles[i].damageElement=='electro' and bolts.dir==-1
    spot(hero,bolts.origin-108)
    until(game,slot,'FSH02',fired+24)
    assert bolts.shots[i] and hero.hp==hp-16*i

spot(hero,boss.x-165)
plunge=until(game,slot,'FSH03',54)
point=boss.weakpoint
origin,dest=plunge.origin,plunge.dest
assert point.hits==0 and point.required==2 and math.isclose(origin-dest,1.5*88)
assert hit(game,boss,boss.x,y=392,vertical=8,element='hydro')>0
assert point.hits==0 and boss.aura.element=='hydro'
expiry=boss.aura.expires
png=core.frame(game,'sprite')
standard,light=(core.frame(game,'rect',p) for p in ('legacy','h32c16'))
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.weakpoint.x==point.x and png.fieldBoss.weakpoint.y==point.y
spot(hero,dest+100)
hp=hero.hp
until(game,slot,'FSH03',114)
assert boss.flying and boss.y==410 and math.isclose(boss.x,(origin+dest)/2)
assert boss.weakpoint is None and boss.aura.expires==expiry
assert hit(game,boss,boss.x)==0 and hit(game,boss,boss.x,y=boss.y)>0
until(game,slot,'FSH03',131)
assert hero.hp==hp
spot(hero,dest)
until(game,slot,'FSH03',138)
assert boss.y==480 and boss.x==dest and hero.hp==hp-24 and plunge.seen[1]
assert plunge.source.damageElement=='electro'
until(game,slot,'FSH03',168)
assert boss.form=='dim' and hit(game,boss,boss.x)>0

spot(hero,boss.x-100)
stopped=until(game,slot,'FSH03',54)
before=boss.hp
point=boss.weakpoint
cast=attack(point.x)
core.resolveCast(game,cast)
first=before-boss.hp
assert first>0 and point.hits==1
core.resolveCast(game,cast)
assert point.hits==1 and boss.hp==before-2*first
assert hit(game,boss,point.x,reaction=True)==first and point.hits==1
assert hit(game,boss,point.x)==first
assert stopped.interrupted and stopped.tick==168 and boss.form=='dim' and boss.weakpoint is None
assert len(game.enemies)==1 and boss.hp==before-4*first
spot(hero,stopped.dest)
hp=hero.hp
until(game,slot,'FSH03',311)
assert boss.form=='dim' and hero.hp==hp and boss.x==stopped.origin and stopped.seen[1] is None
core.step(game,1/60,empty)
assert boss.form=='pearl' and slot.cast is None
boss.hp=1
hit(game,boss,boss.x)
assert slot.phase=='respawn' and game.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(game)))
assert saved['fieldBosses'][boss_id]['waitTicks']==3600
reloaded=core.restore(lua.table_from(saved,recursive=True),12)
xp,mora=reloaded.progression.questXp,reloaded.mora
for _ in range(2):
    core.action(reloaded,'story_report:'+quest)
assert (reloaded.progression.questXp-xp,reloaded.mora-mora)==(5200,370)


def normal_clear(allow_interrupt=True):
    state,fight,player=make()
    enemy=fight.enemy
    start=state.t
    interrupts=0
    jumps={'FSH01':(76,),'FSH02':(79,127),'FSH03':(109,)}
    for _ in range(130*60):
        if enemy.hp<=0:
            return dict(seconds=round(state.t-start,2),hp=player.hp,interrupts=interrupts)
        dx=enemy.x-player.x
        turn=dx*player.dir<0
        cast=fight.cast
        if cast and cast.interrupted and cast.tick==169:
            interrupts+=1
        can_attack=allow_interrupt or not (
            cast and cast.move.id=='FSH03' and 40<=cast.tick<96
        )
        if cast and player.ground and cast.tick in jumps[cast.move.id]:
            core.action(state,'jump')
        core.step(state,1/60,lua.table_from(dict(
            right=dx>106 or (turn and dx>0),left=dx<-106 or (turn and dx<0),
            attack=can_attack and abs(dx)<125 and not turn,jump=True)))
        assert state.returns==0,(state.t,enemy.hp,player.hp)
    raise AssertionError((enemy.hp,player.hp))


no_interrupt=normal_clear(allow_interrupt=False)
assert no_interrupt['interrupts']==0
with_interrupt=normal_clear()
assert with_interrupt['interrupts']>0
result=dict(
    attacks=['FSH01','FSH02','FSH03'],bodyTakesNormalHits=True,twoLockedElectroBolts=True,
    airMovesBodyAndHurtbox=True,auraSurvivesFlight=True,landedElectroHit=True,
    twoDirectCastsStopDive=True,sameCastAndReactionDoNotAdvancePearl=True,oneHpReceiver=True,
    interruptRecoveryTicks=144,noLateLandingAfterInterrupt=True,questReportOnce=True,
    normalAttackSolo=dict(attackPearl=with_interrupt,waitForLanding=no_interrupt),
    commands=dict(png=png.commands,standard=standard.commands,light=light.commands),
    killXp=LEVELS[83]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'],
)
(ROOT/'evidence/seahorse-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
