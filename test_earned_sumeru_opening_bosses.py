"""Play Sumeru's first two normal bosses on the earned Lv60 arrival save."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_enkanomiya_bathysmal import PREVIOUS, QUEST as BATHYSMAL
from test_earned_inazuma_bosses import collect
from test_earned_inazuma_sumeru import BEACONS, FLOOR, SEIRAI
from test_earned_survey_itineraries import SurveyJourney


SOURCE = ROOT/'work/earned-inazuma-sumeru/sumeru-arrival.json'
WORK = ROOT/'work/earned-sumeru-opening-bosses'
HUB, FOREST = 'sumeru-hub', 'sumeru-field'
LEAF, ROOTS, BANK = 'sumeru-leaf-crossing', 'sumeru-river-roots', 'sumeru-river-bank'
BOSSES = (
    ('jadeplume', 'boss-26110101', 'sumeru-jadeplume-grove', 60, ('FJ01', 'FJ02', 'FJ03')),
    ('electro-regisvine', 'boss-26020301', 'electro-regisvine-field-cave', 62, ('FER01', 'FER02', 'FER03')),
)
HISTORY = (*PREVIOUS, BATHYSMAL, SEIRAI, FLOOR, BEACONS)


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


def leaf_crossing(trip):
    start_level = trip.state.progression.level
    trip.act('story_accept:'+LEAF)
    trip.cross(ROOTS)
    q = trip.state.story.quests[LEAF]
    collect(trip, 315)
    collect(trip, 714, 391)
    collect(trip, 924, 391)
    assert q.count == 3 and any(p.leafBridge for p in trip.state.platforms.values())
    trip.cross(BANK)
    trip.approach(353, 480, 'leaf bridge guard approach')
    controls = {(dx, jump): trip.lua.table(left=dx<0, right=dx>0, jump=jump, attack=True)
                for dx in (-1, 0, 1) for jump in (False, True)}
    initial = trip.totals()
    for _ in range(1600):
        if q.count == 4:
            break
        target = min((e for e in trip.state.enemies.values() if e.hp>0),
                     key=lambda e: abs(e.x-trip.actor.x)+abs(e.y-trip.actor.y))
        dx = target.x-trip.actor.x
        direction = 0 if abs(dx)<30 else (1 if dx>0 else -1)
        jump = direction==0 and target.y<trip.actor.y-35
        trip.tick(1, controls[direction, jump])
    assert q.count == 4 and trip.state.returns == initial[2]
    collect(trip, 1350)
    assert q.count == 5
    trip.cross(HUB)
    trip.report(LEAF)
    trip.restore()
    assert trip.state.story.quests[LEAF].status=='complete'
    return dict(levelBefore=start_level, levelAfter=trip.state.progression.level,
                objectives=5, report=trip.reports[-1])


def fight(trip, boss_id, expected):
    slot, actor = trip.state.fieldSlots[boss_id], trip.actor
    boss, state = slot.enemy, trip.state
    fixed = boss.coreHits is not None
    starting_hp, initial = actor.hp, trip.totals()
    start, mora = state.t, state.mora
    trip.approach(boss.x-105, 480, boss_id)
    moves, recoveries, bolts = {}, set(), set()
    airborne, counter, interrupted = False, False, False
    core_counts = set()
    longest_down = 0
    pivot = None
    controls = {(dx, attack): trip.lua.table(left=dx<0, right=dx>0, attack=attack)
                for dx in (-1, 0, 1) for attack in (False, True)}
    for _ in range(7200):
        if boss.hp <= 0:
            break
        assert actor.hp>0 and state.returns==initial[2]
        if fixed:
            core_counts.add(boss.coreHits)
        cast = slot.cast
        recovering = bool(cast and cast.tick>=cast.move.recover)
        if cast:
            m,t = cast.move,cast.tick
            if t==m.lock:
                frame = trip.frame()
                field = frame.fieldBoss
                assert field.move==m.id and field.label==m.title
                if m.pattern in ('spores','rain'):
                    positions = list((cast.landings if fixed else cast.spots).values())
                    numbers = [d.text for d in frame.draws.values()
                               if d.kind=='text' and d.color==('#fff3b1' if fixed else '#fff3c3')]
                    assert numbers==['1','2','3'], numbers
                    pivot = positions[1 if fixed else 0]+cast.dir*175
                elif m.pattern in ('bolts','slam'):
                    positions = []
                    pivot = boss.x-cast.dir*125
                elif m.pattern=='leap':
                    positions = [cast.land]
                    pivot = cast.land+cast.dir*110
                else:
                    positions = []
                    pivot = cast.origin+cast.dir*145
                moves.setdefault(m.id,dict(lock=t,positions=positions,hpAtLock=actor.hp))
            if fixed and m.pattern=='bolts':
                bolts.update(cast.projectiles.keys())
                bolts.update(cast.shots.keys())
            if not fixed and boss.y<440:
                airborne = airborne or bool(trip.frame().fieldBoss.flying)
            if recovering:
                assert '反撃の隙' in trip.frame().fieldBoss.label
                recoveries.add(m.id)
            if m.id in moves and not recovering:
                last = (max(m.shotTicks.values())+m.shotLife if m.shotTicks
                        else max(window[2] for window in m.active.values()))
                if t==last and 'hpAfterAttack' not in moves[m.id]:
                    assert actor.hp==moves[m.id]['hpAtLock'], (m.id,actor.hp,actor.x,pivot)
                    moves[m.id]['hpAfterAttack'] = actor.hp
        else:
            pivot = None
        dx = boss.x-actor.x
        can_attack = all('hpAfterAttack' in moves.get(move,{}) for move in expected)
        if cast and not recovering and pivot is not None and not can_attack:
            distance = pivot-actor.x
            direction = 0 if abs(distance)<7 else (1 if distance>0 else -1)
            attack = False
        else:
            desired = 61 if fixed and can_attack else 104
            distance = dx-(desired if dx>=0 else -desired)
            direction = (1 if distance>0 else -1) if abs(distance)>9 else 0
            if not direction and dx*actor.dir<0:
                direction = 1 if dx>0 else -1
            attack = can_attack and abs(dx)<125 and dx*actor.dir>0
        before = boss.hp
        old_cast = bool(cast)
        trip.tick(1, controls[direction,attack])
        if fixed and boss.down>0:
            assert not slot.cast and trip.frame().fieldBoss.label=='核を破壊・ダウン'
            longest_down = max(longest_down,boss.down)
            interrupted = interrupted or old_cast
        counter = counter or bool(attack and (recovering or fixed and boss.down>0) and boss.hp<before)
    assert list(moves)==list(expected) and set(expected)<=recoveries
    assert all('hpAfterAttack' in move for move in moves.values()), moves
    assert slot.phase=='respawn' and boss.hp==0 and counter
    assert state.returns==initial[2] and state.kills==initial[0]+1
    if fixed:
        assert bolts=={1,2} and {0,1,2,3}<=core_counts and longest_down==240
    else:
        assert airborne
    return dict(moves=moves, recoveryLabels=sorted(recoveries), airborne=airborne,
                coreHits=sorted(core_counts), downTicks=longest_down, interrupted=interrupted, bolts=sorted(bolts),
                counterHit=counter, hpBefore=starting_hp, hpAfter=actor.hp,
                seconds=round(state.t-start,2), xp=state.progression.killXp-initial[1],mora=state.mora-mora)


def run(source):
    WORK.mkdir(parents=True, exist_ok=True)
    trip = SurveyJourney(source,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==60 and not trip.state.inventory.sampleKit
    assert all(trip.state.story.quests[q].status=='complete' for q in HISTORY)
    second = BOSSES[1]
    story = {}
    results = {}
    trip.travel(FOREST)
    trip.confirm_lock(second[2], '必要レベル 62')
    assert trip.guide(second[2])['requiredLevel']==62
    trip.travel(HUB)
    for name,boss,arena,level,expected in BOSSES:
        if name==second[0]:
            save(trip,'leaf-bridge-ready')
            story = leaf_crossing(trip)
        assert trip.state.progression.level>=level
        quest = name+'-commission'
        trip.act('story_accept:'+quest)
        assert trip.state.story.quests[quest].status=='active'
        save(trip,name+'-ready')
        stops = trip.travel(arena)
        assert [r['id'] for r in stops]==[FOREST,arena]
        result = fight(trip,boss,expected)
        assert trip.state.story.quests[quest].count==1
        trip.travel(HUB)
        trip.report(quest)
        cooldown = trip.snapshot()['fieldBosses'][boss]
        assert cooldown['hp']==0 and cooldown['waitTicks']>0
        trip.restore()
        assert trip.snapshot()['fieldBosses'][boss]==cooldown
        assert trip.state.endgame.bosses[boss].clears==1 and trip.state.story.quests[quest].cycles==1
        results[name] = dict(result,level=trip.state.progression.level, arena=arena,
                             report=trip.reports[-1],restoredCooldown=cooldown['waitTicks'])
    assert all(trip.state.story.quests[q].status=='complete' for q in HISTORY)
    save(trip,'electro-regisvine-complete')
    return dict(sourceSha256=trip.source, trials=results, openingQuest=story, partyWipes=trip.state.returns)


if __name__=='__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result = run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-sumeru-opening-bosses.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(result)
