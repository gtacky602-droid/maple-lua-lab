import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,approach,arena='natlan-hub','natlan-field','papilla-field-hollow'
boss_id,quest='boss-22120101','papilla-commission'
empty=lua.table()
design=json.loads((ROOT/'docs/field-boss-v1/MANIFEST_NATLAN_ORIGINS.json').read_text(encoding='utf8'))
configs=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8-sig'))
spec=next(r for r in configs['fieldBosses'] if r['id']==boss_id)
for card,move in zip((c for c in design['attacks'] if c['owner']==boss_id),spec['moves'],strict=True):
    assert (move['id'],move['lock'],move['total'],move['element'].title())==(
        card['id'],card['lock'],card['total'],card['element'])
    assert [move['recover'],move['total']]==card['recovery']
    assert move['active']==[w[:2] for w in card['active']]
    assert [0,move['morph']]==card['morph'] and [move['returnMorph'],move['total']]==card['return_morph']
    assert ([move['air']] if 'air' in move else [])==card['air']


def spot(actor,x,y=480):
    actor.x,actor.y,actor.vy,actor.ground,actor.dir=x,y,0,y==480,1


def portal(state,x,node):
    spot(state.actors[1],x)
    core.action(state,'story_nearby_portal')
    assert state.story.node==node


def make(fixture=False):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[107]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        save=validate_save(native(core.checkpoint(state)))
        save['companion']='columbina'
        (ROOT/'work/papilla-field-fixture.json').write_text(json.dumps(save),encoding='utf8')
    core.action(state,'story_accept:'+quest)
    assert state.story.quests[quest].status=='active'
    portal(state,1380,'natlan-quarry-road')
    portal(state,64,approach)
    portal(state,235,arena)
    state.actors[2].hp=0
    slot=state.fieldSlots[boss_id]
    spot(state.actors[1],slot.enemy.x-113)
    return state,slot,slot.enemy,state.actors[1]


def ticks(state,count=1,inputs=empty):
    for _ in range(count):
        core.step(state,1/60,inputs)


def until(state,slot,move,tick):
    for _ in range(2000):
        c=slot.cast
        if c and c.move.id==move and c.tick==tick:
            return c
        ticks(state)
    raise AssertionError((move,tick,slot.phase,state.actors[1].hp))


def direct(state,boss,element='physical',y=480,**changes):
    data=dict(id=1,atk=20,x=boss.x,y=y,dir=1,radial=True,range=145,limit=6,mult=1,
              color='#ffdaff',gain=0,element=element,startedAt=state.t,critRate=0)
    return lua.table_from(data | changes)


def damage(state,boss,element='physical',y=480,**changes):
    hp,hits=boss.hp,state.hits
    core.resolveCast(state,direct(state,boss,element,y,**changes))
    assert state.hits-hits==int(hp>boss.hp)
    return hp-boss.hp


def same_receiver(state,slot,boss):
    assert len(state.enemies)==1 and lua.eval('rawequal')(state.enemies[1],boss)
    assert lua.eval('rawequal')(boss,slot.enemy) and boss.id==22120101
    assert boss.sharedHealth is None and boss.weakpoint is None and boss.immune is None
    assert not boss.underground and not boss.invulnerable and not boss.flying


state,slot,boss,hero=make(fixture=True)
same_receiver(state,slot,boss)
assert (boss.level,boss.hp,boss.form)==(108,1050,'root')
assert math.isclose(boss.hitBottom,480-.3*88)
normal=damage(state,boss)
assert normal>0
stem=until(state,slot,'FMP01',14)
assert boss.form=='morphing' and boss.pose=='idle'
assert damage(state,boss,'hydro')==normal
assert boss.aura.element=='hydro'
aura=boss.aura.expires
hp=boss.hp
cast=direct(state,boss,targetId=boss.id,remaining=1,next=state.t+40/60,interval=.1)
state.pending[len(state.pending)+1]=cast
until(state,slot,'FMP01',49)
same_receiver(state,slot,boss)
assert boss.form=='stem' and boss.pose=='stem-ready' and boss.hp==hp
assert boss.aura.element=='hydro' and boss.aura.expires==aura
until(state,slot,'FMP01',55)
assert boss.hp==hp-normal
# The real reaction applies to the same actor throughout the attack and return.
assert damage(state,boss,'dendro',key='test-dendro')==normal
assert damage(state,boss,'pyro',key='test-pyro')==normal
burn=boss.burning
until(state,slot,'FMP01',60)
left,right=stem.left,stem.right
assert math.isclose(right-left,(1.7-.35)*88)
spot(hero,stem.origin+85)
hp=hero.hp
until(state,slot,'FMP01',135)
assert (stem.left,stem.right)==(left,right) and not stem.seen[1][1] and hero.hp==hp
spot(hero,stem.origin-92)
until(state,slot,'FMP01',143)
assert hero.hp==hp-21 and stem.seen[1][1] and stem.source.damageElement=='electro'
assert lua.eval('rawequal')(boss.burning,burn) and burn.remaining<4
assert damage(state,boss,'electro')==normal
until(state,slot,'FMP01',279)
assert boss.form=='returning' and damage(state,boss)==normal
same_receiver(state,slot,boss)
assert any(e.kind=='hit' and e.reaction and e.target==boss.id for e in state.events.values())

