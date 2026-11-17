import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'natlan-hub', 'natlan-field', 'qucusaur-field-cavern'
boss_id, quest = 'boss-26230301', 'qucusaur-commission'
empty = lua.table()


def spot(a,x,y=480):
    a.x,a.y,a.vy,a.inv,a.ground=x,y,0,0,y==480


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[101]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        (ROOT/'work/qucusaur-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    portal(state,1380,approach)
    portal(state,1030,arena)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    return state,slot,slot.enemy,state.actors[1]


def spot_near(hero,boss):
    spot(hero,boss.x-104 if boss.x>470 else boss.x+104)


def until(state,slot,move,tick):
    for _ in range(2600):
        cast=slot.cast
        if cast and cast.move.id==move and cast.tick==tick:
            return cast
        core.step(state,1/60,empty)
    raise AssertionError((move,tick,slot.phase,state.actors[1].hp,slot.enemy.x))


def hit(state,enemy,y=480,atk=20):
    hp=enemy.hp
    core.resolveCast(state,lua.table_from(dict(id=1,atk=atk,x=enemy.x,y=y,dir=1,radial=True,
                             range=90,limit=1,mult=1,color='#fff0ac',gain=0,element='physical',
                             critRate=0,targetId=enemy.id)))
    return hp-enemy.hp


state,slot,boss,hero=make(fixture=True)
assert boss.hp==1020 and boss.level==102 and boss.form=='red'
raw=hit(state,boss)
spot_near(hero,boss)
wing=until(state,slot,'FQT01',44)
assert wing.dir==-1 and wing.source.damageElement=='physical'
hp=hero.hp
spot(hero,boss.x+102)
until(state,slot,'FQT01',99)
assert hero.hp==hp and wing.dir==-1
spot_near(hero,boss)
until(state,slot,'FQT01',105)
assert hero.hp==hp-20 and wing.seen[1][1]

quills=until(state,slot,'FQT02',48)
hp=hero.hp
until(state,slot,'FQT02',115)
assert quills.shots[1] and quills.projectiles[1].damageElement=='pyro' and hero.hp==hp-17
until(state,slot,'FQT02',149)
spot_near(hero,boss)
until(state,slot,'FQT02',176)
assert quills.shots[2] and hero.hp==hp-34

hero.hp=hero.maxhp
spot_near(hero,boss)
flight=until(state,slot,'FQT03',78)
feather=flight.summon
assert feather.hp==14 and feather.x==flight.first and math.isclose(boss.y,480-.94*88)
assert boss.form=='gold' and boss.hitBottom==boss.y-9
assert hit(state,boss)==0 and hit(state,boss,boss.y)==math.floor(raw*.65)
snap=[core.frame(state,mode,profile) for mode,profile in [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
png,standard,light=snap
assert png.t==standard.t==light.t and light.commands<standard.commands
assert sum(1 for d in png.draws.values() if d.source=='qucusaur-field-poses-source-v1.png')==2
assert png.fieldBoss.summon.id==feather.id
before=(boss.hp,state.kills,state.mora,state.progression.killXp,state.story.quests[quest].count)
until(state,slot,'FQT03',185)
assert hit(state,feather,atk=10)>0 and hit(state,feather,atk=10)>0 and feather.hp==0
assert (boss.hp,state.kills,state.mora,state.progression.killXp,state.story.quests[quest].count)==before
until(state,slot,'FQT03',186)
assert flight.breakAt==186 and flight.summon is None and boss.form=='falling'
hp=hero.hp
spot(hero,flight.first)
until(state,slot,'FQT03',222)
assert boss.form=='recover' and boss.y==480 and not flight.seen[1][1] and hero.hp==hp

hero.hp=hero.maxhp
spot_near(hero,boss)
flight=until(state,slot,'FQT03',78)
feather=flight.summon
first,second=flight.first,flight.second
assert abs(first-second)>1.7*88
spot(hero,second)
until(state,slot,'FQT03',187)
assert flight.summon is None and feather.hp==0 and flight.breakAt is None
assert (flight.first,flight.second)==(first,second) and boss.y<480
hp=hero.hp
spot(hero,first)
until(state,slot,'FQT03',221)
assert flight.seen[1][1] and hero.hp==hp-24 and boss.x==first and boss.y==480
until(state,slot,'FQT03',256)
assert boss.y<405
spot(hero,second)
until(state,slot,'FQT03',301)
assert flight.seen[2][1] and hero.hp==hp-48 and boss.x==second and boss.y==480
until(state,slot,'FQT03',322)
assert boss.form=='recover' and flight.move.total-322==144

hero.hp=hero.maxhp
spot_near(hero,boss)
flight=until(state,slot,'FQT03',78)
feather=flight.summon
hp=boss.hp
portal(state,65,approach)
assert feather.hp==0 and slot.cast is None and boss.y==480 and boss.form=='red'
portal(state,1030,arena)
assert len(state.enemies)==1 and boss.hp==hp
spot_near(hero,boss)
flight=until(state,slot,'FQT03',78)
feather=flight.summon
boss.hp=1
kills,mora=state.kills,state.mora
assert hit(state,boss,boss.y)==1 and slot.phase=='respawn' and flight.summon is None and feather.hp==0
assert state.kills==kills+1 and state.mora==mora+360 and state.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(state)))
assert saved['fieldBosses'][boss_id]['waitTicks']==3600
loaded=core.restore(lua.table_from(saved,recursive=True),12)
xp,mora=loaded.progression.questXp,loaded.mora
for _ in range(2):
    core.action(loaded,'story_report:'+quest)
assert loaded.progression.questXp-xp==7200 and loaded.mora-mora==460


def normal_clear(interrupt):
    state,slot,boss,hero=make()
    stopped,completed=0,0
    moves=set()
    for _ in range(140*60):
        if boss.hp<=0:
            assert len(moves)==3
            return dict(seconds=round(state.t,2),hp=hero.hp,interrupted=stopped,completedFlights=completed)
        c=slot.cast
        target=c.summon if interrupt and c and c.summon else boss
        dx=target.x-hero.x
        move=dx
        jump=False
        evade=False
        if c:
            t,m=c.tick,c.move
            moves.add(m.id)
            if c.breakAt==t:
                stopped+=1
            if m.feather and t==m.feather.landAgain and c.breakAt is None:
                completed+=1
            if m.kind=='wing':
                jump=75<=t<81
            elif m.kind=='quills':
                gap=(hero.x-c.origin)*c.dir
                delay=round(max(0,gap-.47*88)/(4.2*88/60))
                jump=gap>30 and any(fire+delay-23<=t<=fire+delay-18 for fire in (92,151))
            elif c.first is not None and c.breakAt is None:
                jump=199<=t<209 or 279<=t<289
                center=c.first if 182<=t<233 else c.second if 267<=t<313 else None
                if center is not None and abs(hero.x-center)<86 and target is boss:
                    move=180 if hero.x>=center else -180
                    evade=True
        if jump and hero.ground:
            core.action(state,'jump')
        turn=abs(dx)>8 and dx*hero.dir<0
        threshold=88 if target is boss else 54
        skipping_feather=not interrupt and c and c.summon is not None
        core.step(state,1/60,lua.table_from(dict(right=move>threshold or (turn and move>0),
                                  left=move<-threshold or (turn and move<0),
                                  attack=abs(dx)<119 and not turn and not evade and not skipping_feather,jump=True)))
        assert state.returns==0,(interrupt,state.t,boss.hp,hero.hp)
    raise AssertionError((interrupt,boss.hp,hero.hp))


broken,dodged=normal_clear(True),normal_clear(False)
assert broken['interrupted']>0 and dodged['completedFlights']>0,(broken,dodged)
result=dict(attacks=['FQT01','FQT02','FQT03'],flightHitboxMoves=True,goldWardFactor=0.65,
            lastTickFeatherStopsBothDives=True,featherHasNoReward=True,
            fixedLandingLocations=True,twoDivesWithoutInterruption=True,cleanupOnExitAndKill=True,
            questReportAndSavedCooldown=True,
            normalAttackSolo=dict(breakFeather=broken,dodgeDives=dodged),
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/qucusaur-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
