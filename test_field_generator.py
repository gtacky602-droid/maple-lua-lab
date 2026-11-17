import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'fontaine-hub', 'fontaine-field', 'field-generator-field-chamber'
boss_id, quest = 'boss-24080101', 'field-generator-commission'
prefix = 'field-generator-field'
empty = lua.table()
held_jump = lua.table_from({'jump':True})


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.inv,actor.ground=x,y,0,0,y==480


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[85]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        saved=validate_save(native(core.checkpoint(state)))
        (ROOT/f'work/{prefix}-fixture.json').write_text(json.dumps(saved),encoding='utf8')
    for x,node in ((1380,approach),(1165,arena)):
        spot(state.actors[1],x)
        core.action(state,'story_nearby_portal')
        assert state.story.node==node
    state.actors[2].hp=0
    return state,state.fieldSlots[boss_id],state.actors[1]


def until(state,slot,move,tick):
    for _ in range(2000):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        core.step(state,1/60,empty)
    raise AssertionError((move,tick,slot.phase))


def hit(state,boss,x):
    hp=boss.hp
    core.resolveCast(state,lua.table_from(dict(id=1,atk=20,x=x,y=480,dir=1,radial=True,range=125,limit=2,mult=1,
                                         color='#fff0ac',gain=0,element='physical',critRate=0)))
    return hp-boss.hp


def jump(state,actor):
    start,top=actor.y,actor.y
    core.action(state,'jump')
    for _ in range(135):
        core.step(state,1/60,held_jump)
        top=min(top,actor.y)
        if actor.ground and top<start:
            return round(start-top,2)
    raise AssertionError('jump did not land')


state,slot,hero=make(fixture=True)
boss=slot.enemy
spot(hero,boss.x-104)
assert core.fieldGravityFactor(state,hero)==1
normal_height=jump(state,hero)
sweep=until(state,slot,'FFG01',42)
assert sweep.dir==-1 and hit(state,boss,boss.x-55)>0
hp=hero.hp
until(state,slot,'FFG01',102)
assert hero.hp==hp-17 and sweep.seen[1][1]
spot(hero,boss.x+104)
until(state,slot,'FFG01',148)
assert sweep.dir==-1 and hero.hp==hp-17
spot(hero,boss.x-104)
until(state,slot,'FFG01',157)
assert hero.hp==hp-34 and sweep.seen[2][1]

stones=until(state,slot,'FFG02',48)
hp=hero.hp
for i,fired in enumerate((84,132),1):
    until(state,slot,'FFG02',fired-1)
    spot(hero,stones.origin+115)
    until(state,slot,'FFG02',fired)
    assert stones.projectiles[i].damageElement=='geo' and stones.dir==-1
    spot(hero,stones.origin-115)
    until(state,slot,'FFG02',fired+25)
    assert stones.shots[i] and hero.hp==hp-18*i

quake=until(state,slot,'FFG03',71)
zone=quake.field
spot(hero,quake.origin-104)
assert core.fieldGravityFactor(state,hero)==1
until(state,slot,'FFG03',72)
assert math.isclose(zone.right-zone.left,6*88) and math.isclose(zone.bottom-zone.top,4*88)
assert core.fieldGravityFactor(state,hero)==zone.factor==.55
spot(hero,zone.left-1)
assert core.fieldGravityFactor(state,hero)==1
spot(hero,zone.left)
assert core.fieldGravityFactor(state,hero)==.55
spot(hero,zone.right+1)
assert core.fieldGravityFactor(state,hero)==1
spot(hero,zone.right,zone.top-1)
assert core.fieldGravityFactor(state,hero)==1
spot(hero,quake.origin-104)
png=core.frame(state,'sprite')
standard,light=(core.frame(state,'rect',p) for p in ('legacy','h32c16'))
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.gravity.left==zone.left and png.fieldBoss.gravity.right==zone.right
midfight=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(midfight,recursive=True),12)
core.enterStoryNode(restored,arena)
assert core.fieldGravityFactor(restored,restored.actors[1])==1 and restored.fieldSlots[boss_id].cast is None
until(state,slot,'FFG03',90)
hp=hero.hp
low_height=jump(state,hero)
assert low_height>=normal_height*1.7 and hero.hp==hp,(normal_height,low_height,hero.hp,hp)
assert not any(bool(group[1]) for group in quake.seen.values())
until(state,slot,'FFG03',215)
assert core.fieldGravityFactor(state,hero)==.55
until(state,slot,'FFG03',216)
assert core.fieldGravityFactor(state,hero)==1 and core.frame(state,'sprite').fieldBoss.gravity is None

