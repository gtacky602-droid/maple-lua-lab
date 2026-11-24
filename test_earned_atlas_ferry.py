"""Follow a cross-region itinerary and verify an automatic arrival with an explicit dock gate."""

import json

from runtime import ROOT
from test_earned_branch_quests import Journey


STATION = 'white-pass-station'
FIELD = 'sites-hunt-41818'
BOARDING = 'nod-port'
DECK = 'natlan-voyage-return'
LANDING = 'natlan-port'


def automatic_legs(stops):
    return [(leg['from'], leg['id']) for leg in stops if leg.get('automaticArrival')]


def long_route():
    trip = Journey('lv200-save.json')
    trip.warp(STATION)
    out = trip.travel(FIELD)
    assert len(out) == 20 and automatic_legs(out) == [(DECK, LANDING)]
    assert trip.state.story.node == FIELD
    back = trip.travel(STATION)
    assert len(back) >= 20 and automatic_legs(back)
    assert trip.state.story.node == STATION and trip.state.returns == 0
    return {'sourceSha256':trip.source, 'outbound':trip.itineraries[0], 'return':trip.itineraries[1],
            'returnedToStart':True, 'partyWipes':trip.state.returns}


def reverse_ferry():
    trip = Journey('lv200-save.json')
    trip.warp(BOARDING)
    (ROOT/'work/earned-natlan-ferry.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    trip.cross(DECK)
    assert trip.state.voyage and trip.state.voyage.total == 90
    trip.approach(1380, 480, '船尾の着岸案内')
    portal = trip.frame().storyNearbyPortal
    assert portal.to == LANDING and portal.automaticArrival and not portal.available
    trip.act('story_nearby_portal')
    assert trip.state.story.node == DECK and trip.state.storyNotice == '到着待ち'

    trip.act('world_map_focus:'+LANDING)
    before = trip.state.t
    guide = trip.frame().worldMap.guide
    first = guide.stops[1]
    assert guide.status == 'ready' and first.automaticArrival and first.gateX is None
    assert first['from'] == DECK
    assert first.id == LANDING and 0 < first.secondsRemaining < 90
    assert first.hint == '出航から90秒で着岸'
    trip.tick(120)
    assert trip.state.t == before and trip.state.story.node == DECK
    trip.act('world_map_close')

    trip.approach(82, 480, '船首からの着岸')
    remaining = trip.state.voyage.arrives-trip.state.t
    trip.tick(round(remaining*60)-1)
    assert trip.state.story.node == DECK and trip.state.voyage
    trip.tick(1)
    assert trip.state.story.node == LANDING and trip.state.voyage is None
    landing = [trip.actor.x, trip.actor.y]
    assert landing == [720, 480]
    trip.cross('natlan-field')
    assert trip.state.story.node == 'natlan-field'
    return {'boardedAt':BOARDING, 'deck':DECK, 'duration':90, 'blockedFBeforeArrival':True,
            'automaticFromOtherEndOfDeck':True, 'secondsShownInMap':round(first.secondsRemaining, 2),
            'clockPausedInMap':True, 'landedAt':LANDING, 'landing':landing,
            'nextMap':trip.state.story.node}


if __name__ == '__main__':
    result = {'reverseFerry':reverse_ferry(), 'longRoute':long_route()}
    (ROOT/'evidence/earned-atlas-ferry-lua.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Earned map: the 90-second ferry docked automatically, and the long route completed both ways.')
