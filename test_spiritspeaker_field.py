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
    portal(state,1380,'natlan-quarry-road')
    portal(state,64,road)
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

def center(lane):
    return (lane.left+lane.right)/2

def number_marks(frame):
    return [(d.text,round(d.x+frame.camera,5)) for d in frame.draws.values()
            if d.kind=='text' and d.y==501]

sweep=until(state,slot,'FSP01',48)
lane=sweep.lanes[1]
spot(hero,sweep.origin+70)
hp=hero.hp
until(state,slot,'FSP01',115)
assert hero.hp==hp and not sweep.seen[1][1]
spot(hero,center(lane))
until(state,slot,'FSP01',185)
assert hero.hp==hp-19 and sweep.seen[2][1] and sweep.lanes[2].left==lane.left

ice=until(state,slot,'FSP02',54)
centers=[center(lane) for lane in ice.lanes.values()]
assert number_marks(core.frame(state,'sprite'))==[(str(i),round(x,5)) for i,x in enumerate(centers,1)]
spot(hero,ice.origin-ice.dir*94)
hp=hero.hp
until(state,slot,'FSP02',125)
assert hero.hp==hp and not ice.seen[1][1]
spot(hero,centers[1])
until(state,slot,'FSP02',197)
assert hero.hp==hp-21 and ice.seen[2][1] and [center(lane) for lane in ice.lanes.values()]==centers

spot(hero,boss.x-94)
c=until(state,slot,'FSP03',60)
expected=[(.85,1.75),(1.85,2.75)]
for lane,(near,far) in zip(c.lanes.values(),expected):
    assert abs(lane.right-(c.origin-near*88))<1e-8
    assert abs(lane.left-(c.origin-far*88))<1e-8
assert not core.frame(state,'sprite').fieldBoss.echoesVisible
until(state,slot,'FSP03',64)
shot=core.frame(state,'sprite')
sprites=[d for d in shot.draws.values() if d.source=='spiritspeaker-field-poses-source-v1.png']
centers=[center(lane) for lane in c.lanes.values()]
assert len(sprites)==3 and [d.opacity for d in sprites]==[.32,.32,None]
assert sprites[-1].x+shot.camera==boss.x and shot.fieldBoss.echoesVisible
assert [round(d.x+shot.camera,5) for d in sprites[:2]]==[round(x,5) for x in centers]
assert number_marks(shot)==[(str(i),round(x,5)) for i,x in enumerate(centers,1)]
assert len(state.enemies)==1 and not boss.underground and not shot.fieldBoss.summons
bars=[d for d in shot.draws.values() if d.kind=='rect' and d.y==boss.hitTop-12 and d.w==72]
assert len(bars)==1 and bars[0].x+shot.camera==boss.x-36

# An attack confined to an echo cannot hit a target or award anything.
hp,seq,kills,mora=boss.hp,state.seq,state.kills,state.mora
core.resolveCast(state,cast(state,boss,x=centers[0],range=18,targetId=None))
assert (boss.hp,state.seq,state.kills,state.mora)==(hp,seq,kills,mora)
# A straight attack through both echoes still has its one hit available for the boss.
first,second=centers
assert strike(state,boss,x=second-36,range=boss.x-second+45,dir=1,radial=False,targetId=None)==base
hp=boss.hp
assert strike(state,boss,'pyro')>0 and boss.hp<hp
assert (state.kills,state.mora)==(kills,mora)
spot(hero,first)
hero.inv=0
hp=hero.hp
until(state,slot,'FSP03',143)
assert hero.hp==hp
until(state,slot,'FSP03',144)
assert hero.hp==hp-22 and c.seen[1][1] and not c.seen[2][1]
until(state,slot,'FSP03',158)
assert hero.hp==hp-22
spot(hero,second)
hero.inv=0
until(state,slot,'FSP03',215)
assert hero.hp==hp-22
until(state,slot,'FSP03',216)
assert hero.hp==hp-44 and c.seen[2][1]
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert number_marks(png)==[('2',round(second,5))]
until(state,slot,'FSP03',240)
recovery=core.frame(state,'sprite')
assert boss.form=='recover' and recovery.fieldBoss.recoveryTicks==144 and recovery.fieldBoss.echoLanes is None
assert not number_marks(recovery)
assert strike(state,boss)==base

# Saving or crossing a gate keeps body HP and discards the cast's positions and hit windows.
state,slot,boss,hero=make()
strike(state,boss)
until(state,slot,'FSP03',144)
hp=boss.hp
snap=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(snap,recursive=True),12)
assert restored.fieldSlots[boss_id].enemy.hp==hp and restored.fieldSlots[boss_id].cast is None
enter(restored)
assert len(restored.enemies)==1 and not restored.fieldSlots[boss_id].enemy.underground
portal(state,65,road)
assert slot.cast is None and boss.form=='idle' and boss.hp==hp
portal(state,850,arena)
spot(hero,boss.x-94)
hero.hp=hero.maxhp
until(state,slot,'FSP03',215)
assert boss.hp==hp and len(state.enemies)==1
spot(hero,center(slot.cast.lanes[2]))
hp,mora,kills=hero.hp,state.mora,state.kills
boss.hp=1
assert strike(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
ticks(state)
assert hero.hp==hp and len(state.enemies)==1 and state.kills==kills+1
assert state.mora==mora+420 and state.story.quests[quest].count==1
snap=validate_save(native(core.checkpoint(state)))
assert snap['fieldBosses'][boss_id]['waitTicks']==3599
restored=core.restore(lua.table_from(snap,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert (restored.progression.questXp-xp,restored.mora-mora)==(8600,560)

state,slot,boss,hero=make()
boss.x=400
spot(hero,350)
edge=until(state,slot,'FSP03',64)
assert edge.dir==1 and edge.lanes[1].left>boss.x and edge.lanes[2].right<1580
assert edge.lanes[1].right<edge.lanes[2].left

def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(150*60):
        if boss.hp<=0:
            assert moves=={'FSP01','FSP02','FSP03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        direction=(1 if dx>0 else -1) if abs(dx)>70 or turn else 0
        ticks(state,inputs=lua.table_from(dict(right=direction>0,left=direction<0,
            attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))

result=dict(twoSweepWindowsAndFixedIceCenters=True,echoesAreNonTargetable=True,bodyVisibleAndTargetable=True,
    fixedEchoWindows=[[144,158],[216,230]],echoesDoNotConsumeHitLimit=True,damagePerEcho=22,
    recoveryTicks=144,noRecoveryDamageMultiplier=True,terminalDefeatCancelsSecondEcho=True,
    saveExitKeepHpAndClearCast=True,oneRewardAndReport=True,edgeLanesFaceInward=True,
    normalAttackWithoutHealing=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/spiritspeaker-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