wing=until(state,slot,'FMP02',60)
spot(hero,wing.origin-88)
hp=hero.hp
until(state,slot,'FMP02',137)
assert boss.form=='wing' and boss.pose=='wing-strike' and hero.hp==hp-18
assert '機竜影 1/2' in core.frame(state,'sprite','legacy').fieldBoss.label
assert wing.seen[1][1] and not wing.seen[2][1] and damage(state,boss,'physical')==normal
until(state,slot,'FMP02',197)
assert hero.hp==hp-36 and wing.seen[2][1] and wing.source.damageElement=='physical'
assert '機竜影 2/2' in core.frame(state,'sprite','legacy').fieldBoss.label
same_receiver(state,slot,boss)

spot(hero,boss.x-150)
fungus=until(state,slot,'FMP03',60)
assert math.isclose(fungus.origin-fungus.dest,1.4*88)
spot(hero,fungus.dest+142)
until(state,slot,'FMP03',114)
assert boss.form=='airborne' and math.isclose(boss.y,480-.83*88)
assert math.isclose(boss.x,(fungus.origin+fungus.dest)/2)
same_receiver(state,slot,boss)
assert damage(state,boss)==0 and damage(state,boss,'dendro',boss.y)==normal
png,standard,light=[core.frame(state,mode,profile) for mode,profile in
                   [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert png.t==standard.t==light.t and light.commands<standard.commands
assert any(d.source=='papilla-field-poses-source-v1.png' and d.y==boss.y for d in png.draws.values())
marker=next(d for d in png.draws.values() if d.kind=='text' and d.text=='着地')
assert marker.y==501 and math.isclose(marker.x+png.camera,fungus.dest)
hp=boss.hp
save=validate_save(native(core.checkpoint(state)))
restored=core.restore(lua.table_from(save,recursive=True),12)
restored_slot=restored.fieldSlots[boss_id]
assert restored.story.node==hub and restored_slot.enemy.hp==hp and restored_slot.cast is None
portal(restored,1380,'natlan-quarry-road')
portal(restored,64,approach)
portal(restored,235,arena)
assert restored_slot.enemy.form=='root' and restored_slot.enemy.y==480
same_receiver(restored,restored_slot,restored_slot.enemy)
spot(hero,fungus.dest)
hp=hero.hp
until(state,slot,'FMP03',131)
assert hero.hp==hp and not fungus.seen[1][1]
until(state,slot,'FMP03',143)
assert hero.hp==hp-26 and fungus.seen[1][1] and boss.x==fungus.dest and boss.y==480
assert fungus.source.damageElement=='dendro'
until(state,slot,'FMP03',180)
assert boss.form=='recover' and fungus.move.total-180==144
assert core.frame(state,'sprite','legacy').fieldBoss.recoveryTicks==144

hp=boss.hp
portal(state,65,approach)
assert boss.form=='root' and boss.y==480 and slot.cast is None
ticks(state,spec['leashTicks']+60)
portal(state,235,arena)
assert boss.hp==hp and lua.eval('rawequal')(slot.enemy,boss)
spot(hero,boss.x-105)
hero.hp=hero.maxhp
until(state,slot,'FMP01',25)
boss.hp=1
kills,mora=state.kills,state.mora
assert damage(state,boss)==1 and slot.phase=='respawn' and slot.cast is None
assert damage(state,boss)==0
assert state.kills==kills+1 and state.mora==mora+395 and state.story.quests[quest].count==1
save=validate_save(native(core.checkpoint(state)))
assert save['fieldBosses'][boss_id]['waitTicks']==3600
restored=core.restore(lua.table_from(save,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):
    core.action(restored,'story_report:'+quest)
assert restored.progression.questXp-xp==7800 and restored.mora-mora==500


def solo():
    state,slot,boss,hero=make()
    moves=set()
    for _ in range(125*60):
        if boss.hp<=0:
            assert moves=={'FMP01','FMP02','FMP03'} and state.returns==0
            return dict(seconds=round(state.t,2),hp=hero.hp)
        dx=boss.x-hero.x
        turn=abs(dx)>8 and dx*hero.dir<0
        c=slot.cast
        if c:
            moves.add(c.move.id)
            if hero.ground and any(w[1]-23<=c.tick<=w[1]-16 for w in c.move.active.values()):
                core.action(state,'jump')
        ticks(state,inputs=lua.table_from(dict(right=dx>83 or (turn and dx>0),
            left=dx<-83 or (turn and dx<0),attack=abs(dx)<116 and not turn,jump=True)))
        assert state.returns==0,(state.t,boss.hp,hero.hp)
    raise AssertionError((state.t,boss.hp,hero.hp))


result=dict(designTimingsMatch=True,oneActorAndReceiver=True,auraBurnAndPendingTargetPreserved=True,
            noCopiedImmunityOrWeakpoint=True,groundAndAirHurtboxes=True,firstAttackLocked=True,
            strikesPerAttack=[1,2,1],restoresRootWithoutRestoringHp=True,
            earlyKillOneReward=True,questReportAndSavedCooldown=True,normalAttackSolo=solo(),
            sameSceneCommands=dict(png=png.commands,standard=standard.commands,light=light.commands))
(ROOT/'evidence/papilla-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
