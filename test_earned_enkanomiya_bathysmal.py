"""Reach the Enkanomiya pair through Watatsumi on earned Inazuma progression."""

from argparse import ArgumentParser
import json
from math import isclose

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey
from test_earned_inazuma_island_bosses import PORT, sail


WORK = ROOT/'work/earned-enkanomiya-bathysmal'
SOURCE = ROOT/'work/earned-inazuma-island-bosses/wolflord-complete.json'
SHORE, WHIRLPOOL = 'watatsumi-landing', 'ina-wp-15942'
CAMP, DEPTH, ARENA = 'enkanomiya-camp', 'enkanomiya-depth', 'bathysmal-field-sanctum'
BOSS, QUEST = 'bathysmal-herd', 'bathysmal-commission'
PREVIOUS = ('maguu-commission', 'array-commission', 'thunder-commission',
            'pyro-hypostasis-commission', 'hydro-hypostasis-commission', 'wolflord-commission')
MOVES = ('FBH01', 'FBH02', 'FBH03')
ART = {'rimebiter-idle-source-v1.png', 'bolteater-idle-source-v1.png'}


def waterway(trip, destination, checkpoint):
    state = trip.state
    origin = state.story.node
    edge = trip.edges[origin, destination]
    guide = trip.guide(destination)
    assert guide['status'] == 'ready'
    assert [(step['id'], step['mode']) for step in guide['stops']] == [(destination, 'water')], guide
    assert '3.8' in guide['stops'][0]['hint']
    trip.approach(edge['x'], 480, 'waterway departure')
    nearby = trip.frame().storyNearbyPortal
    assert nearby.to == destination and nearby.available and nearby.waterwaySeconds == 3.8
    trip.act('story_nearby_portal')
    assert state.lift and state.lift.waterway and not state.lift.boat
    trip.tick(60)
    restored = trip.core.restore(trip.lua.table_from(trip.snapshot(), recursive=True), 12)
    assert restored.story.node == checkpoint and restored.lift is None
    assert restored.progression.total == state.progression.total
    trip.tick(167)
    assert state.story.node == origin and state.lift
    trip.tick(1)
    assert state.story.node == destination and not state.lift
    assert (trip.actor.x, trip.actor.y) == (edge['arrivalX'], edge['arrivalY'])
    return dict(origin=origin, destination=destination, seconds=3.8, restoredAt=checkpoint)


def fight(trip):
    state, actor = trip.state, trip.actor
    slot = state.fieldSlots[BOSS]
    first, second = slot.enemy, slot.enemy.fieldPartner
    assert first.hp == second.hp == 1120, (first.hp, second.hp)
    trip.approach(first.x-95, 480, 'pair approach')
    start = trip.totals()
    hp, mora, began = actor.hp, state.mora, state.t

    controls = {(d, a): trip.lua.table(left=d<0, right=d>0, attack=a)
                for d in (-1, 0, 1) for a in (False, True)}
    locked, finished, recoveries, airborne, bolts = {}, {}, {}, set(), set()
    pivot = None
    counter = False
    for _ in range(60*100):
        assert first.hp == second.hp
        if slot.phase == 'respawn':
            break
        assert actor.hp>0 and state.returns == start[2]
        cast = slot.cast
        recovering = bool(cast and cast.tick>=cast.move.recover)
        direction, attack = 0, False
        if cast and not cast.prepare:
            move, tick = cast.move, cast.tick
            if tick == move.lock:
                frame = trip.frame().fieldBoss
                assert frame.move == move.id and frame.label == move.title
                points = list(cast.landings.values()) if cast.landings else []
                if points:
                    assert list(frame.relayLandings.values()) == points
                    assert isclose(points[1]-points[0], 1.3*88)
                if move.kind == 'tail':
                    pivot = cast.spinX-156
                elif move.kind == 'volley':
                    pivot = actor.x+cast.dir*264
                else:
                    pivot = points[0]-106
                locked.setdefault(move.id, dict(hp=actor.hp, tick=tick, target=pivot, landings=points))
            if move.kind == 'volley' and tick >= move.lock:
                for index in cast.projectiles.keys():
                    bolts.add(index)
            if move.kind == 'relay' and cast.landings:
                assert list(cast.landings.values()) == locked[move.id]['landings']
                if first.y < 440:
                    assert second.y == 480
                    airborne.add(1)
                if second.y < 440:
                    assert first.y == 480
                    airborne.add(2)
            if move.id in locked and not recovering and pivot is not None:
                distance = pivot-actor.x
                direction = 0 if abs(distance)<7 else (1 if distance>0 else -1)
            last = max(move.fire.values())+move.life if move.fire else max(w[2] for w in move.active.values())
            if tick == last and move.id not in finished:
                assert actor.hp == locked[move.id]['hp'], (move.id, actor.hp, actor.x, locked[move.id])
                finished[move.id] = tick
            if recovering and move.id not in recoveries:
                frame = trip.frame()
                assert frame.fieldBoss.recovering and frame.fieldBoss.label == '反撃の隙・二体が伏せる'
                sprites = [d for d in frame.draws.values() if d.source in ART]
                assert len(sprites) == 2 and all(d.h == 94 and d.y == 480 for d in sprites)
                recoveries[move.id] = tick
        else:
            pivot = None
        if not cast or recovering:
            target = min((first, second), key=lambda b: abs(b.x-actor.x))
            dx = target.x-actor.x
            direction = (1 if dx>0 else -1) if abs(dx)>90 or dx*actor.dir<0 else 0
            attack = len(finished) == 3 and abs(dx)<122 and dx*actor.dir>=0
        before = first.hp
        trip.tick(1, controls[direction, attack])
        counter = counter or (recovering and attack and first.hp<before)
    assert slot.phase == 'respawn' and first.hp == second.hp == 0
    assert tuple(finished) == MOVES and tuple(recoveries) == MOVES and airborne == bolts == {1, 2}
    assert counter and state.kills == start[0]+1 and state.returns == start[2]
    return dict(sharedInitialHp=1120, hpBefore=hp, hpAfter=actor.hp, moveOrder=list(finished),
                finalActiveTicks=finished, recoveryTicks=recoveries, locks=locked,
                bolts=sorted(bolts), airborne=sorted(airborne), counterHit=counter,
                seconds=round(state.t-began, 2), xp=state.progression.killXp-start[1], mora=state.mora-mora)


