"""Play the main-field Thunder and Pyro commissions from earned Inazuma progression."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, graph, quests
from test_earned_inazuma_bosses import PORT, TOWN, collect, confirm_lock, progress


WORK = ROOT/'work/earned-inazuma-thunder-pyro'
FESTIVAL = 'ina-festival-games'
ITTO = 'ina-itto-three-games'
TEA = 'ina-walking-teahouse'
ENCOUNTERS = (
    ('thunder', 'boss-20070101', 'thunder-approach', 'thunder-field-crest', 'thunder-commission', 48),
    ('pyro', 'boss-20040601', TOWN, 'pyro-hypostasis-field-terrace', 'pyro-hypostasis-commission', 50),
)


def until(trip, condition, limit=1200, controls=None):
    for _ in range(limit):
        if condition():
            return
        trip.tick(1, controls)
    raise AssertionError((trip.state.story.node, trip.actor.x, trip.state.storyNotice))


def games(trip):
    spec = next(node['ittoGames'] for node in graph['nodes'] if node['id'] == FESTIVAL)
    collect(trip, 681)
    trip.cross(FESTIVAL)
    collect(trip, spec['bell']['x'])
    for flag in spec['flags']:
        trip.approach(flag['x'], flag['y'], 'festival flag')
    assert trip.state.story.quests[ITTO].count == 2

    collect(trip, spec['bell']['x'])
    targets = list(trip.state.enemies.values())
    assert len(targets) == 6 and all(target.noRewards for target in targets)
    for target in targets:
        if target.hp <= 0:
            continue
        trip.approach(target.x-55, target.y, 'festival target')
        trip.tick(1, trip.inputs['right'])
        until(trip, lambda: target.hp <= 0, limit=120, controls=trip.lua.table(attack=True))
    assert trip.state.story.quests[ITTO].count == 3

    collect(trip, spec['bell']['x'])
    for mark in spec['relay']['marks']:
        trip.approach(mark['x'], spec['relay']['playerY'], 'cheering mark')
        until(trip, lambda: trip.state.ittoRound and trip.state.ittoRound.own.at, limit=240)
        trip.act('story_collect')
        trip.tick(1)
    assert trip.state.story.quests[ITTO].ittoContest.best == 3


def teahouse(trip):
    for x in (169, 396):
        collect(trip, x)
    trip.cross('ina-tea-crossroads')
    collect(trip, 345)
    collect(trip, 744, 403)
    trip.cross('ina-tea-landing')
    collect(trip, 284)
    trip.approach(469, 480, 'teahouse controls')
    for action in ('story_tea_card:ruts', 'story_tea_card:dusk', 'story_tea_confirm'):
        trip.act(action)
    until(trip, lambda: trip.frame().storyTeaCase.parked)
    collect(trip, 600)
    trip.cross(TOWN)


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


def field_fight(trip, boss_id, expected):
    state, actor = trip.state, trip.actor
    slot = state.fieldSlots[boss_id]
    boss = slot.enemy
    trip.approach(boss.x-95, 480, boss_id)
    initial_hp, initial_time = actor.hp, state.t
    initial_kills, initial_xp, initial_returns = trip.totals()
    initial_mora = state.mora
    controls = {(direction, attack): trip.lua.table(left=direction<0, right=direction>0, attack=attack)
                for direction in (-1, 0, 1) for attack in (False, True)}
    evaded, recovering_moves, seen_bolts = {}, set(), set()
    lock = None
    aerial, counter = False, False
    for _ in range(120*60):
        if slot.phase == 'respawn':
            break
        assert actor.hp > 0 and state.returns == initial_returns, (boss_id, boss.hp, actor.hp)
        cast = slot.cast
        recovering = bool(cast and cast.tick >= cast.move.recover)
        direction, attack = 0, False
        dx = boss.x-actor.x
        if cast:
            move, tick = cast.move, cast.tick
            if tick == move.lock:
                frame = trip.frame().fieldBoss
                assert frame.move == move.id and frame.label == move.title
                target = cast.origin + cast.dir*158 if move.kind == 'wing' else cast.origin-cast.dir*72
                lock = dict(move=move.id, hp=actor.hp, aim=cast.dir, origin=cast.origin, destination=cast.dest,
                            x=target)
            if lock and lock['move'] == move.id:
                assert cast.dir == lock['aim'] and cast.dest == lock['destination']
                if move.fire:
                    seen_bolts.update(cast.projectiles.keys())
                    seen_bolts.update(cast.shots.keys())
                if not aerial and move.air and boss.y < 450:
                    aerial = bool(trip.frame().fieldBoss.flying)
                if not recovering:
                    offset = lock['x']-actor.x
                    direction = 0 if abs(offset) <= 6 else 1 if offset > 0 else -1
                if move.id not in evaded:
                    last_active = (max(move.fire.values())+move.life if move.fire
                                   else max(w[2] for w in move.active.values()))
                    if tick == last_active:
                        assert actor.hp == lock['hp'], (move.id, actor.hp, lock, actor.x)
                        if move.kind == 'wing':
                            assert abs(actor.x-lock['origin']) > 1.4*88
                        else:
                            assert (actor.x-lock['origin'])*lock['aim'] < 0
                        evaded[move.id] = dict(warningTick=move.lock, lastActiveTick=last_active,
                                               hp=actor.hp, position=round(actor.x, 2),
                                               bolts=len(seen_bolts) if move.fire else 0)
            if recovering and move.id not in recovering_moves:
                frame = trip.frame().fieldBoss
                assert frame.recovering and '反撃の隙' in frame.label, (move.id, frame.label)
                recovering_moves.add(move.id)
        else:
            lock = None
        if len(evaded) == len(expected) and (not cast or recovering):
            direction = (1 if dx > 0 else -1) if abs(dx)>95 or dx*actor.dir<0 else 0
            attack = abs(dx)<122 and dx*actor.dir>=0
        old_hp = boss.hp
        trip.tick(1, controls[direction, attack])
        counter = counter or bool(attack and recovering and boss.hp < old_hp)
    assert slot.phase == 'respawn' and boss.hp == 0 and state.returns == initial_returns
    assert state.kills == initial_kills+1 and tuple(evaded) == expected and counter and aerial
    assert evaded[expected[1]]['bolts'] == 3, evaded
    return dict(hpBefore=initial_hp, hpAfter=actor.hp, noDamageInFirstCycle=True, allMoves=list(evaded),
                dodged=evaded, aerial=True, recoveryLabels=sorted(recovering_moves), counterHit=True,
                seconds=round(state.t-initial_time, 2), xp=state.progression.killXp-initial_xp,
                mora=state.mora-initial_mora)


def run(source):
    WORK.mkdir(parents=True, exist_ok=True)
    trip = Journey(source, engine=runtime())
    assert trip.state.story.node == PORT and trip.state.progression.level == 47
    assert not trip.state.inventory.sampleKit
    for previous in ('maguu-commission', 'array-commission'):
        assert trip.state.story.quests[previous].status == 'complete'
    for _, _, origin, arena, _, level in ENCOUNTERS:
        confirm_lock(trip, origin, arena, level)
    quests_done = [progress(trip, ITTO, games, 48)]
    trials = {}
    for name, boss, origin, arena, quest, level in ENCOUNTERS:
        if name == 'pyro':
            confirm_lock(trip, origin, arena, level)
            quests_done.append(progress(trip, TEA, teahouse, 50))
        hub = quests[quest]['hub']
        trip.travel(hub)
        trip.act('story_accept:'+quest)
        assert trip.state.story.quests[quest].status == 'active'
        save(trip, name+'-ready')
        route = [entry['id'] for entry in trip.travel(arena)]
        expected = ('FTM01', 'FTM02', 'FTM03') if name == 'thunder' else ('FHP01', 'FHP02', 'FHP03')
        fight = field_fight(trip, boss, expected)
        assert trip.state.story.quests[quest].count == 1
        trip.travel(hub)
        trip.report(quest)
        recorded = trip.snapshot()['fieldBosses'][boss]
        assert recorded['waitTicks'] > 0 and recorded['hp'] == 0
        trip.restore()
        assert trip.state.story.quests[quest].status == 'complete'
        assert trip.state.story.quests[quest].cycles == 1 and trip.state.endgame.bosses[boss].clears == 1
        assert trip.snapshot()['fieldBosses'][boss] == recorded
        trials[name] = dict(fight, level=trip.state.progression.level, gateLevel=level, route=route,
                            report=trip.reports[-1], restoredCooldown=recorded['waitTicks'])
        print(name, trials[name]['level'], fight['seconds'], fight['hpAfter'], flush=True)
    save(trip,'pyro-complete')
    return dict(sourceSha256=trip.source, locks=trip.locks, progression=quests_done, trials=trials,
                returns=trip.state.returns)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', default=str(ROOT/'work/earned-inazuma-bosses/array-complete.json'))
    args = parser.parse_args()
    result = run(args.from_save)
    (ROOT/'evidence/earned-inazuma-thunder-pyro.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
