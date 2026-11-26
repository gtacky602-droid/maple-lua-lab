import json
import math

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, approach, arena = 'sumeru-hub', 'sumeru-entry', 'baptist-field-sanctuary'
boss_id, quest = 'boss-22100501', 'baptist-commission'
empty = lua.table()
spec = next(entry for entry in json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
            if entry['id'] == boss_id)
design = json.loads((ROOT/'docs/field-boss-v1/MANIFEST_SUMERU_FIELD.json').read_text(encoding='utf8'))
cards = {row['id']:row for row in design['attacks'] if row['owner'] == boss_id}
assert set(cards) == {move['id'] for move in spec['moves']}
for move in spec['moves']:
    card = cards[move['id']]
    assert (move['lock'], move['total'], move['active']) == (
        card['lock'], card['total'], [window[:2] for window in card['windows']])
    assert [move['recover'], move['total']] == card['recovery']
    assert [[t, move['life']] for t in move.get('fire', [])] == [shot[:2] for shot in card['projectiles']]
    if 'slot' in move:
        assert move['slot'] == card['element_slot'] + 1

hits = lua.eval("""function(core, id)
    local damage, hits = core.damageActor, {}
    core.damageActor = function(state, actor, base, source, ...)
        if source and source.id == id and actor.id == 1 then
            hits[#hits+1] = source.damageElement
        end
        return damage(state, actor, base, source, ...)
    end
    return hits
end""")(core, spec['entity'])


def spot(player, x):
    player.x, player.y, player.vy, player.inv, player.ground = x, 480, 0, 0, True


def enter(game, x, node):
    spot(game.actors[1], x)
    core.action(game, 'story_nearby_portal')
    assert game.story.node == node


def make(fixture=False):
    game = core.new(12)
    core.action(game, 'story_start')
    core.grantExp(game, LEVELS[73]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(game, hub)
    core.action(game, 'story_accept:'+quest)
    assert game.story.quests[quest].status == 'active'
    if fixture:
        (ROOT/'work').mkdir(exist_ok=True)
        saved = validate_save(native(core.checkpoint(game)))
        (ROOT/'work/baptist-field-fixture.json').write_text(json.dumps(saved), encoding='utf8')
    enter(game,60,approach)
    enter(game,510,arena)
    game.actors[2].hp = 0
    return game,game.fieldSlots[boss_id],game.actors[1]


def until(game, slot, move, tick):
    for _ in range(1900):
        cast = slot.cast
        if cast and cast.move.id == move and cast.tick == tick:
            return cast
        core.step(game,1/60,empty)
    raise AssertionError((move,tick,slot.phase))


def hit(game, x, **extras):
    attack = dict(id=1,atk=20,x=x,y=480,dir=1,radial=True,range=125,limit=2,mult=1,
                  color='#fff0ac',gain=0,element='physical',critRate=0)
    core.resolveCast(game,lua.table_from(attack|extras))


game, slot, hero = make(fixture=True)
boss = slot.enemy
elements = list(boss.elementSlots.values())
assert elements == spec['elementVariants'][0] and math.isclose(480-boss.hitBottom,.25*88)
spot(hero,boss.x-110)
assert list(core.frame(game,'sprite').fieldBoss.elementSlots.values()) == elements
bolt = until(game,slot,'FIB01',42)
assert bolt.dir == -1
hp = hero.hp
for i,fire in enumerate((84,132),1):
    until(game,slot,'FIB01',fire-1)
    spot(hero,bolt.origin+110)
    until(game,slot,'FIB01',fire)
    assert bolt.projectiles[i].damageElement == elements[0] and bolt.dir == -1
    spot(hero,bolt.origin-110)
    until(game,slot,'FIB01',fire+25)
    assert bolt.shots[i] and hero.hp == hp-16*i
assert list(hits.values()) == [elements[0]]*2

fall = until(game,slot,'FIB02',48)
centers = [fall.center+(i-1)*fall.move.spacing*88*fall.dir for i in range(3)]
assert min((x-fall.origin)*fall.dir for x in centers)>0
assert min(abs(a-b) for a,b in zip(centers,centers[1:])) >= 88
hp = hero.hp
for i,(x,start) in enumerate(zip(centers,(108,150,192)),1):
    until(game,slot,'FIB02',start-1)
    spot(hero,x)
    assert hero.hp == hp-20*(i-1)
    until(game,slot,'FIB02',start+2)
    assert hero.hp == hp-20*i and fall.seen[i][1]
assert list(hits.values()) == [elements[0]]*2 + [elements[1]]*3

spot(hero,boss.x-110)
hero.hp=hero.maxhp
rings = until(game,slot,'FIB03',60)
centers = [rings.center+(i-1)*rings.move.spacing*88 for i in range(3)]
assert all(abs(a-b)>=1.2*88 for a,b in zip(centers,centers[1:]))
assert len(game.enemies)==1 and not boss.invulnerable
hp = boss.hp
hit(game,boss.x-45)
assert boss.hp<hp
hp = hero.hp
png = core.frame(game,'sprite')
standard, light = (core.frame(game,'rect',p) for p in ('legacy','h32c16'))
assert png.t == standard.t == light.t and light.commands < standard.commands
for i,(x,start) in enumerate(zip(centers,(120,156,192)),1):
    until(game,slot,'FIB03',start-1)
    spot(hero,x+rings.move.spacing*88/2)
    until(game,slot,'FIB03',start)
    assert hero.hp == hp-22*(i-1) and not rings.seen[i][1]
    spot(hero,x)
    until(game,slot,'FIB03',start+2)
    assert hero.hp == hp-22*i and rings.seen[i][1]
assert list(hits.values()) == [elements[0]]*2 + [elements[1]]*3 + elements
damage_tags = dict(bolts=list(hits.values())[:2], falls=list(hits.values())[2:5], rings=list(hits.values())[5:8])
until(game,slot,'FIB03',210)
boss.hp=1
hit(game,boss.x)
assert slot.cast is None and slot.phase=='respawn' and game.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(game)))
assert saved['fieldBosses'][boss_id]['waitTicks']==3600
reloaded=core.restore(lua.table_from(saved,recursive=True),12)
xp,mora=reloaded.progression.questXp,reloaded.mora
for _ in range(2):
    core.action(reloaded,'story_report:'+quest)
