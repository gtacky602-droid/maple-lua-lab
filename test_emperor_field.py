import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'fontaine-hub', 'fontaine-field', 'emperor-field-cove'
boss_id, quest = 'boss-26160302', 'emperor-commission'
source = 'emperor-field-poses-source-v1.png'
empty = lua.table()
spec = next(row for row in json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
            if row['id'] == boss_id)


def spot(actor, x, y=480):
    actor.x,actor.y,actor.vy,actor.inv,actor.ground=x,y,0,0,y==480


def make(fixture=False):
    game=core.new(12)
    core.action(game,'story_start')
    core.grantExp(game,LEVELS[81]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(game,hub)
    core.action(game,'story_accept:'+quest)
    assert game.story.quests[quest].status=='active'
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        saved=validate_save(native(core.checkpoint(game)))
        (ROOT/'work/emperor-field-fixture.json').write_text(json.dumps(saved),encoding='utf8')
    for x,node in ((1380,approach),(510,arena)):
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


def hit(game,boss,x,**extra):
    hp=boss.hp
    attack=dict(id=1,atk=100,x=x,y=480,dir=1,radial=True,range=125,limit=2,mult=1,
                color='#fff0ac',gain=0,element='physical',critRate=0)
    core.resolveCast(game,lua.table_from(attack|extra))
    return hp-boss.hp


game,slot,hero=make(fixture=True)
boss=slot.enemy
spot(hero,boss.x-112)
claw=until(game,slot,'FEC01',42)
assert claw.dir==-1 and boss.form=='guarded'
front=hit(game,boss,boss.x-55)
rear=hit(game,boss,boss.x+55)
assert 0<front<rear and abs(front/rear-spec['frontDamageFactor'])<.02
assert hit(game,boss,boss.x-55,reaction=True)==rear
spot(hero,boss.x+106)
hp=hero.hp
until(game,slot,'FEC01',106)
assert hero.hp==hp and claw.dir==-1
spot(hero,boss.x-106)
until(game,slot,'FEC01',109)
assert hero.hp==hp-21
hero.inv=0
until(game,slot,'FEC01',120)
assert hero.hp==hp-21 and claw.seen[1][1]

fire=until(game,slot,'FEC02',48)
points=list(fire.points.values())
assert math.isclose(abs(points[1]-points[0]),1.25*88)
hp=hero.hp
for i,(x,start) in enumerate(zip(points,(108,156)),1):
    until(game,slot,'FEC02',start-20)
    spot(hero,x)
    until(game,slot,'FEC02',start-1)
    assert hero.hp==hp-19*(i-1)
    until(game,slot,'FEC02',start+3)
    assert hero.hp==hp-19*i and fire.seen[i][1]
assert list(fire.points.values())==points and fire.source.damageElement=='pyro'

spot(hero,boss.x+95)
eruption=until(game,slot,'FEC03',54)
assert eruption.dir==1
assert hit(game,boss,boss.x+55)==front
assert hit(game,boss,boss.x-55)==rear
hp=hero.hp
until(game,slot,'FEC03',119)
spot(hero,boss.x+97,y=396)
until(game,slot,'FEC03',123)
assert hero.hp==hp
spot(hero,boss.x+97)
until(game,slot,'FEC03',131)
assert hero.hp==hp-24 and eruption.seen[1][1]
until(game,slot,'FEC03',167)
assert boss.form=='guarded'
until(game,slot,'FEC03',168)
assert boss.form=='exposed' and core.frame(game,'sprite').fieldBoss.form=='exposed'
assert hit(game,boss,boss.x+55)==hit(game,boss,boss.x-55)==rear
assert len(game.enemies)==1 and not boss.invulnerable
png=core.frame(game,'sprite')
standard,light=(core.frame(game,'rect',p) for p in ('legacy','h32c16'))
assert png.t==standard.t==light.t and light.commands<standard.commands
assert any(d.source==source and d.h==91 for d in png.draws.values())
until(game,slot,'FEC03',311)
assert boss.form=='exposed'
core.step(game,1/60,empty)
assert boss.form=='guarded' and slot.cast is None
boss.hp=1
hit(game,boss,boss.x+55)
assert slot.phase=='respawn' and game.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(game)))
assert saved['fieldBosses'][boss_id]['waitTicks']==3600
reloaded=core.restore(lua.table_from(saved,recursive=True),12)
xp,mora=reloaded.progression.questXp,reloaded.mora
for _ in range(2):
    core.action(reloaded,'story_report:'+quest)
assert (reloaded.progression.questXp-xp,reloaded.mora-mora)==(5000,360)


def solo_normal_clear(flank=False):
    state,fight,player=make()
    enemy=fight.enemy
    start=state.t
    jumps={'FEC01':(83,),'FEC02':(90,138),'FEC03':(96,)}
    for _ in range(130*60):
        if enemy.hp<=0:
            return dict(seconds=round(state.t-start,2),hp=player.hp)
        dx=enemy.x-player.x
        cast=fight.cast
        turn=dx*player.dir<0
        if flank and cast and cast.tick>=cast.move.lock and enemy.form=='guarded':
            rear=enemy.x-cast.dir*96
            travel=rear-player.x
            left,right=travel<-8,travel>8
            if not (left or right) and turn:
                left,right=dx<0,dx>0
            attack=abs(dx)<125 and not turn and dx*cast.dir>=0
        else:
            left=dx<-108 or (turn and dx<0)
            right=dx>108 or (turn and dx>0)
            attack=abs(dx)<125 and not turn
        if cast and player.ground and cast.tick in jumps[cast.move.id]:
            core.action(state,'jump')
        core.step(state,1/60,lua.table_from(dict(right=right,left=left,attack=attack,jump=True)))
        assert state.returns==0,(state.t,enemy.hp,player.hp)
    raise AssertionError((enemy.hp,player.hp))


result=dict(
    attacks=[m['id'] for m in spec['moves']],guardedDirectHit=dict(front=front,rear=rear),
    guardFollowsFacing=True,reactionUnaffected=True,clawDirectionLocked=True,fireLocationsFixed=True,airborneFireHarmless=True,
    eruptionJumpable=True,exposureTicks=144,sameHpReceiver=True,questReportOnce=True,
    normalAttackSolo=dict(front=solo_normal_clear(),flanking=solo_normal_clear(flank=True)),
    commands=dict(png=png.commands,standard=standard.commands,light=light.commands),
    killXp=LEVELS[81]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'],
)
(ROOT/'evidence/emperor-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
