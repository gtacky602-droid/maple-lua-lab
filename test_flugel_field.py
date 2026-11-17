import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
boss_id,quest='boss-26310501','flugel-commission'
hub,road,arena='snezhnaya-hub','snezhnaya-field','flugel-tundra-basin'
empty=lua.table()

def spot(a,x,y=480): a.x,a.y,a.vy,a.ground,a.dir=x,y,0,y==480,1

def portal(state,x,node):
    spot(state.actors[1],x);core.action(state,'story_nearby_portal')
    assert state.story.node==node,(state.story.node,node)

def enter(state):
    portal(state,1380,road);portal(state,440,arena)

def make(fixture=False):
    state=core.new(12);core.action(state,'story_start')
    core.grantExp(state,LEVELS[143]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer';save['loadout'][0]=['SK21'];save['loadout'][1]=['SK22']
        (ROOT/'work/flugel-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
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

def gale(state,slot,boss):
    for _ in range(8): strike(state,boss,atk=1)
    for _ in range(240):
        if boss.mode=='anemo': break
        ticks(state)
    assert boss.mode=='anemo' and boss.ward==0
    spot(state.actors[1],boss.x-88)
    return until(state,slot,'FL03',104,'gale')

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.mode,boss.ward)==(144,1180,'electro',8)
hp=boss.hp
repeated=cast(state,boss,atk=1)
for _ in range(3): core.resolveCast(state,repeated)
assert boss.ward==7 and boss.hp<hp
strike(state,boss,'electro',atk=1)
assert boss.ward==7
strike(state,boss,'cryo',atk=1)
assert boss.ward==5
strike(state,boss,'pyro',atk=1,reaction=True)
assert boss.ward==5
for _ in range(3): strike(state,boss,'pyro',atk=1)
assert boss.ward==0
for _ in range(90):
    if boss.form=='down': break
    ticks(state)
assert boss.downReason=='ward' and slot.cast is None and boss.wardDown>0
for _ in range(180):
    if boss.mode=='anemo': break
    ticks(state)
assert boss.mode=='anemo' and boss.form=='idle'

# Each basic attack has fixed lanes and distinct impact windows.
state,slot,boss,hero=make()
c=until(state,slot,'FL01',48);lane=c.left,c.right
spot(hero,c.origin+70);hp=hero.hp
until(state,slot,'FL01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2);until(state,slot,'FL01',185)
assert hero.hp==hp-21 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'FL02',54);locked=c.center
spot(hero,locked+160)
until(state,slot,'FL02',111)
assert boss.form=='airborne' and boss.y==392 and strike(state,boss)==0
assert strike(state,boss,y=boss.y)>0
until(state,slot,'FL02',147)
assert not c.seen[1][1] and boss.x==locked and boss.y==480
spot(hero,locked);hp=hero.hp
until(state,slot,'FL02',221)
assert hero.hp==hp-24 and c.seen[2][1]

# An intact ward still leads to a finite, three-pulse thunder ritual and then Galeforce.
c=until(state,slot,'FL03',60,'thunder')
spot(hero,boss.x);hero.hp,hero.inv=140,0
until(state,slot,'FL03',341,'thunder')
assert hero.hp==65 and all(c.seen[i][1] for i in (1,2,3))
until(state,slot,'FL03',437,'thunder');ticks(state)
assert slot.cast is None and boss.mode=='anemo' and boss.ward==0

# Five reachable orbs; three destroyed cancel absorption and the pending release.
state,slot,boss,hero=make();c=gale(state,slot,boss)
assert len(c.summons)==5 and len(state.enemies)==6 and boss.y==456
unit=c.summons[1];hp,kills,mora=boss.hp,state.kills,state.mora
assert strike(state,unit,startedAt=state.t-1)==0 and unit.hp==2
assert strike(state,unit,reaction=True)==0 and unit.hp==2
repeated=cast(state,unit)
for _ in range(3): core.resolveCast(state,repeated)
assert unit.hp==1 and boss.hp==hp
assert strike(state,unit)==1
assert strike(state,c.summons[2],'pyro')==2
ticks(state)
assert c.brokenOrbs==2 and c.summons and len(state.enemies)==4
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert len([d for d in png.draws.values() if d.source=='flugel-field-poses-source-v1.png'])==4
assert png.fieldBoss.flugel.brokenOrbs==2 and boss.hp==hp
third=c.summons[3]
assert strike(state,third,'hydro')==2;ticks(state)
assert c.broken==106 and c.summons is None and boss.form=='down' and boss.downReason=='orbs'
assert len(state.enemies)==1 and state.kills==kills and state.mora==mora and boss.hp==hp
ticks(state,180)
assert boss.mode=='electro' and boss.ward==8 and boss.form=='idle'
assert boss.wardOpenedAt>0
strike(state,boss,'pyro',atk=1,startedAt=boss.wardOpenedAt-1)
assert boss.ward==8
strike(state,boss,'dendro',atk=1)
assert boss.ward==6

# A third orb broken just before the absorption deadline still interrupts.
state,slot,boss,hero=make();c=gale(state,slot,boss)
for i in (1,2): strike(state,c.summons[i],'cryo')
until(state,slot,'FL03',459,'gale')
assert c.brokenOrbs==2 and c.summons[4].x!=c.summons[4].home
strike(state,c.summons[3],'electro');ticks(state)
assert c.broken==460 and c.absorbed is None and not c.seen[1][1]

# With only two broken orbs, three are absorbed and one fixed release remains avoidable.
state,slot,boss,hero=make();c=gale(state,slot,boss)
for i in (1,2): strike(state,c.summons[i],'pyro')
spot(hero,c.right+60)
until(state,slot,'FL03',460,'gale')
assert c.absorbed==3 and c.summons is None and len(state.enemies)==1
until(state,slot,'FL03',489,'gale')
spot(hero,boss.x);hero.hp,hero.inv=140,0
until(state,slot,'FL03',507,'gale')
assert hero.hp==106 and c.seen[1][1]
until(state,slot,'FL03',609,'gale');ticks(state)
assert slot.cast is None and boss.mode=='electro' and boss.ward==8

# HP0 wins over a ward stagger or a charged wind release, with one reward.
state,slot,boss,hero=make()
boss.ward,boss.hp=1,1
assert strike(state,boss)==1
ticks(state)
assert slot.phase=='respawn' and slot.cast is None and boss.hp==0 and state.kills==1 and state.mora==540
state,slot,boss,hero=make();c=gale(state,slot,boss)
until(state,slot,'FL03',489,'gale')
boss.hp=1;hp=hero.hp
assert strike(state,boss)==1;ticks(state)
assert slot.phase=='respawn' and slot.cast is None and c.summons is None and hero.hp==hp
assert state.kills==1 and state.mora==540 and state.story.quests[quest].count==1

# Checkpoints preserve HP and respawn wait; temporary modes, wards and orbs restart cleanly.
state,slot,boss,hero=make();c=gale(state,slot,boss);hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
fresh=restored.fieldSlots[boss_id]
assert fresh.enemy.hp==hp and fresh.cast is None and fresh.enemy.mode=='electro' and fresh.enemy.ward==8
enter(restored);assert len(restored.enemies)==1
portal(state,65,road)
assert c.summons is None and slot.cast is None and boss.hp==hp
portal(state,440,arena);spot(hero,boss.x-88);hero.hp=140
boss.hp=1;assert strike(state,boss)==1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(10400,710)

def solo():
    state,slot,boss,hero=make();moves=set();ward_breaks=orb_breaks=0;previous=None
    for _ in range(220*60):
        if boss.hp<=0:
            assert moves=={'FL01','FL02','FL03'} and state.returns==0 and ward_breaks and orb_breaks
            return dict(seconds=round(state.t,2),hp=hero.hp,wardInterruptions=ward_breaks,orbInterruptions=orb_breaks)
        c=slot.cast;target=boss
        reason=boss.downReason if boss.form=='down' else None
        if reason!=previous:
            if reason=='ward': ward_breaks+=1
            if reason=='orbs': orb_breaks+=1
        previous=reason
        if c:
            moves.add(c.move.id)
            if c.summons:
                alive=[u for u in c.summons.values() if u.hp>0]
                if alive:target=min(alive,key=lambda u:abs(u.x-hero.x))
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()): core.action(state,'jump')
        dx=target.x-hero.x;turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>72 or turn else 0
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(wardAllowsBodyDamage=True,wardDistinctCastsAndElementalAdvantage=True,wardIgnoresElectroAndReactions=True,
    wardBreakInterruptsAndChangesMode=True,twoSlashWindowsAndLockedDive=True,airborneHurtbox=True,
    thunderHasThreePulsesAndFiniteModeChange=True,fiveGroundReachableOrbs=True,
    oldCastsAndReactionsExcludedFromOrbs=True,PECHBreaksOrbInOneCast=True,physicalBreaksOrbInTwoCasts=True,
    threeOfFiveCancelAndStagger=True,finalTickBreakCancelsAbsorption=True,twoBrokenStillAllowRelease=True,
    rearmedWardRejectsOldCasts=True,HPZeroBeatsWardAndWindRelease=True,noFalseKillRewards=True,
    saveExitAndDefeatCleanUp=True,oneRewardAndReport=True,normalAttackWithoutHealing=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/flugel-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
