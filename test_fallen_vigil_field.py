import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
boss_id,quest='boss-24111101','fallen-vigil-commission'
hub,arena='dornman-camp','windrest-vigil-court'
empty=lua.table()

def spot(a,x,y=480):
    a.x,a.y,a.vy,a.ground,a.dir=x,y,0,y==480,1

def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node,(state.story.node,node)

def enter(state): portal(state,970,arena)

def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[17]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        assert save['companion']=='amber'
        (ROOT/'work/fallen-vigil-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    enter(state)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-88)
    return state,slot,slot.enemy,state.actors[1]

def ticks(state,count=1,inputs=empty):
    for _ in range(count): core.step(state,1/60,inputs)

def until(state,slot,move,tick):
    for _ in range(2800):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick: return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))

def cast(state,target,element='physical',**changes):
    return lua.table_from(dict(id=1,atk=24,x=target.x,y=480,dir=1,radial=True,range=150,
        limit=1,mult=1,color='#ffd685',gain=0,element=element,startedAt=state.t,critRate=0,
        targetId=target.id)|changes)

def strike(state,target,element='physical',**changes):
    hp=target.hp
    core.resolveCast(state,cast(state,target,element,**changes))
    return hp-target.hp

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.y)==(18,700,448)
base=strike(state,boss)
c=until(state,slot,'FV01',48)
lane=c.left,c.right
spot(hero,c.origin+70)
hp=hero.hp
until(state,slot,'FV01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2)
until(state,slot,'FV01',185)
assert hero.hp==hp-14 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'FV02',54)
locked=c.center
spot(hero,locked+160)
hp=hero.hp
until(state,slot,'FV02',125)
assert hero.hp==hp and not c.seen[1][1] and boss.form=='airborne'
until(state,slot,'FV02',145)
assert strike(state,boss)==0 and strike(state,boss,y=boss.y)==base
spot(hero,locked)
hp=hero.hp
until(state,slot,'FV02',191)
assert hero.hp==hp-18 and c.seen[2][1] and boss.x==locked and boss.y==448

# Only direct PECH damage from casts begun in this window can be recorded.
c=until(state,slot,'FV03',60)
for element in ('physical','anemo','geo','dendro'):
    strike(state,boss,element,atk=1)
for _ in range(3):
    strike(state,boss,'pyro',atk=1,startedAt=state.t-1)
    strike(state,boss,'hydro',atk=1,reaction=True)
assert native(c.records)==['none','none'] and len(c.counts)==0
multi=cast(state,boss,'pyro',atk=1)
for _ in range(3): core.resolveCast(state,multi)
assert c.records[1]=='pyro' and c.counts.pyro==3
strike(state,boss,'hydro',atk=1)
assert c.counts.hydro is None
until(state,slot,'FV03',240)
assert len(c.counts)==0 and not c.recorded
for _ in range(5): strike(state,boss,'pyro',atk=1)
assert c.records[2]=='none' and c.counts.pyro==5
strike(state,boss,'pyro',atk=1)
assert c.records[2]=='pyro' and c.counts.pyro==6
until(state,slot,'FV03',420)
assert len(c.summons)==2 and all(u.element=='pyro' and u.hp==3 for u in c.summons.values())
first,last=c.summons[1],c.summons[2]
hp,kills,mora=boss.hp,state.kills,state.mora
assert strike(state,first,'hydro',startedAt=state.t-1)==0 and first.hp==3
assert strike(state,first,'hydro',reaction=True)==0 and first.hp==3
assert strike(state,first,'pyro')==0 and first.hp==3
repeated=cast(state,first)
for _ in range(3): core.resolveCast(state,repeated)
assert first.hp==2 and boss.hp==hp
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert native(png.fieldBoss.vigil.records)==['pyro','pyro']
assert len([d for d in png.draws.values() if d.source=='fallen-vigil-field-poses-source-v1.png'])==3
assert strike(state,first,'hydro')==2
ticks(state)
assert first.resolved and boss.hp<hp and state.kills==kills and state.mora==mora
spot(hero,boss.x)
hero.hp,hero.inv=140,0
until(state,slot,'FV03',945)
assert hero.hp==140 and not c.seen[1][1]
until(state,slot,'FV03',1009)
assert strike(state,last,'cryo')==2 and strike(state,last)==1
ticks(state)
assert c.broken==1010 and c.summons is None and boss.form=='down' and not c.seen[2][1]
assert state.kills==kills and state.mora==mora and len(state.enemies)==1
assert strike(state,boss)>base
ticks(state,180)
assert boss.form=='idle'