assert (reloaded.progression.questXp-xp,reloaded.mora-mora)==(4600,330)

spot(hero,70)
for _ in range(3601):
    core.step(game,1/60,empty)
assert slot.generation==2 and list(slot.enemy.elementSlots.values())==spec['elementVariants'][1]
enter(game,65,approach)
enter(game,510,arena)
assert slot.generation==2 and list(slot.enemy.elementSlots.values())==spec['elementVariants'][1]

variants=[]
for generation,variant in enumerate(spec['elementVariants'],1):
    saved_variant=validate_save(native(core.checkpoint(game)))
    saved_variant['fieldBosses'][boss_id]['generation']=generation
    copy=core.restore(lua.table_from(saved_variant,recursive=True),12)
    core.enterStoryNode(copy,arena)
    copy_slot=copy.fieldSlots[boss_id]
    assert list(copy_slot.enemy.elementSlots.values())==variant
    spot(copy.actors[1],copy_slot.enemy.x-105)
    copy.actors[2].hp=0
    cast=until(copy,copy_slot,'FIB03',60)
    assert [s.damageElement for s in cast.sources.values()]==variant
    copy.actors[1].hp = copy.actors[1].maxhp
    offset=len(hits)
    for i,start in enumerate((120,156,192)):
        until(copy,copy_slot,'FIB03',start-1)
        spot(copy.actors[1],cast.center+(i-1)*cast.move.spacing*88)
        until(copy,copy_slot,'FIB03',start)
    assert list(hits.values())[offset:]==variant
    variants.append(variant)
assert len({frozenset(v) for v in variants})==4

edge_game,edge_slot,edge_hero=make()
edge_slot.enemy.x=spec['arenaMin']+63
spot(edge_hero,spec['arenaMin']+2)
edge_fall=until(edge_game,edge_slot,'FIB02',48)
assert edge_fall.dir==1
assert edge_fall.center-edge_fall.move.spacing*88>edge_fall.origin
edge_rings=until(edge_game,edge_slot,'FIB03',60)
assert math.isclose(edge_rings.center-(edge_rings.move.spacing+edge_rings.move.width/2)*88,spec['arenaMin']+44)

def solo_normal_clear():
    state,fight,player=make()
    enemy=fight.enemy
    start=state.t
    jumps={'FIB01':(74,122),'FIB02':(),'FIB03':()}
    for _ in range(130*60):
        if enemy.hp<=0:
            return dict(seconds=round(state.t-start,2),hp=player.hp)
        reach=enemy.x-player.x
        dx=reach
        cast=fight.cast
        dodge=bool(cast and cast.tick in jumps[cast.move.id])
        if cast and cast.move.kind in ('fall','rings') and cast.tick>=cast.move.lock:
            m=cast.move
            direction=cast.dir if m.kind=='fall' else 1
            for i,w in enumerate(m.active.values()):
                x=cast.center+(i-1)*m.spacing*88*direction
                if w[1]-26<=cast.tick<w[2] and abs(player.x-x)<47:
                    dx=(1 if player.x>=x else -1)*180
        turn=dx*player.dir<0
        if dodge and player.ground:
            core.action(state,'jump')
        core.step(state,1/60,lua.table_from(dict(
            right=dx>109 or (turn and dx>0),left=dx<-109 or (turn and dx<0),
            attack=abs(reach)<125 and reach*player.dir>=0 and abs(dx)<125,jump=True)))
        assert state.returns==0,(state.t,enemy.hp,player.hp)
    raise AssertionError((enemy.hp,player.hp))


result=dict(
    attacks=sorted(cards),designTiming=True,physicalHitsThroughRings=True,
    twoLockedBolts=True,fallUsesOneSlot=True,
    damageTags=damage_tags,validRingGaps=True,edgeTelegraphsRemainInBounds=True,
    fourVariantsDealMatchingDamageAfterRestore=variants,respawnAdvancesVariant=True,
    questReportOnce=True,normalAttackSolo=solo_normal_clear(),
    commands=dict(png=png.commands,standard=standard.commands,light=light.commands),
    killXp=LEVELS[73]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss'],
)
(ROOT/'evidence/baptist-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