spot(hero,boss.x-100)
hero.hp=hero.maxhp
quake=until(state,slot,'FFG03',72)
hero.hp=hero.maxhp
hp=hero.hp
for i,start in enumerate((114,146,178),1):
    until(state,slot,'FFG03',start-1)
    spot(hero,quake.field.left-20)
    until(state,slot,'FFG03',start)
    assert hero.hp==hp-19*(i-1) and not quake.seen[i][1]
    spot(hero,quake.origin-104)
    until(state,slot,'FFG03',start+8)
    assert hero.hp==hp-19*i and quake.seen[i][1]
boss.hp=1
hit(state,boss,boss.x-55)
assert slot.phase=='respawn' and slot.cast is None and core.fieldGravityFactor(state,hero)==1
assert state.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks']==3600
reloaded=core.restore(lua.table_from(saved,recursive=True),12)
xp,mora=reloaded.progression.questXp,reloaded.mora
for _ in range(2):
    core.action(reloaded,'story_report:'+quest)
assert (reloaded.progression.questXp-xp,reloaded.mora-mora)==(5400,380)

exit_state,exit_slot,exit_hero=make()
spot(exit_hero,exit_slot.enemy.x-100)
until(exit_state,exit_slot,'FFG03',72)
assert core.fieldGravityFactor(exit_state,exit_hero)==.55
spot(exit_hero,65)
core.action(exit_state,'story_nearby_portal')
assert exit_state.story.node==approach and exit_slot.cast is None
assert core.fieldGravityFactor(exit_state,exit_hero)==1


def normal_clear(use_jump=False):
    state,fight,player=make()
    enemy=fight.enemy
    start=state.t
    for _ in range(150*60):
        if enemy.hp<=0:
            return dict(seconds=round(state.t-start,2),hp=player.hp)
        dx=enemy.x-player.x
        turn=dx*player.dir<0
        left=dx<-105 or (turn and dx<0)
        right=dx>105 or (turn and dx>0)
        attack=abs(dx)<125 and not turn
        cast=fight.cast
        if cast and cast.move.lock<=cast.tick<cast.move.recover:
            if cast.field and cast.tick<188:
                if use_jump:
                    if player.ground and cast.tick==90:
                        core.action(state,'jump')
                else:
                    goal=cast.field.left-16 if player.x<enemy.x else cast.field.right+16
                    left,right,attack=player.x>goal+4,player.x<goal-4,False
            elif not cast.field:
                goal=enemy.x-cast.dir*97
                movement=goal-player.x
                if abs(movement)>8 or turn:
                    left,right=(movement<0,movement>0) if abs(movement)>8 else (dx<0,dx>0)
                attack=attack and dx*cast.dir>=0
        core.step(state,1/60,lua.table_from(dict(left=left,right=right,attack=attack,jump=use_jump)))
        assert state.returns==0,(state.t,enemy.hp,player.hp)
    raise AssertionError((enemy.hp,player.hp))


result=dict(
    attacks=['FFG01','FFG02','FFG03'],twoLockedScans=True,twoLockedGeoStones=True,
    gravityFactor=.55,jumpHeight=dict(normal=normal_height,inside=low_height),
    gravityVolumeUsesWorldCoordinates=True,threeQuakeWindows=True,outsideEdgeSafe=True,
    gravityEndsOnTimerKillAndExit=True,gravityDoesNotCarryOverOnRestore=True,
    normalAttackSolo=dict(groundRetreat=normal_clear(),lowGravityJump=normal_clear(use_jump=True)),
    questReportOnce=True,
    commands=dict(png=png.commands,standard=standard.commands,light=light.commands),
    killXp=LEVELS[85]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'],
)
(ROOT/f'evidence/{prefix}-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