# A different element still needs only three hits in the second window.
state,slot,boss,hero=make()
c=until(state,slot,'FV03',60)
for _ in range(3): strike(state,boss,'pyro',atk=1)
until(state,slot,'FV03',240)
for _ in range(3): strike(state,boss,'hydro',atk=1)
assert native(c.records)==['pyro','hydro'] and c.counts.hydro==3

# Empty records produce tougher stars, and both unbroken stars release once before finite cleanup.
state,slot,boss,hero=make()
c=until(state,slot,'FV03',420)
assert all(u.element=='none' and u.hp==5 for u in c.summons.values())
spot(hero,c.left-60)
until(state,slot,'FV03',929)
spot(hero,boss.x)
hero.hp,hero.inv=140,0
until(state,slot,'FV03',945)
assert hero.hp==114 and c.seen[1][1]
until(state,slot,'FV03',1025)
assert hero.hp==88 and c.seen[2][1]
until(state,slot,'FV03',1060)
assert c.summons is None and len(state.enemies)==1 and boss.form=='recover'
until(state,slot,'FV03',1149)
ticks(state)
assert slot.cast is None and boss.form=='idle'

# Lethal star backlash wins once and cancels the other release and temporary objects.
state,slot,boss,hero=make()
c=until(state,slot,'FV03',420)
for _ in range(5): strike(state,c.summons[1])
boss.hp=1
kills,mora=state.kills,state.mora
ticks(state)
assert boss.hp==0 and slot.phase=='respawn' and slot.cast is None and c.summons is None
assert state.kills==kills+1 and state.mora==mora+155 and state.story.quests[quest].count==1

# Save and exit retain body HP, not monitoring windows or Elemental Stars.
state,slot,boss,hero=make()
strike(state,boss)
c=until(state,slot,'FV03',420)
hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
assert restored.fieldSlots[boss_id].enemy.hp==hp and restored.fieldSlots[boss_id].cast is None
enter(restored)
assert len(restored.enemies)==1 and core.frame(restored,'sprite','legacy').fieldBoss.vigil is None
portal(state,65,hub)
assert c.summons is None and slot.cast is None and boss.hp==hp
enter(state)
spot(hero,boss.x-88)
hero.hp=hero.maxhp
c=until(state,slot,'FV03',420)
mora,kills=state.mora,state.kills
boss.hp=1
assert strike(state,boss)==1 and slot.cast is None and c.summons is None and slot.phase=='respawn'
assert state.mora==mora+155 and state.kills==kills+1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(1400,220)

def solo():
    state,slot,boss,hero=make()
    moves,breaks=set(),set()
    for _ in range(200*60):
        if boss.hp<=0:
            assert moves=={'FV01','FV02','FV03'} and state.returns==0 and breaks
            return dict(seconds=round(state.t,2),hp=hero.hp,starInterruptions=len(breaks))
        c=slot.cast
        target=boss
        if c:
            moves.add(c.move.id)
            if c.broken: breaks.add(round(state.t-c.tick/60,3))
            if c.summons:
                alive=[u for u in c.summons.values() if u.hp>0]
                if alive: target=min(alive,key=lambda u:abs(u.x-hero.x))
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        dx=target.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>72 or turn else 0
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,
            attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(twoLungeWindows=True,fixedSpearAndDescent=True,airborneHurtbox=True,
    threePECHHitsRecordElement=True,repeatElementNeedsSix=True,differentSecondElementNeedsThree=True,
    freshMultiHitCastCountsDamageInstances=True,oldCastsAndReactionsExcluded=True,
    activeAndInertStarsHaveDifferentLayers=True,sameElementDoesNotBreakActiveStar=True,
    oppositeElementRemovesTwoLayers=True,distinctCastsChipStars=True,
    firstBrokenStarCancelsOnlyItsRelease=True,finalTickBreakCancelsSecondRelease=True,
    allStarsBreakDown=True,starBacklashCanDefeatOnce=True,bodyAlwaysVulnerableOutsideAirborneReach=True,
    noFalseKillRewards=True,timeoutCleansUp=True,saveExitAndDefeatCleanUp=True,oneRewardAndReport=True,
    normalAttackWithoutHealing=solo(),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/fallen-vigil-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
