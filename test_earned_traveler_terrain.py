"""Run four Traveler attacks across story ledges, a field boss, and airborne quest enemies."""

import json
from collections import defaultdict

from runtime import ROOT
from test_earned_support_effects import DAWN, ready, spell, wait


NIGHT_QUEST = 'mond-night-banner-quest'
NIGHT_HILL = 'mond-night-hill'


def route(companion='kachina'):
    return ready('lv200-save.json', companion, 'SK07', 'SK13', 'SK14', 'SK15')


def field():
    trip = route()
    trip.warp(DAWN)
    trip.tick(14, trip.inputs['right'])
    return trip


def pulses(trip, start, element):
    result = defaultdict(list)
    for event in trip.state.events.values():
        if event.t >= start and event.kind == 'hit' and event.actor == 1 and event.element == element and not event.reaction:
            result[round(event.t-start, 2)].append(event.target)
    return dict(result)


def ground_wave():
    trip = field()
    trip.act('jump')
    trip.tick(11, trip.inputs['jump'])
    air_y = trip.actor.y
    assert 384 < air_y < 406
    start = trip.state.t
    spell(trip, 1)
    wave = next(cast for cast in trip.state.pending.values() if cast.key == 'SK07')
    assert wave.y == 480
    trip.tick(48)
    hits = pulses(trip, start, 'geo')
    assert list(hits) == [0, .2, .4, .6, .8]
    assert all(trip.state.enemies[id].y == 480 for targets in hits.values() for id in targets)
    trip = field()
    trip.approach(700, 384, '暁晶原の岩棚の端')
    trip.tick(1, trip.inputs['right'])
    assert trip.actor.ground and trip.actor.y == 384
    spell(trip, 1)
    wave = next(cast for cast in trip.state.pending.values() if cast.key == 'SK07')
    wave_ends = []
    for _ in range(49):
        wave_ends.extend(e.x+e.w for e in trip.state.effects.values() if e.groundWave)
        trip.tick(1)
    assert wave.x == 805 and max(wave_ends) == 805
    ledge_stop = wave.x

    trip = ready('lv200-save.json', 'kachina', 'SK07', 'SK58', 'SK59')
    trip.warp(DAWN)
    trip.approach(310, 384, '反響元の岩棚')
    spell(trip, 1)
    assert trip.state.echoSource.cast.y == 384
    trip.act('drop')
    trip.tick(32)
    assert trip.actor.y == 480
    spell(trip, 2)
    assert trip.actor.light > 0
    spell(trip, 3)
    echo = next(cast for cast in trip.state.pending.values() if cast.key == 'SK59')
    assert echo.groundWave and echo.y == 480

    trip = route()
    trip.warp('sumeru-hub')
    trip.travel('sites-hunt-41818')
    trip.approach(455, 480, '千尋東の低い棚の下')
    trip.tick(1, trip.inputs['right'])
    above = trip.state.enemies[4]
    assert above.y == 431 and 0 < above.x-trip.actor.x < 160
    start = trip.state.t
    spell(trip, 1)
    trip.tick(49)
    close_ledge_hits = pulses(trip, start, 'geo')
    assert above.id not in close_ledge_hits[0] and trip.state.enemies[1].id in close_ledge_hits[0]
    assert all(trip.state.enemies[id].y == 480 for group in close_ledge_hits.values() for id in group)
    return {'airCastY':round(air_y, 2), 'waveY':480, 'groundedHits':hits,
            'ledgeStopX':ledge_stop, 'echoReprojectsToNewFloor':True,
            'closeLedge':{'field':trip.state.story.node, 'offsetY':480-above.y, 'groundedHits':close_ledge_hits}}


