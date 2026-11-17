import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
boss_id,quest='boss-25140101','immortal-construct-commission'
hub,road,arena='snezhnaya-hub','snezhnaya-field','immortal-construct-root-hollow'
empty=lua.table()

def spot(a,x,y=480): a.x,a.y,a.vy,a.ground,a.dir=x,y,0,y==480,1

def portal(state,x,node):
    spot(state.actors[1],x);core.action(state,'story_nearby_portal')
    assert state.story.node==node,(state.story.node,node)

def enter(state):
    portal(state,1380,road);portal(state,1210,arena)

def make(fixture=False):
    state=core.new(12);core.action(state,'story_start')
    core.grantExp(state,LEVELS[141]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer';save['loadout'][0]=['SK21'];save['loadout'][1]=['SK22']
        (ROOT/'work/immortal-construct-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest);enter(state);state.actors[2].hp=0
    slot=state.fieldSlots[boss_id];spot(state.actors[1],slot.enemy.x-88)
    return state,slot,slot.enemy,state.actors[1]

def ticks(state,count=1,inputs=empty):
    for _ in range(count): core.step(state,1/60,inputs)

def until(state,slot,move,tick,kind=None):
    for _ in range(3000):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick and (not kind or c.move.kind==kind): return c
        ticks(state)
    raise AssertionError((move,tick,kind,slot.phase,slot.enemy.form,state.actors[1].hp))

def cast(state,target,element='physical',**changes):
    return lua.table_from(dict(id=1,atk=24,x=target.x,y=480,dir=1,radial=True,range=150,limit=1,
        mult=1,color='#52e3c1',gain=0,element=element,startedAt=state.t,critRate=0,targetId=target.id)|changes)

def strike(state,target,element='physical',**changes):
    hp=target.hp;core.resolveCast(state,cast(state,target,element,**changes));return hp-target.hp

def life(state,slot):return until(state,slot,'IC03',60)

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.lifeUnits)==(142,1260,0)
c=until(state,slot,'IC01',48);lane=c.left,c.right
spot(hero,c.origin+70);hp=hero.hp
until(state,slot,'IC01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2);until(state,slot,'IC01',185)
assert hero.hp==hp-21 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'IC02',48);centers=list(c.centers.values())
spot(hero,centers[1]+200);hp=hero.hp
until(state,slot,'IC02',143);assert hero.hp==hp and not c.seen[1][1]
spot(hero,centers[1]);until(state,slot,'IC02',223)
assert hero.hp==hp-23 and c.seen[2][1] and centers==list(c.centers.values())

# The self-spend cannot generate a kill when only one HP remains.
state,slot,boss,hero=make();until(state,slot,'IC03',59);boss.hp=1;ticks(state)
assert boss.hp==1 and slot.cast.spent==0 and state.kills==state.mora==0

# Spending HP does not kill the owner or give rewards; body damage stays available.
state,slot,boss,hero=make();c=life(state,slot)
assert boss.hp==1164 and boss.lifeUnits==12 and c.spent==96 and state.kills==state.mora==0
assert strike(state,boss,atk=1)>0 and boss.lifeUnits==11
repeated=cast(state,boss,atk=1)
for _ in range(3):core.resolveCast(state,repeated)
assert boss.lifeUnits==10 and boss.shieldBreaks==1
for element,kwargs in [('anemo',{'reaction':True}),('pyro',{'startedAt':state.t-1})]:
    strike(state,boss,element,atk=1,**kwargs)
assert boss.lifeUnits==10
ticks(state);assert c.interruptions==1 and c.cancelled[1] and boss.form=='segment-stagger'
spot(hero,boss.x);hero.hp,hero.inv=140,0
until(state,slot,'IC03',153)
assert hero.hp==140 and c.healed==0 and not c.seen[1][1]
hp=boss.hp
until(state,slot,'IC03',233)
assert hero.hp==118 and c.healed==18 and boss.hp==hp+18
# Holding within one active window cannot heal repeatedly.
assert c.seen[2][1]

# Player attacks do not heal the boss. All ordinary elements remove one unit.
for element in ('physical','cryo','electro','anemo','pyro','hydro','geo','dendro'):
    before=boss.lifeUnits;hp=boss.hp
    strike(state,boss,element,atk=1)
    assert boss.lifeUnits==before-1 and boss.hp<hp
assert boss.lifeUnits==2
strike(state,boss,atk=1);strike(state,boss,atk=1);ticks(state)
assert slot.cast is None and boss.form=='down' and boss.downTicks==179
assert c.chantStart is None and c.releaseSeen is None and state.kills==0
ticks(state,180);assert boss.form=='idle' and boss.lifeUnits==0

# A layer broken just before a pulse cancels that pulse before it can deal/heal.
state,slot,boss,hero=make();c=life(state,slot);spot(hero,boss.x)
until(state,slot,'IC03',139);hero.hp,hero.inv=140,0;hp=boss.hp
strike(state,boss,atk=1);strike(state,boss,atk=1);after=boss.hp;ticks(state)
assert c.cancelled[1] and hero.hp==140 and boss.hp==after<hp and c.healed==0

# Fewer remaining layers starts the final chant early, but one layer is insufficient to stop it.
state,slot,boss,hero=make();c=life(state,slot)
for _ in range(8):strike(state,boss,atk=1)
ticks(state)
assert c.chantStart==61 and boss.lifeUnits==4 and c.interruptions==4
assert all(c.cancelled[i] for i in (1,2,3))
for _ in range(2):strike(state,boss,atk=1)
ticks(state);assert c.chantStart==61 and boss.lifeUnits==2 and c.interruptions==5
spot(hero,boss.x+260);until(state,slot,'IC03',216)
assert c.tick-c.chantStart==155
# Last accepted tick: all layers gone before the scheduled final bloom.
strike(state,boss,atk=1);strike(state,boss,atk=1);hp=hero.hp;ticks(state)
assert slot.cast is None and boss.form=='down' and hero.hp==hp and not c.releaseSeen[1]

# With shields untouched, the late chant and release finish in bounded time.
state,slot,boss,hero=make();c=life(state,slot);spot(hero,boss.x)
hero.hp,hero.inv=140,0
until(state,slot,'IC03',359)
assert hero.hp==74 and c.healed==54 and boss.hp==1218 and all(c.seen[i][1] for i in (1,2,3))
ticks(state);assert c.chantStart==360
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
 [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
hero.hp,hero.inv=140,0
until(state,slot,'IC03',533)
assert hero.hp==108 and c.healed==72 and boss.hp==1236 and c.releaseSeen[1]
until(state,slot,'IC03',629);ticks(state)
assert slot.cast is None and boss.form=='idle' and boss.lifeUnits==0

# Heal depends on actual HP loss: iframe/miss and a full shield break cannot create it.
state,slot,boss,hero=make();c=life(state,slot);spot(hero,boss.x);hero.hp,hero.inv=140,99
until(state,slot,'IC03',153)
assert hero.hp==140 and c.healed==0 and boss.hp==1164
hero.inv=0
until(state,slot,'IC03',233);assert c.healed==18

# HP0 at deploy or just before final bloom always wins, with one kill and report.
for release in (False,True):
    state,slot,boss,hero=make()
    if release:
        c=life(state,slot);spot(hero,boss.x+270);until(state,slot,'IC03',515)
    else:until(state,slot,'IC03',59)
    boss.hp=1;hp=hero.hp
    assert strike(state,boss)==1;ticks(state)
    assert boss.hp==0 and slot.cast is None and slot.phase=='respawn' and hero.hp==hp
    assert state.kills==1 and state.mora==550 and state.story.quests[quest].count==1

# Save/exit retains HP but cancels transient life/shield/waves without fake kills.
state,slot,boss,hero=make();c=life(state,slot);hp=boss.hp
snap=validate_save(native(core.checkpoint(state)));restored=core.restore(lua.table_from(snap,recursive=True),12)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.enemy.lifeUnits==0 and fresh.cast is None
portal(state,65,road)
assert slot.cast is None and boss.lifeUnits==0 and boss.hp==hp and state.kills==state.mora==0
portal(state,1210,arena);spot(hero,boss.x-88);boss.hp=1
assert strike(state,boss)==1
snap=validate_save(native(core.checkpoint(state)));assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(10600,720)
ticks(restored,3600);fresh=restored.fieldSlots[boss_id]
assert fresh.generation==2 and fresh.enemy.hp==1260 and fresh.enemy.lifeUnits==0

def solo():
    state,slot,boss,hero=make();moves=set();interrupted=False
    for _ in range(180*60):
        if boss.hp<=0:
            assert moves=={'IC01','IC02','IC03'} and state.returns==0 and interrupted,(state.t,moves,state.returns,interrupted)
            return dict(seconds=round(state.t,2),hp=hero.hp,shieldInterrupted=interrupted)
        c=slot.cast
        if boss.form=='down':interrupted=True
        if c:
            moves.add(c.move.id)
            windows=[(w[1],w[2]) for i,w in c.move.active.items() if not c.cancelled[i]]
            if c.chantStart:
                release=c.chantStart+c.move.releaseDelay;windows=[(release,release+c.move.releaseTicks)]
            if hero.ground and any(w[0]-23<=c.tick<=w[0]-16 for w in windows):core.action(state,'jump')
        dx=boss.x-hero.x;turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>72 or turn else 0
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(twoFixedRakeWindows=True,twoFixedSeedWindows=True,selfSpendKeepsBodyDamageable=True,
 shieldDistinctCastsOldReactionExclusion=True,ordinaryElementsEachRemoveOneUnit=True,
 eachLayerCancelsMinorWave=True,actualEnemyHitHealsWithinBudget=True,playerHitsDoNotHealBoss=True,
 iframeMissDoesNotHeal=True,fewerLayersStartEarlyChant=True,oneLayerDoesNotCancelFinalBloom=True,
 lastTickFullBreakCancelsBloom=True,unbrokenShieldStillEndsInFiniteTime=True,
 HPZeroBeatsDeployAndBloom=True,saveExitAndOneRewardReportRespawn=True,
 normalAttackWithoutHealing=solo(),sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/immortal-construct-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
