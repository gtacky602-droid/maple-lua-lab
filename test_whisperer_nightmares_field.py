import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
boss_id, quest = 'boss-22150101', 'whisperer-nightmares-commission'
hub, road, arena = 'nod-town', 'nod-field', 'nod-nightmare-shore'
empty = lua.table()


def spot(actor, x, y=480):
    actor.x, actor.y, actor.vy, actor.ground, actor.dir = x, y, 0, y == 480, 1


def portal(state, x, node):
    spot(state.actors[1], x)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == node


def enter(state):
    portal(state, 60, road)
    portal(state, 330, arena)


def make(fixture=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[127]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if fixture:
        core.enterStoryNode(state,'natlan-hub')
        core.enterStoryNode(state,hub)
        saved = validate_save(native(core.checkpoint(state)))
        saved['companion'] = 'wanderer'
        saved['loadout'][0] = ['SK21']
        saved['loadout'][1] = ['SK22']
        (ROOT/'work/whisperer-nightmares-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    core.action(state, 'story_accept:'+quest)
    enter(state)
    state.actors[2].hp = 0
    slot = state.fieldSlots[boss_id]
    spot(state.actors[1], slot.enemy.x-88)
    return state, slot, slot.enemy, state.actors[1]


def ticks(state, count=1, inputs=empty):
    for _ in range(count):
        core.step(state, 1/60, inputs)


def until(state, slot, move, tick):
    for _ in range(2600):
        c = slot.cast
        if c and c.move.id == move and c.tick == tick:
            return c
        ticks(state)
    raise AssertionError((move, tick, slot.phase, slot.enemy.form, state.actors[1].hp))


def strike(state, target, element='physical', **changes):
    hp = target.hp
    attack = dict(id=1, atk=24, x=target.x, y=480, dir=1, radial=True, range=150, limit=1,
                  mult=1, color='#f5b8ff', gain=0, element=element, startedAt=state.t, critRate=0,
                  targetId=target.id)
    attack.update(changes)
    core.resolveCast(state, lua.table_from(attack))
    return hp-target.hp

state, slot, boss, hero = make(fixture=True)
assert (boss.level, boss.hp, boss.form) == (128, 1340, 'idle')
base = strike(state, boss)
lunge = until(state, slot, 'FWN01', 48)
lane = lunge.left, lunge.right
spot(hero, lunge.origin+64)
hp = hero.hp
until(state, slot, 'FWN01', 107)
assert hero.hp == hp and not lunge.seen[1][1]
spot(hero, sum(lane)/2)
until(state, slot, 'FWN01', 125)
assert hero.hp == hp-24 and lunge.seen[1][1] and (lunge.left, lunge.right) == lane

spot(hero,boss.x-90)
rift = until(state,slot,'FWN02',84)
destination=rift.destination
assert boss.underground and strike(state,boss)==0
assert core.frame(state).fieldBoss.fixedRift.center==destination
assert [d.text for d in core.frame(state,'sprite').draws.values() if d.kind=='text' and d.y==500]==['裂け目']
until(state,slot,'FWN02',119)
assert boss.underground
ticks(state)
assert not boss.underground and boss.x==destination and boss.pose=='emerge'
spot(hero,destination)
hp=hero.hp
until(state,slot,'FWN02',143)
assert hero.hp==hp
ticks(state)
assert hero.hp==hp-28

spot(hero,boss.x-88)
c=until(state,slot,'FWN03',72)
first,second=c.summons.values()
assert first.hp==second.hp==60 and len(state.enemies)==3
assert (first.x-boss.x)*(second.x-boss.x)>0
assert strike(state,boss)==base and boss.damageShield==0
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                    [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.darkShield is None and png.fieldBoss.fisherSequence.remainingTicks==228
assert [d.text for d in png.draws.values() if d.kind=='text' and d.y==500]==['1','2']
assert len([d for d in png.draws.values() if d.source=='whisperer-nightmares-field-poses-source-v1.png'])==3
spot(hero,first.x)
hp=hero.hp
until(state,slot,'FWN03',155)
assert hero.hp==hp
ticks(state)
assert hero.hp==hp-9 and c.seen[1][1]
until(state,slot,'FWN03',227)
assert hero.hp==hp-9 and not c.seen[2][1]
spot(hero,second.x)
hero.inv=0
ticks(state)
assert hero.hp==hp-18 and c.seen[2][1]
until(state,slot,'FWN03',300)
assert c.summons is None and c.defeatedFishers==0 and c.broken is None
spot(hero,sum((c.left,c.right))/2)
hero.inv=0
until(state,slot,'FWN03',323)
assert hero.hp==hp-18
ticks(state)
assert hero.hp==hp-56 and c.seen[3][1]
until(state,slot,'FWN03',360)
assert core.frame(state).fieldBoss.recoveryTicks==144

# One defeated fisher cancels its own strike. A second defeat at tick 299 cancels the release.
state,slot,boss,hero=make()
c=until(state,slot,'FWN03',72)
first,second=c.summons.values()
hp,kills,mora=boss.hp,state.kills,state.mora
assert strike(state,first,atk=100)==60
spot(hero,first.x)
hero_hp=hero.hp
until(state,slot,'FWN03',167)
assert hero.hp==hero_hp and not c.seen[1][1] and c.defeatedFishers==1
until(state,slot,'FWN03',299)
assert strike(state,second,atk=100)==60
ticks(state)
assert c.broken==300 and c.defeatedFishers==2 and len(state.enemies)==1
assert boss.form=='down' and core.frame(state).fieldBoss.recoveryTicks==180
spot(hero,(c.left+c.right)/2)
hero_hp=hero.hp
until(state,slot,'FWN03',479)
assert hero.hp==hero_hp and not c.seen[3][1]
assert (boss.hp,state.kills,state.mora)==(hp,kills,mora)

# Persist only body HP and the respawn clock, not old telegraphs or summon objects.
state,slot,boss,hero=make()
strike(state,boss)
c=until(state,slot,'FWN03',72)
save=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(save,recursive=True),12)
enter(restored)
fresh=restored.fieldSlots[boss_id]
assert fresh.cast is None and fresh.enemy.hp==boss.hp and len(restored.enemies)==1
hp=boss.hp
portal(state,65,road)
assert slot.cast is None and c.summons is None
portal(state,330,arena)
assert boss.hp==hp and len(state.enemies)==1
hero.hp=hero.maxhp
spot(hero,boss.x-88)
c=until(state,slot,'FWN03',72)
boss.hp=1
mora=state.mora
assert strike(state,boss)==1 and state.mora==mora+475 and slot.phase=='respawn'
assert slot.cast is None and c.summons is None
assert state.story.quests[quest].count==1
save=validate_save(native(core.checkpoint(state)))
assert save['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(save,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2): core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==9200 and restored.mora-mora==630

state,slot,boss,hero=make()
edge=until(state,slot,'FWN03',1)
boss.x=edge.origin=405
spot(hero,345)
until(state,slot,'FWN03',60)
assert edge.reposition and edge.left is None and edge.summons is None
ticks(state,100)
assert boss.x>405 and edge.summons is None


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(145*60):
        if boss.hp<=0:
            assert moves=={'FWN01','FWN02','FWN03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        ticks(state,inputs=lua.table_from(dict(right=dx>80 or (turn and dx>0),
            left=dx<-80 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(lockedLunge=True,hiddenTicks=36,visibleWarningTicks=24,fisherHp=60,sameSideFishers=True,
    damagePerGroup=[9,9,38],summoningKeepsBodyTargetable=True,separateFisherCancellation=True,
    lastAcceptedTick=299,interruptedOnTick=300,interruptedRecoveryTicks=180,naturalRecoveryTicks=144,
    savesBodyHpAndClearsCast=True,oneRewardAndReport=True,edgeReposition=True,normalAttackSolo=solo(),
    sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/whisperer-nightmares-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