def bind():
    trip = field()
    target = trip.state.enemies[4]
    start = trip.state.t
    spell(trip, 2)
    trip.tick(9)
    hits = pulses(trip, start, 'dendro')
    assert list(hits) == [0, .15] and all(target.id in group for group in hits.values())
    hold_x = target.x
    trip.tick(100)
    assert target.root > 0 and target.x == hold_x
    wait(trip, lambda: target.root == 0)
    wait(trip, lambda: target.x != hold_x)

    trip = route()
    trip.warp('natlan-hub')
    trip.travel('ochkanatlan-dock')
    trip.travel('ochka-sifting-kiln')
    boss = trip.state.fieldSlots['original-rubble-sifter'].enemy
    trip.approach(boss.x-155, 480, '礫脈の選鉱炉')
    trip.tick(1, trip.inputs['right'])
    hp = boss.hp
    spell(trip, 2)
    rate = trip.core.enemyRate(boss)
    assert 0 < boss.hp < hp and boss.slow > 0 and boss.root == 0 and rate == .7
    return {'normalTargetHeldX':round(hold_x, 2), 'normalReleased':True,
            'bossField':trip.state.story.node, 'bossMovementRate':rate, 'bossRoot':boss.root}


def vines():
    trip = field()
    start = trip.state.t
    spell(trip, 3)
    trip.tick(30)
    hits = pulses(trip, start, 'dendro')
    assert list(hits) == [0, .15, .3, .45]
    assert all(len(group) == 5 and {trip.state.enemies[id].y for id in group} == {384, 480}
               for group in hits.values())
    return {'hitsAcrossTwoTiers':hits, 'targetTiers':[384, 480]}


def seeds():
    trip = field()
    start = trip.state.t
    spell(trip, 4)
    positions = []
    for _ in range(6):
        trails = [effect for effect in trip.state.effects.values() if effect.seedTrail]
        assert len(trails) == 6
        positions.append([[round(e.endX, 2), e.endY] for e in trails])
        trip.tick(12)
    hits = pulses(trip, start, 'dendro')
    assert list(hits) == [0, .2, .4, .6, .8, 1]
    assert all(len(group) == 6 and group == hits[0] for group in hits.values())
    assert any(position != positions[0] for position in positions[1:])
    return {'hitsOnTrackedTargets':hits, 'firstEndpoints':positions[0], 'lastEndpoints':positions[-1]}


def night_hill():
    trip = route('mitya')
    trip.warp('mond-town')
    trip.act('weapon_equip:traveler:SW01')
    trip.act('story_accept:'+NIGHT_QUEST)
    trip.mark(NIGHT_QUEST, 1)
    trip.travel(NIGHT_HILL)
    for index in range(2, 5):
        trip.mark(NIGHT_QUEST, index)
    trip.approach(1130, 480, '風スライムの手前')
    trip.tick(1, trip.inputs['right'])
    low = trip.state.enemies[1]
    assert low.flying and 0 < low.x-trip.actor.x < 160 and abs(low.y-trip.actor.y)<75 and low.hp > 0
    start = trip.state.t
    spell(trip, 1)
    assert not pulses(trip, start, 'geo')
    trip.tick(48)
    assert not pulses(trip, start, 'geo')
    high = trip.state.enemies[3]
    assert high.flying and high.hp > 0
    high_id, high_hp = high.id, high.hp
    start = trip.state.t
    spell(trip, 4)
    assert any(high_id in group for group in pulses(trip, start, 'dendro').values())
    assert high.hp < high_hp
    wait(trip, lambda: trip.state.story.quests[NIGHT_QUEST].count == 5)
    trip.mark(NIGHT_QUEST, 6)
    trip.mark(NIGHT_QUEST, 7)
    trip.travel('mond-town')
    trip.report(NIGHT_QUEST)
    trip.restore()
    assert trip.state.story.quests[NIGHT_QUEST].status == 'complete'
    return {'field':NIGHT_HILL, 'groundWavePassedUnderFlier':True, 'seedHitUpperFlier':True,
            'reportedAndRestored':True, 'report':trip.reports[0]}


if __name__ == '__main__':
    trip = route()
    (ROOT/'work/earned-traveler-terrain.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    results = {'sourceSha256':trip.source, 'field':DAWN, 'SK07':ground_wave(), 'SK13':bind(),
               'SK14':vines(), 'SK15':seeds(), 'nightBanner':night_hill()}
    (ROOT/'evidence/earned-traveler-terrain-lua.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Earned terrain attacks: grounded wave, boss slow, two-tier vines, moving seed targets and the night-banner quest.')
