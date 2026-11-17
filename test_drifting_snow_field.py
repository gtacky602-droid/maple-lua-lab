import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
boss_id,quest='boss-25135202','drifting-snow-commission'
hub,road,arena='snezhnaya-hub','snezhnaya-field','drifting-snow-court'
empty=lua.table()

def spot(a,x,y=480): a.x,a.y,a.vy,a.ground,a.dir=x,y,0,y==480,1

def portal(state,x,node):
    spot(state.actors[1],x);core.action(state,'story_nearby_portal')
    assert state.story.node==node,(state.story.node,node)

def enter(state):
    portal(state,1380,road);portal(state,1030,arena)

def make(fixture=False):
    state=core.new(12);core.action(state,'story_start')
    core.grantExp(state,LEVELS[147]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer';save['loadout'][0]=['SK21'];save['loadout'][1]=['SK22']
        (ROOT/'work/drifting-snow-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
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

def coffin(state,slot,boss):
    boss.hp=660
    return until(state,slot,'FDS03',60)

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.coffinUsed)==(148,1200,False)
# Fixed two-slash lane; actor leaving it avoids the first window, not the second.
c=until(state,slot,'FDS01',48);lane=c.left,c.right
spot(hero,c.origin+70);hp=hero.hp
until(state,slot,'FDS01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2);until(state,slot,'FDS01',185)
assert hero.hp==hp-21 and c.seen[2][1] and (c.left,c.right)==lane
# Projectile positions lock once; their two windows do not chase after locking.
c=until(state,slot,'FDS02',48);centers=list(c.centers.values())
spot(hero,centers[1]+200);hp=hero.hp
until(state,slot,'FDS02',143)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,centers[1]);until(state,slot,'FDS02',223)
assert hero.hp==hp-23 and c.seen[2][1] and centers==list(c.centers.values())

# HP threshold interrupts the current basic attack once, retaining the next index.
state,slot,boss,hero=make();until(state,slot,'FDS01',80);index=slot.index
c=coffin(state,slot,boss)
assert slot.index==index and boss.coffinUsed and boss.coffinLayers==8
assert strike(state,boss,atk=1)>0
assert boss.coffinLayers==7
repeated=cast(state,boss,atk=1)
for _ in range(3):core.resolveCast(state,repeated)
assert boss.coffinLayers==6
for element,kwargs in [('cryo',{}),('pyro',{'reaction':True}),('anemo',{'startedAt':state.t-1})]:
    strike(state,boss,element,atk=1,**kwargs)
assert boss.coffinLayers==6
strike(state,boss,'anemo',atk=1);assert boss.coffinLayers==4
strike(state,boss,'electro',atk=1);assert boss.coffinLayers==2
strike(state,boss,'pyro',atk=1);ticks(state)
assert slot.cast is None and boss.form=='down' and boss.downTicks==179
hp=boss.hp;ticks(state,180)
assert boss.form=='idle' and boss.coffinUsed and boss.hp==hp
for _ in range(700):
    hero.hp=140;ticks(state)
    assert not slot.cast or slot.cast.move.kind!='coffin'

# All eight fresh physical casts can break the coffin on its last accepted tick.
state,slot,boss,hero=make();c=coffin(state,slot,boss)
for _ in range(7):strike(state,boss,atk=1)
hero.hp=140;until(state,slot,'FDS03',419);hp=boss.hp
strike(state,boss,atk=1);after=boss.hp;ticks(state)
assert slot.cast is None and boss.form=='down' and boss.hp==after<hp
assert c.failed is None and c.healed is None

# Timeout heals a bounded amount once, releases two ice swords, then terminates.
state,slot,boss,hero=make();c=coffin(state,slot,boss)
spot(hero,boss.x);hero.hp,hero.inv=140,0
until(state,slot,'FDS03',305)
assert hero.hp==90 and c.seen[1][1] and c.seen[2][1]
boss.hp=655;until(state,slot,'FDS03',420)
assert boss.hp==751 and c.failed and c.healed==96 and boss.coffinLayers==0
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
 [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
spot(hero,sum((c.left,c.right))/2);hero.hp,hero.inv=140,0
until(state,slot,'FDS03',547)
assert hero.hp==90 and c.seen[3][1] and c.seen[4][1] and boss.hp==751
until(state,slot,'FDS03',641);ticks(state)
assert slot.cast is None and boss.coffinUsed and boss.hp==751

# Persist the one-use flag even after healing above the threshold.
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['flags']=={'coffinUsed':True}
restored=core.restore(lua.table_from(snap,recursive=True),12)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==751 and fresh.enemy.coffinUsed and fresh.enemy.coffinLayers==0 and fresh.cast is None
enter(restored);spot(restored.actors[1],fresh.enemy.x-88);fresh.enemy.hp=650
for _ in range(180):ticks(restored)
assert not fresh.cast or fresh.cast.move.kind!='coffin'

# Legacy saves remain accepted, using a conservative below-threshold inference.
legacy=json.loads(json.dumps(snap));del legacy['fieldBosses'][boss_id]['flags']
legacy['fieldBosses'][boss_id]['hp']=650
restored=core.restore(lua.table_from(validate_save(legacy),recursive=True),12)
assert restored.fieldSlots[boss_id].enemy.coffinUsed
for flags in ({'coffinUsed':1},{'coffinUsed':False,'other':True},{},[],None):
    bad=json.loads(json.dumps(snap));bad['fieldBosses'][boss_id]['flags']=flags
    try:validate_save(bad)
    except ValueError:pass
    else:raise AssertionError(flags)
bad=json.loads(json.dumps(snap));bad['fieldBosses']['boss-26310501']={'generation':1,'hp':1180,'waitTicks':0,'flags':{'coffinUsed':True}}
try:validate_save(bad)
except ValueError:pass
else:raise AssertionError('another controller accepted coffin flag')

# Saving or exiting during the coffin cancels its transient pulses and pending heal.
state,slot,boss,hero=make();c=coffin(state,slot,boss);hp=boss.hp
snap=validate_save(native(core.checkpoint(state)));restored=core.restore(lua.table_from(snap,recursive=True),12)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.enemy.coffinUsed and fresh.enemy.coffinLayers==0 and fresh.cast is None
portal(state,65,road)
assert slot.cast is None and boss.coffinLayers==0 and boss.coffinUsed and boss.hp==hp
portal(state,1030,arena);spot(hero,boss.x-88)
for _ in range(180):ticks(state)
assert not slot.cast or slot.cast.move.kind!='coffin'

# HP0 wins both at phase entry and before timeout: no resurrection, one reward.
for during in (False,True):
    state,slot,boss,hero=make()
    if during:
        c=coffin(state,slot,boss);spot(hero,boss.x+280);until(state,slot,'FDS03',419)
    boss.hp=1;hp=hero.hp
    assert strike(state,boss)==1;ticks(state)
    assert boss.hp==0 and slot.cast is None and slot.phase=='respawn' and hero.hp==hp
    assert state.kills==1 and state.mora==560 and state.story.quests[quest].count==1
    if not during:assert not boss.coffinUsed
snap=validate_save(native(core.checkpoint(state)));assert snap['fieldBosses'][boss_id]['waitTicks']==3599
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(10800,730)
ticks(restored,3600)
fresh=restored.fieldSlots[boss_id]
assert fresh.generation==2 and fresh.enemy.hp==1200 and not fresh.enemy.coffinUsed

def solo():
    state,slot,boss,hero=make();moves=set();interrupted=False
    for _ in range(180*60):
        if boss.hp<=0:
            assert moves=={'FDS01','FDS02','FDS03'} and state.returns==0 and interrupted
            return dict(seconds=round(state.t,2),hp=hero.hp,coffinInterrupted=interrupted)
        c=slot.cast
        if boss.form=='down':interrupted=True
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):core.action(state,'jump')
        dx=boss.x-hero.x;turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>72 or turn else 0
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(twoLockedSlashWindows=True,twoFixedProjectileWindows=True,HPThresholdPreemptsAndPreservesRoutine=True,
 directCastDedupAndOldReactionCryoExclusion=True,pyroElectroAnemoAdvantage=True,physicalCoffinAlternative=True,
 lastTickBreakBeatsHealAndRelease=True,twoIcePulsesAndTwoReleaseWindows=True,oneBoundedHealAndFiniteEnd=True,
 persistentOnceFlagAboveAndBelowThreshold=True,oldSavesAccepted=True,strictFlagsRejectInvalidAndForeign=True,
 exitAndMidCoffinSaveCancelWithoutResettingUsed=True,HPZeroBeatsPhaseAndTimeout=True,
 oneKillReportAndRespawnGenerationReset=True,normalAttackWithoutHealing=solo(),
 sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/drifting-snow-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
