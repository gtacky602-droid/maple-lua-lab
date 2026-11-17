import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'fontaine-hub', 'fontaine-field', 'tulpa-field-grotto'
boss_id, quest = 'boss-20051201', 'tulpa-commission'
source = 'tulpa-field-poses-source-v1.png'
empty = lua.table()


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.inv,actor.ground=x,y,0,0,y==480


def portal(state, x, node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[87]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        saved=validate_save(native(core.checkpoint(state)))
        (ROOT/'work/tulpa-field-fixture.json').write_text(json.dumps(saved),encoding='utf8')
    portal(state,1380,approach)
    portal(state,320,arena)
    state.actors[2].hp=0
    return state,state.fieldSlots[boss_id],state.actors[1]


def until(state,slot,move,tick):
    for _ in range(2200):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        core.step(state,1/60,empty)
    raise AssertionError((move,tick,slot.phase))


def hit(state,enemy,x,element='physical'):
    hp=enemy.hp
    core.resolveCast(state,lua.table_from(dict(id=1,atk=20,x=x,y=480,dir=1,radial=True,range=95,limit=1,mult=1,
                                         color='#fff0ac',gain=0,element=element,critRate=0,targetId=enemy.id)))
    return hp-enemy.hp


state,slot,hero=make(fixture=True)
boss=slot.enemy
spot(hero,boss.x-103)
spear=until(state,slot,'FHT01',48)
assert spear.dir==-1 and hit(state,boss,boss.x-55,'hydro')==0 and hit(state,boss,boss.x-55)>0
hp=hero.hp
spot(hero,boss.x+105)
until(state,slot,'FHT01',100)
assert hero.hp==hp and spear.source.damageElement=='hydro' and spear.dir==-1
spot(hero,boss.x-105)
until(state,slot,'FHT01',107)
assert hero.hp==hp-21 and spear.seen[1][1]

hammer=until(state,slot,'FHT02',54)
points=list(hammer.points.values())
assert math.isclose(abs(points[1]-points[0]),1.32*88)
hp=hero.hp
for i,(x,start) in enumerate(zip(points,(102,156)),1):
    until(state,slot,'FHT02',start-1)
    spot(hero,x)
    assert hero.hp==hp-20*(i-1)
    until(state,slot,'FHT02',start+4)
    assert hero.hp==hp-20*i and hammer.seen[i][1]
assert list(hammer.points.values())==points

spot(hero,boss.x-111)
merge=until(state,slot,'FHT03',54)
summon=merge.summon
assert summon.hp==26 and summon.id!=boss.id and len(state.enemies)==2
assert math.isclose(boss.x-summon.x,2.65*88)
until(state,slot,'FHT03',84)
assert math.isclose(summon.x,merge.summonStart+(boss.x-merge.summonStart)*.25)
png=core.frame(state,'sprite')
standard,light=(core.frame(state,'rect',p) for p in ('legacy','h32c16'))
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.summon.id==summon.id and any(d.source==source and d.h==46 for d in png.draws.values())
before=(boss.hp,state.kills,state.mora,state.progression.killXp,state.story.quests[quest].count)
assert hit(state,summon,summon.x,'hydro')==0
assert hit(state,summon,summon.x)>0 and summon.hp>0
assert hit(state,summon,summon.x)>0 and summon.hp==0
until(state,slot,'FHT03',85)
assert merge.summonStopped and merge.summon is None and len(state.enemies)==1
assert (boss.hp,state.kills,state.mora,state.progression.killXp,state.story.quests[quest].count)==before
spot(hero,boss.x-121)
hp=hero.hp
until(state,slot,'FHT03',205)
assert hero.hp==hp and not merge.absorbed and not merge.seen[1][1]
spot(hero,boss.x-35)
until(state,slot,'FHT03',214)
assert hero.hp==hp-20
until(state,slot,'FHT03',240)
assert boss.form=='settled'

hero.hp=hero.maxhp
spot(hero,boss.x-113)
joined=until(state,slot,'FHT03',54)
half=joined.summon
hp=boss.hp
until(state,slot,'FHT03',173)
assert joined.summon.hp>0 and not joined.absorbed
until(state,slot,'FHT03',174)
assert joined.absorbed and boss.form=='surge' and boss.hp==hp
assert joined.summon is None and half.hp==0 and len(state.enemies)==1
spot(hero,boss.x-121)
hp=hero.hp
until(state,slot,'FHT03',203)
assert hero.hp==hp
until(state,slot,'FHT03',205)
assert hero.hp==hp-28 and joined.seen[1][1]

hero.hp=hero.maxhp
spot(hero,boss.x-110)
pending=until(state,slot,'FHT03',54)
half=pending.summon
boss.hp=1
hit(state,boss,boss.x)
assert pending.summon is None and half.hp==0 and len(state.enemies)==1
assert slot.phase=='respawn' and state.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks']==3600
reloaded=core.restore(lua.table_from(saved,recursive=True),12)
xp,mora=reloaded.progression.questXp,reloaded.mora
for _ in range(2):
    core.action(reloaded,'story_report:'+quest)
assert (reloaded.progression.questXp-xp,reloaded.mora-mora)==(5600,390)

exit_state,exit_slot,exit_hero=make()
spot(exit_hero,exit_slot.enemy.x-101)
exit_cast=until(exit_state,exit_slot,'FHT03',54)
half=exit_cast.summon
assert hit(exit_state,exit_slot.enemy,exit_slot.enemy.x)>0
remaining=exit_slot.enemy.hp
portal(exit_state,65,approach)
assert half.hp==0 and exit_cast.summon is None and exit_slot.cast is None
portal(exit_state,320,arena)
assert len(exit_state.enemies)==1 and exit_slot.enemy.form=='water' and exit_slot.enemy.hp==remaining
spot(exit_hero,exit_slot.enemy.x-102)
deadline=until(exit_state,exit_slot,'FHT03',173)
half=deadline.summon
assert hit(exit_state,half,half.x)>0 and hit(exit_state,half,half.x)>0
core.step(exit_state,1/60,empty)
assert deadline.tick==174 and deadline.summonStopped and not deadline.absorbed


def normal_clear(stop_half):
    state,fight,player=make()
    enemy=fight.enemy
    start=state.t
    absorbed,stopped=0,0
    for _ in range(140*60):
        if enemy.hp<=0:
            return dict(seconds=round(state.t-start,2),hp=player.hp,absorbed=absorbed,stopped=stopped)
        cast=fight.cast
        half=cast and cast.summon
        if cast and cast.tick==174 and cast.move.summon:
            absorbed+=bool(cast.absorbed)
            stopped+=bool(cast.summonStopped)
        target=half if stop_half and half and half.hp>0 else enemy
        closing_on_half=target!=enemy
        dx=target.x-player.x
        move=dx
        turn=abs(dx)>8 and dx*player.dir<0
        should_jump=False
        attack=abs(dx)<(94 if closing_on_half else 125) and not turn
        if cast and cast.move.lock<=cast.tick<cast.move.recover:
            if cast.move.kind=='spear' and cast.tick==76:
                should_jump=True
            elif cast.move.kind=='hammer':
                for x,w in zip(cast.points.values(),cast.move.active.values()):
                    if w[1]-23<=cast.tick<w[2] and abs(player.x-x)<55:
                        move=175 if player.x>=x else -175
                        attack=False
            elif cast.move.summon:
                if stop_half and cast.tick<54:
                    move=cast.summonStart-player.x
                    attack=False
                if not stop_half and 102<=cast.tick<174:
                    attack=False
                should_jump=cast.tick==179
        if should_jump and player.ground:
            core.action(state,'jump')
        core.step(state,1/60,lua.table_from(dict(
            right=move>(58 if closing_on_half else 103) or (turn and move>0),
            left=move<-(58 if closing_on_half else 103) or (turn and move<0),
            attack=attack,jump=True)))
        assert state.returns==0,(state.t,enemy.hp,player.hp)
    raise AssertionError((enemy.hp,player.hp))


prevented,allowed=normal_clear(True),normal_clear(False)
assert prevented['stopped']>0 and allowed['absorbed']>0
result=dict(
    attacks=['FHT01','FHT02','FHT03'],hydroImmunityAndNormalHits=True,fixedSpearAndHammer=True,
    summonHasOwnHp=True,summonMovesToBoss=True,killSummonHasNoRewards=True,
    absorptionDoesNotHeal=True,absorptionChangesSurge=dict(width=[1.8,3.6],damage=[20,28]),
    cleanupOnExitAndBossKill=True,finalTickKillStopsAbsorption=True,questReportOnce=True,
    normalAttackSolo=dict(stopHalf=prevented,allowMerge=allowed),
    commands=dict(png=png.commands,standard=standard.commands,light=light.commands),
    killXp=LEVELS[87]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'],
)
(ROOT/'evidence/tulpa-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
