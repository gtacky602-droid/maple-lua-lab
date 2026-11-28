import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'natlan-hub', 'natlan-field', 'config-device-field-workshop'
boss_id, quest = 'boss-24090201', 'config-device-commission'
empty = lua.table()
design = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_NATLAN_ORIGINS.json').read_text(encoding='utf8'))
configs = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8-sig'))
spec = next(r for r in configs['fieldBosses'] if r['id']==boss_id)
for card, move in zip((a for a in design['attacks'] if a['owner']==boss_id), spec['moves'], strict=True):
    assert (move['id'],move['lock'],move['total'],move['element'].title()) == (
        card['id'],card['lock'],card['total'],card['element'])
    assert [move['recover'],move['total']] == card['recovery']
    assert move['active'] == [w[:2] for w in card['active']]
assert spec['moves'][2]['spawn']==design['interrupt']['spawn_tick']
assert [spec['moves'][2]['lock'],spec['moves'][2]['close']]==design['interrupt']['acceptance']


def spot(actor,x,y=480,direction=1):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,direction


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[105]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='columbina'
        (ROOT/'work/config-device-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    portal(state,1380,'natlan-quarry-road')
    portal(state,64,approach)
    portal(state,435,arena)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-86)
    return state,slot,slot.enemy,state.actors[1]


def ticks(state,count=1,inputs=empty):
    for _ in range(count):
        core.step(state,1/60,inputs)


def until(state,slot,move,tick):
    for _ in range(2300):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,state.actors[1].hp))


def direct(state,x,**changes):
    data=dict(id=1,atk=20,x=x,y=480,dir=1,radial=True,range=122,limit=2,mult=1,
              color='#fff0ac',gain=2,element='physical',startedAt=state.t,critRate=0)
    return lua.table_from(data | changes)


state,slot,boss,hero=make(fixture=True)
assert (boss.level,boss.hp)==(106,1020)
assert math.isclose(boss.hitBottom,480-.4*88,abs_tol=1e-8)
assert 480-boss.hitBottom<75
claw=until(state,slot,'FSC01',48)
locked=(claw.left,claw.right)
spot(hero,claw.origin+86)
until(state,slot,'FSC01',113)
assert not claw.seen[1][hero.id] and (claw.left,claw.right)==locked
spot(hero,claw.origin-86)
hp=hero.hp
until(state,slot,'FSC01',173)
assert hero.hp==hp-18 and claw.seen[2][hero.id]
beam=until(state,slot,'FSC02',107)
assert math.isclose(beam.right-beam.left,1.95*88)
spot(hero,beam.origin-86,360)
until(state,slot,'FSC02',119)
assert not beam.seen[1][hero.id]
spot(hero,beam.origin-86)
hp=hero.hp
until(state,slot,'FSC02',179)
assert hero.hp==hp-19 and beam.seen[2][hero.id]
charge=until(state,slot,'FSC03',48)
collector=charge.summon
assert collector.hp==3 and collector.underground
assert math.isclose(collector.hitBottom,480-.15*88)
assert math.isclose(charge.origin-collector.x,.9*88)
until(state,slot,'FSC03',54)
spot(hero,collector.x,direction=1)
assert core.attack(state,hero,'normal')
assert collector.hp==3
until(state,slot,'FSC03',63)
assert collector.hp==3 and not collector.underground  # The t54 normal's delayed second pulse arrived after opening.
assert math.isclose(charge.right-charge.left,1.6*88)
gauge=state.gauge
core.resolveCast(state,direct(state,collector.x,targetId=collector.id,reaction=True))
assert collector.hp==3 and state.gauge==gauge