def run(source):
    WORK.mkdir(parents=True, exist_ok=True)
    trip = Journey(source, engine=runtime())
    assert trip.state.story.node == PORT and trip.state.progression.level == 54
    assert not trip.state.inventory.sampleKit
    assert all(trip.state.story.quests[q].status == 'complete' for q in PREVIOUS)
    guide = trip.guide(WHIRLPOOL)
    assert guide['status'] == 'ready'
    assert [(step['id'], step['mode']) for step in guide['stops']] == [(SHORE, 'boat'), (WHIRLPOOL, 'walk')]
    outbound_boat = sail(trip, SHORE, 4.2)
    trip.cross(WHIRLPOOL)
    outbound = waterway(trip, CAMP, PORT)
    trip.act('story_accept:'+QUEST)
    arena_guide = trip.guide(ARENA)
    assert arena_guide['status'] == 'ready'
    assert [step['id'] for step in arena_guide['stops']] == [DEPTH, ARENA]
    trip.cross(DEPTH)
    trip.cross(ARENA)
    combat = fight(trip)
    assert trip.state.story.quests[QUEST].count == 1
    trip.cross(DEPTH)
    trip.cross(CAMP)
    trip.report(QUEST)
    before = trip.snapshot()['fieldBosses'][BOSS]
    assert before['hp'] == 0 and before['waitTicks'] > 0
    trip.restore()
    assert trip.state.story.node == CAMP and trip.snapshot()['fieldBosses'][BOSS] == before
    assert trip.state.story.quests[QUEST].status == 'complete' and trip.state.story.quests[QUEST].cycles == 1
    assert trip.state.endgame.bosses[BOSS].clears == 1
    inbound = waterway(trip, WHIRLPOOL, CAMP)
    trip.cross(SHORE)
    inbound_boat = sail(trip, PORT, 4.2)
    assert all(trip.state.story.quests[q].status == 'complete' for q in (*PREVIOUS, QUEST))
    (WORK/'bathysmal-complete.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    return dict(sourceSha256=trip.source, level=trip.state.progression.level,
                route=[SHORE, WHIRLPOOL, CAMP, DEPTH, ARENA], rides=[outbound_boat, outbound, inbound, inbound_boat],
                combat=combat, report=trip.reports[-1], restoredCooldown=before['waitTicks'], finishedAt=PORT,
                returns=trip.state.returns)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', default=str(SOURCE))
    result = run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-enkanomiya-bathysmal.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(result)
