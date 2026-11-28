"""Board both Inazuma ferries and play their field bosses on earned progression."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey
from test_earned_inazuma_bosses import PORT, ROAD, TOWN, collect
from test_earned_inazuma_thunder_pyro import field_fight, until


WORK = ROOT/'work/earned-inazuma-island-bosses'
LOOKOUTS = 'ina-firework-lookouts'
BEACH = 'ina-firework-beach'
FIREWORKS = 'ina-window-fireworks'
CONTRACT = 'inazuma-contract'
OUTER = 'inazuma-outer-shore'
ISLANDS = (
    ('hydro', 'boss-20040401', 'hydro-hypostasis-commission',
     'watatsumi-landing', 'hydro-hypostasis-field-cove', 52, 4.2, ('FHH01', 'FHH02', 'FHH03')),
    ('wolflord', 'boss-22060101', 'wolflord-commission',
     'tsurumi-coast', 'wolflord-field-ruins', 54, 4.8, ('FWL01', 'FWL02', 'FWL03')),
)


def fireworks(trip):
    trip.travel(TOWN)
    trip.act('story_accept:'+FIREWORKS)
    collect(trip, 372)
    trip.cross(LOOKOUTS)
    collect(trip, 616, 395)
    trip.approach(838, 395, 'second lookout approach')
    trip.approach(838, 307, 'second lookout shelf')
    collect(trip, 1040, 307)
    collect(trip, 1608, 414)
    assert trip.state.story.quests[FIREWORKS].count == 4
    trip.cross(BEACH)
    trip.approach(475, 480, 'firework controls')
    trip.act('story_firework_select:color:wisteria')
    trip.act('story_firework_select:shape:fan')
    trip.act('story_collect')
    until(trip, lambda: trip.state.story.quests[FIREWORKS].count == 5)
    trip.cross(TOWN)
    trip.report(FIREWORKS)
    return trip.reports[-1]


def restock(trip):
    trip.warp('ina-tea-landing')
    trip.approach(600, 480, 'teahouse')
    for _ in range(2):
        for _ in range(4):
            trip.act('story_collect')
        assert trip.actor.hp == trip.actor.maxhp
        until(trip, lambda: trip.state.swap == 0)
        trip.act('swap')
    until(trip, lambda: trip.state.swap == 0)
    trip.warp(PORT)


def train(trip, field, level, side_quest=None):
    state = trip.state
    restores = 0
    sorties = []
    for _ in range(60):
        quest = state.story.quests[side_quest] if side_quest else None
        if quest and quest.status == 'active' and quest.count == 16:
            trip.report(side_quest)
        if state.progression.level >= level:
            assert state.progression.level == level and not state.auto
            return dict(field=field, reached=level, sorties=sorties, teaStops=restores)
        if min(actor.hp for actor in state.actors.values()) < 105:
            restock(trip)
            restores += 1
        trip.travel(field)
        trip.approach(450, 480, field)
        initial_kills, initial_xp, initial_returns = trip.totals()
        initial_time = state.t
        trip.act('auto')
        assert state.auto
        for _ in range(600):
            if (state.progression.level >= level or min(a.hp for a in state.actors.values()) <= 75
                    or quest and quest.status == 'active' and quest.count == 16):
                break
            trip.tick(8)
        trip.act('auto')
        assert not state.auto and state.returns == initial_returns and state.story.node == field
        gained = state.progression.killXp-initial_xp
        assert state.kills > initial_kills and gained > 0
        sorties.append(dict(kills=state.kills-initial_kills, xp=gained, seconds=round(state.t-initial_time, 2)))
        trip.travel(PORT)
    raise AssertionError((field, state.progression.level, level))


def check_locked(trip, shore, arena, level):
    assert trip.state.story.node == PORT
    for target in (shore, arena):
        guide = trip.guide(target)
        assert guide['status'] == 'blocked' and guide['requiredLevel'] == level, guide
    trip.confirm_lock(shore, f'必要レベル {level}')
    assert not trip.state.lift
    trip.locks[-1].update(level=trip.state.progression.level, needLevel=level, arena=arena)


def sail(trip, destination, seconds):
    state = trip.state
    origin = state.story.node
    edge = trip.edges[origin, destination]
    trip.approach(edge['x'], 480, destination)
    p = trip.frame().storyNearbyPortal
    assert p.to == destination and p.available and p.boatSeconds == seconds
    trip.act('story_nearby_portal')
    assert state.lift and state.lift.boat and state.lift.destination == destination
    trip.tick(60)
    saved = trip.snapshot()
    restored = trip.core.restore(trip.lua.table_from(saved, recursive=True), 12)
    assert restored.story.node == PORT and restored.lift is None
    assert restored.progression.total == state.progression.total
    if origin == PORT:
        assert bool(restored.story.visited[destination]) == bool(state.story.visited[destination])
    trip.tick(round(seconds*60)-61)
    assert state.lift and state.story.node == origin
    trip.tick(1)
    assert state.story.node == destination and not state.lift
    assert (trip.actor.x, trip.actor.y) == (edge['arrivalX'], edge['arrivalY'])
    return dict(origin=origin, destination=destination, seconds=seconds,
                restoredMidSailAt=restored.story.node)


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


def run(source):
    WORK.mkdir(parents=True, exist_ok=True)
    trip = Journey(source, engine=runtime())
    assert trip.state.story.node == TOWN and trip.state.progression.level == 50
    assert not trip.state.inventory.sampleKit
    assert all(trip.state.story.quests[q].status == 'complete'
               for q in ('maguu-commission', 'array-commission', 'thunder-commission', 'pyro-hypostasis-commission'))
    trip.travel(PORT)
    for _, _, _, shore, arena, level, _, _ in ISLANDS:
        check_locked(trip, shore, arena, level)
    side_report = fireworks(trip)
    trip.travel(PORT)
    trip.act('story_accept:'+CONTRACT)
    assert trip.state.story.quests[CONTRACT].status == 'active'

    trials, training = {}, []
    for name, boss, quest, shore, arena, level, seconds, expected in ISLANDS:
        if name == 'wolflord':
            check_locked(trip, shore, arena, level)
        training.append(train(trip, ROAD if name == 'hydro' else OUTER, level,
                              CONTRACT if name == 'hydro' else None))
        trip.act('story_accept:'+quest)
        assert trip.state.story.quests[quest].status == 'active'
        save(trip, name+'-ready')
        guide = trip.guide(arena)
        assert guide['status'] == 'ready'
        assert [(leg['id'], leg['mode']) for leg in guide['stops']] == [(shore, 'boat'), (arena, 'walk')]
        assert f'移動に{seconds:g}秒' in guide['stops'][0]['hint']
        outbound = sail(trip, shore, seconds)
        trip.cross(arena)
        fight = field_fight(trip, boss, expected)
        if name == 'hydro':
            assert len(fight['dodged']['FHH03']['lockedFallPoints']) == 3
        else:
            assert fight['dodged']['FWL03']['bolts'] == 2
        assert trip.state.story.quests[quest].count == 1
        trip.cross(shore)
        back = sail(trip, PORT, seconds)
        trip.report(quest)
        saved = trip.snapshot()['fieldBosses'][boss]
        assert saved['hp'] == 0 and saved['waitTicks'] > 0
        trip.restore()
        assert trip.snapshot()['fieldBosses'][boss] == saved
        assert trip.state.story.quests[quest].status == 'complete'
        assert trip.state.story.quests[quest].cycles == 1 and trip.state.endgame.bosses[boss].clears == 1
        trials[name] = dict(fight, level=trip.state.progression.level, gateLevel=level, route=[shore, arena],
                            crossings=[outbound, back], report=trip.reports[-1],
                            restoredCooldown=saved['waitTicks'])
        print(name, level, fight['seconds'], fight['hpAfter'], flush=True)
    assert trip.state.story.quests[CONTRACT].status == 'complete'
    save(trip, 'wolflord-complete')
    contract = next(r for r in trip.reports if r['quest'] == CONTRACT)
    return dict(sourceSha256=trip.source, locks=trip.locks, extraReports=[side_report,contract],
                training=training, trials=trials, returns=trip.state.returns)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', default=str(ROOT/'work/earned-inazuma-thunder-pyro/pyro-complete.json'))
    args = parser.parse_args()
    result = run(args.from_save)
    (ROOT/'evidence/earned-inazuma-island-bosses.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
