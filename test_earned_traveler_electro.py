"""Measure Electro skills through loadout inputs on a live story field."""

import json
from collections import defaultdict

from runtime import ROOT
from test_earned_support_effects import DAWN, STATION, ready, spell


def route():
    return ready('lv200-save.json', 'kachina', 'SK09', 'SK10', 'SK11', 'SK12')


def enter(trip):
    trip.warp(DAWN)
    trip.tick(1, trip.inputs['right'])
    assert trip.state.progression.level == 200 and trip.actor.dir == 1


def pulses(trip, start):
    hits = defaultdict(list)
    for event in trip.state.events.values():
        if event.t >= start and event.kind == 'hit' and event.actor == 1 and event.element == 'electro' and not event.reaction:
            hits[round(event.t-start, 3)].append(trip.state.enemies[event.target].spawnId)
    return dict(hits)


def active_arcs(trip, color):
    return [e for e in trip.state.effects.values() if e.color == color and e.endX is not None]


def field_strikes(trip):
    trip.tick(14, trip.inputs['right'])
    start = trip.state.t
    spell(trip, 1)
    trip.tick(26)
    strikes = pulses(trip, start)
    assert list(strikes) == [0, .15]
    assert all(len(targets) == 3 for targets in strikes.values())

    start = trip.state.t
    seventh = trip.state.enemies[7]
    assert 0 < seventh.x-trip.actor.x < 520 and seventh.y == trip.actor.y
    spell(trip, 2)
    arcs = active_arcs(trip, '#c68fff')
    assert len(arcs) == 6 and arcs[0].x == trip.actor.x
    assert all((a.endX, a.endY) == (b.x, b.y) for a, b in zip(arcs, arcs[1:]))
    assert all(abs(arc.endX-arc.x) < 180 for arc in arcs)
    assert sum(draw.color == '#c68fff' and draw.kind == 'rect'
               for draw in trip.frame().draws.values()) == 4*len(arcs)
    assert not any(draw.color == '#c68fff' and draw.kind == 'effect' and draw.w >= 500
                   for draw in trip.frame().draws.values())
    trip.tick(51)
    chain = pulses(trip, start)
    assert list(chain) == [0, .2, .4, .6, .8]
    assert all(len(targets) == len(set(targets)) == 6 for targets in chain.values())
    assert all(seventh.spawnId not in targets for targets in chain.values())
    return {'SK09':strikes, 'SK10':chain, 'chainLinksOnFirstPulse':len(arcs)}


def dash(trip, x):
    trip.approach(x, 384, '暁晶原の岩棚')
    trip.tick(1, trip.inputs['right'])
    assert trip.actor.ground and trip.actor.y == 384
    start_x, start_t = trip.actor.x, trip.state.t
    spell(trip, 3)
    trip.tick(32)
    assert trip.actor.y == 384 and trip.actor.ground and trip.actor.dash == 0
    return {'startX':round(start_x, 2), 'stopX':round(trip.actor.x, 2),
            'ledgeY':trip.actor.y, 'hits':pulses(trip, start_t)}


def discharges(trip):
    trip.act('jump')
    trip.tick(8, trip.inputs['jump'])
    placement_x, placement_y = trip.actor.x, trip.actor.y
    assert placement_y < 450 and not trip.actor.ground
    start = trip.state.t
    spell(trip, 4)
    stakes = [cast for cast in trip.state.pending.values() if cast.placed == 'SK12']
    assert len(stakes) == 1 and (stakes[0].x, stakes[0].y) == (placement_x, 480)
    assert not pulses(trip, start) and not active_arcs(trip, '#cb9fff')
    trip.tick(15, trip.inputs['right'])
    trip.tick(45)
    arcs = active_arcs(trip, '#cb9fff')
    assert len(arcs) == 3 and all((arc.x, arc.y) == (placement_x, 443) for arc in arcs)
    assert trip.actor.x > placement_x+40
    trip.act('slot4')
    trip.tick(1)
    assert len([c for c in trip.state.pending.values() if c.placed == 'SK12']) == 1
    trip.tick(300)
    struck = pulses(trip, start)
    assert list(struck) == [1, 2, 3, 4, 5, 6]
    assert all(len(targets) == 3 for targets in struck.values())
    assert not any(c.placed == 'SK12' for c in trip.state.pending.values())
    return {'castY':round(placement_y, 2), 'stake':[placement_x, 480], 'hits':struck}


if __name__ == '__main__':
    trip = route()
    (ROOT/'work/earned-traveler-electro.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    enter(trip)
    proof = {'sourceSha256':trip.source, 'field':DAWN, **field_strikes(trip)}

    trip = route()
    enter(trip)
    run = dash(trip, 310)
    assert list(run['hits']) == [0, .15, .30, .45]
    assert all(0 < len(targets) <= 5 for targets in run['hits'].values())
    assert run['stopX'] > run['startX']+290
    trip = route()
    enter(trip)
    edge = dash(trip, 700)
    assert edge['startX']+80 < edge['stopX'] <= 805
    proof['SK11'] = {'openLedge':run, 'ledgeEdge':edge}

    trip = route()
    enter(trip)
    proof['SK12'] = discharges(trip)
    trip = route()
    enter(trip)
    spell(trip, 4)
    assert any(c.placed == 'SK12' for c in trip.state.pending.values())
    trip.warp(STATION)
    assert not any(c.placed == 'SK12' for c in trip.state.pending.values())
    proof['SK12']['clearedOnMapExit'] = True

    (ROOT/'evidence/earned-traveler-electro-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Earned Electro: two hits, five chains, four dash pulses, ledge stop, and six grounded stake discharges.')
