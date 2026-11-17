import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
boss_id,quest='boss-25520101','spiritspeaker-commission'
hub,road,arena='natlan-hub','natlan-field','spiritspeaker-field-grotto'
empty=lua.table()

def spot(a,x,y=480):
    a.x,a.y,a.vy,a.ground,a.dir=x,y,0,y==480,1

def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node,(state.story.node,node)

def enter(state):
    portal(state,1380,road)
    portal(state,850,arena)

def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[113]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='wanderer'
        save['loadout'][0]=['SK21']
        save['loadout'][1]=['SK22']
        (ROOT/'work/spiritspeaker-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    enter(state)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-88)
    return state,slot,slot.enemy,state.actors[1]

def ticks(state,count=1,inputs=empty):
    for _ in range(count): core.step(state,1/60,inputs)

def until(state,slot,move,tick):
    for _ in range(2500):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick: return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,slot.enemy.form,state.actors[1].hp))

def cast(state,target,element='physical',**changes):
    return lua.table_from(dict(id=1,atk=24,x=target.x,y=480,dir=1,radial=True,range=150,
        limit=1,mult=1,color='#60dbed',gain=0,element=element,startedAt=state.t,critRate=0,
        targetId=target.id)|changes)

def strike(state,target,element='physical',**changes):
    hp=target.hp
    core.resolveCast(state,cast(state,target,element,**changes))
    return hp-target.hp

state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp,boss.form,boss.y)==(114,1060,'idle',456)
base=strike(state,boss)
c=until(state,slot,'FSP01',48)
lane=c.left,c.right
spot(hero,c.origin+70)
hp=hero.hp
until(state,slot,'FSP01',115)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,sum(lane)/2)
until(state,slot,'FSP01',185)
assert hero.hp==hp-19 and c.seen[2][1] and (c.left,c.right)==lane
c=until(state,slot,'FSP02',54)
centers=native(c.centers)
spot(hero,centers[1]-100)
hp=hero.hp
until(state,slot,'FSP02',125)
assert hero.hp==hp and not c.seen[1][1]
spot(hero,centers[1])
until(state,slot,'FSP02',197)
assert hero.hp==hp-21 and c.seen[2][1] and native(c.centers)==centers

c=until(state,slot,'FSP03',64)
assert len(c.summons)==4 and len(state.enemies)==5 and boss.underground
hp,kills,mora=boss.hp,state.kills,state.mora
assert strike(state,boss)==0 and boss.hp==hp
unit=c.summons[1]
assert strike(state,unit,startedAt=state.t-2)==0 and unit.hp==3
assert strike(state,unit,reaction=True)==0 and unit.hp==3
repeated=cast(state,unit)
for _ in range(3): core.resolveCast(state,repeated)
assert unit.hp==2 and boss.hp==hp
assert strike(state,unit,'pyro')==2
ticks(state)
assert boss.underground and len(state.enemies)==4 and state.kills==kills and state.mora==mora
for i in (2,3):
    for _ in range(3): strike(state,c.summons[i])
ticks(state)
assert boss.underground and len(state.enemies)==2
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert len([d for d in png.draws.values() if d.source=='spiritspeaker-field-poses-source-v1.png'])==1
last=c.summons[4]
for _ in range(3): strike(state,last)
ticks(state)
assert boss.form=='down' and not boss.underground and c.summons is None and len(state.enemies)==1
assert strike(state,boss)>base and state.kills==kills and state.mora==mora
ticks(state,180)
assert boss.form=='idle'

# Each reflection locks its own lane; a broken owner cannot attack on its release tick.
state,slot,boss,hero=make()
c=until(state,slot,'FSP03',180)
shot=c.shots[1]
locked=shot.left,shot.right
spot(hero,c.summons[1].x+100)
until(state,slot,'FSP03',239)
assert (shot.left,shot.right)==locked
for unit in c.summons.values():
    for _ in range(3): strike(state,unit)
hp=hero.hp
ticks(state)
assert c.broken==240 and hero.hp==hp and not shot.seen[1]

# Ignoring the four guards has a finite recovery, with no false kill credit.
state,slot,boss,hero=make()
c=until(state,slot,'FSP03',64)
spot(hero,400)
kills,mora=state.kills,state.mora
until(state,slot,'FSP03',660)
assert c.summons is None and not boss.underground and boss.form=='recover'
assert len(state.enemies)==1 and state.kills==kills and state.mora==mora
until(state,slot,'FSP03',779)
ticks(state)
assert slot.cast is None and boss.form=='idle'

# A terminal body defeat during the hidden phase clears every owner before its attack.
state,slot,boss,hero=make()
c=until(state,slot,'FSP03',239)
spot(hero,c.summons[1].x-40)
hp,kills,mora=hero.hp,state.kills,state.mora
assert core.defeatEnemy(state,boss,1)
ticks(state)
assert slot.phase=='respawn' and slot.cast is None and c.summons is None
assert len(state.enemies)==1 and hero.hp==hp and not boss.underground
assert state.kills==kills+1 and state.mora==mora+420

# Save/exit discard reflections, preserve body HP, and do not pay rewards.
state,slot,boss,hero=make()
strike(state,boss)
c=until(state,slot,'FSP03',64)
hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
assert restored.fieldSlots[boss_id].enemy.hp==hp and restored.fieldSlots[boss_id].cast is None
enter(restored)
assert len(restored.enemies)==1 and not restored.fieldSlots[boss_id].enemy.underground
portal(state,65,road)
assert c.summons is None and slot.cast is None and not boss.underground and boss.hp==hp
portal(state,850,arena)
spot(hero,boss.x-88)
hero.hp=hero.maxhp
c=until(state,slot,'FSP03',64)
for unit in c.summons.values():
    for _ in range(3): strike(state,unit)
ticks(state)
boss.hp=1
mora,kills=state.mora,state.kills
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
assert c.summons is None and len(state.enemies)==1 and state.kills==kills+1
assert state.mora==mora+420 and state.story.quests[quest].count==1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(8600,560)

def solo():
    state,slot,boss,hero=make()
    moves,breaks=set(),set()
    for _ in range(220*60):
        if boss.hp<=0:
            assert moves=={'FSP01','FSP02','FSP03'} and state.returns==0 and breaks
            return dict(seconds=round(state.t,2),hp=hero.hp,reflectionInterruptions=len(breaks))
        c=slot.cast
        target=boss
        if c:
            moves.add(c.move.id)
            if c.broken: breaks.add(round(state.t-c.tick/60,3))
            if c.summons:
                alive=[u for u in c.summons.values() if u.hp>0]
                if alive: target=min(alive,key=lambda u:abs(u.x-hero.x))
            if hero.ground and c.move.kind!='reflections' and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        dx=target.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>72 or turn else 0
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,
            attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(twoSweepWindowsAndFixedIceCenters=True,fourDistinctReflections=True,hiddenBodyUntargetable=True,
    distinctCastsBreakWards=True,pyroRemovesTwoLayers=True,oldCastsAndReactionsRejected=True,
    onlyAllFourRevealBody=True,downIncreasesDamage=True,noFalseKillRewards=True,
    finalTickBreakCancelsStrike=True,hiddenBodyTerminalDefeatCancelsStrike=True,
    timeoutRevealsBody=True,saveExitAndDefeatCleanUp=True,
    oneRewardAndReport=True,normalAttackWithoutHealing=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/spiritspeaker-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