until(state,slot,'FSC03',96)
hp,kills,mora,hits=boss.hp,state.kills,state.mora,state.hits
assert core.attack(state,hero,'normal')
assert collector.hp==2 and boss.hp<hp and state.hits==hits+1
until(state,slot,'FSC03',109)
assert collector.hp==2 and state.hits==hits+2
state.companion='columbina'
ally=state.actors[2]
ally.hp=ally.maxhp
spot(ally,collector.x)
assert core.attack(state,ally,'normal')
until(state,slot,'FSC03',137)
assert collector.hp==1
ally.hp=0
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert png.fieldBoss.summon.hp==1
assert 'あと1回・受付あと' in png.fieldBoss.label
marker=next(d for d in png.draws.values() if d.kind=='text' and d.text=='着弾')
assert marker.y==501 and math.isclose(marker.x+png.camera,(charge.left+charge.right)/2)
assert sum(1 for d in png.draws.values() if d.source=='config-device-field-poses-source-v1.png')==2
until(state,slot,'FSC03',299)
assert core.attack(state,hero,'normal')
assert collector.hp==0 and state.kills==kills and state.mora==mora
ticks(state)
assert charge.brokenAt==300 and charge.summon is None and len(state.enemies)==1
assert boss.form=='down' and boss.hitBottom==480
assert core.frame(state,'sprite','legacy').fieldBoss.recoveryTicks==180
spot(hero,(charge.left+charge.right)/2)
hp=hero.hp
until(state,slot,'FSC03',479)
assert boss.form=='down' and hero.hp==hp and not charge.seen[1][hero.id]
until(state,slot,'FSC03',480)
assert boss.form=='stand'
assert core.frame(state,'sprite','legacy').fieldBoss.recoveryTicks is None
until(state,slot,'FSC03',503)
assert boss.form=='stand'
ticks(state)
assert boss.form=='hover' and slot.cast is None and math.isclose(boss.rearmAt-state.t,20)
spot(hero,boss.x-86)
rearm=until(state,slot,'FSC03',60)
assert rearm.collectorX and not rearm.summon and state.t<boss.rearmAt
hero.hp=hero.maxhp
spot(hero,rearm.right+20)
until(state,slot,'FSC03',328)
assert not rearm.seen[1][hero.id]

# In a fresh attempt the same local attack lands once when the player stays in its fixed column.
state,slot,boss,hero=make()
charge=until(state,slot,'FSC03',60)
locked=(charge.left,charge.right)
spot(hero,charge.right+60)
until(state,slot,'FSC03',300)
assert charge.summon is None and len(state.enemies)==1
assert '集積器を攻撃できない' in core.frame(state,'sprite','legacy').fieldBoss.label
spot(hero,sum(locked)/2)
hp=hero.hp
until(state,slot,'FSC03',323)
assert hero.hp==hp and (charge.left,charge.right)==locked
until(state,slot,'FSC03',341)
assert hero.hp==hp-34 and charge.seen[1][hero.id]
until(state,slot,'FSC03',360)
assert core.frame(state,'sprite','legacy').fieldBoss.recoveryTicks==144

hero.hp=hero.maxhp
spot(hero,boss.x-86)
charge=until(state,slot,'FSC03',60)
collector=charge.summon
core.resolveCast(state,direct(state,collector.x,targetId=collector.id))
assert collector.hp==2
portal(state,65,approach)
assert charge.summon is None and slot.cast is None
portal(state,435,arena)
hero.hp=hero.maxhp
spot(hero,boss.x-86)
charge=until(state,slot,'FSC03',60)
collector=charge.summon
assert collector.hp==3
for _ in range(2):
    core.resolveCast(state,direct(state,collector.x,targetId=collector.id))
boss.hp=1
kills,mora=state.kills,state.mora
core.resolveCast(state,direct(state,collector.x))
assert slot.phase=='respawn' and slot.cast is None and charge.summon is None and len(state.enemies)==1
assert state.kills==kills+1 and state.mora==mora+380 and state.story.quests[quest].count==1
save=validate_save(native(core.checkpoint(state)))
assert save['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(save,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==7600 and restored.mora-mora==480


def solo_without_interrupt():
    state,slot,boss,hero=make()
    attacks=set()
    left=lua.table_from(dict(left=True))
    right=lua.table_from(dict(right=True))
    swing=lua.table_from(dict(attack=True))
    for _ in range(126*60):
        if boss.hp<=0:
            assert attacks=={'FSC01','FSC02','FSC03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        c=slot.cast
        # Stand just beside the core, outside the attack lanes. Step behind
        # the locked cannon before it hits. Strikes here face away from the collector.
        if c:
            attacks.add(c.move.id)
            assert not c.brokenAt
        if c and c.move.id=='FSC03' and 260<=c.tick<343:
            inputs=right if hero.x<c.right+25 else empty
        elif hero.x>boss.x-(9 if hero.dir<0 else 4):
            inputs=left
        elif hero.x<boss.x-11 or hero.dir<0:
            inputs=right
        else:
            inputs=swing
        ticks(state,inputs=inputs)
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(designTimingsMatch=True, twoClawAndBeamWindows=True, fixedAim=True, groundedPhysicalHits=True,
            prewindowAndReactionRejected=True, distinctPlayerAndCompanionCasts=True,
            bossAndCollectorOneContactEach=True, lastTickInterrupt=True, downTicks=180, standupTicks=24,
            rearmTicks=1200, unbrokenLocalHit=True, missedColumnWithoutDamage=True,
            exitClearsProgress=True, bossDeathPriority=True, questReportAndSavedCooldown=True,
            normalAttackWithoutInterrupt=solo_without_interrupt(),
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/config-device-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
