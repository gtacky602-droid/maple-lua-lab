"""Progress from the earned Inazuma arrival to two field-boss commissions."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, quests


PORT = 'inazuma-port'
ROAD = 'inazuma-road'
TOWN = 'inazuma-town'
CLEARING = 'inazuma-lantern-clearing'
WORK = ROOT/'work/earned-inazuma-bosses'
ENCOUNTERS = (
    ('maguu', 'boss-25090101', 'maguu-approach', 'maguu-field-dojo', 44),
    ('array', 'boss-24021101', 'array-approach', 'array-field-court', 46),
)


def collect(trip, x, y=480):
    trip.approach(x, y, 'quest objective')
    trip.act('story_collect')


def save_replay(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


def lantern(trip):
    collect(trip, 410)
    for stage in (ROAD, TOWN, 'inazuma-lantern-trail'):
        trip.cross(stage)
    for x, y in ((305, 480), (670, 391), (1100, 480)):
        collect(trip, x, y)
    trip.cross(CLEARING)
    trip.approach(680, 480, CLEARING)
    for lantern_id in ('leaf-lantern', 'tanuki-invitation'):
        assert trip.frame().storyNearbyLantern.id == lantern_id
        trip.act('story_collect')


def sayu(trip):
    trip.mark('ina-sayu-quiet-route', 1)
    trip.cross('ina-sayu-watchpath', gate_x=454)
    for x, y in ((472, 480), (1012, 392), (1589, 480), (1943, 480)):
        collect(trip, x, y)
    for _ in range(600):
        if trip.state.story.quests['ina-sayu-quiet-route'].count == 5:
            break
        trip.tick(1)
    assert trip.state.story.quests['ina-sayu-quiet-route'].count == 5
    trip.cross(TOWN, gate_x=2188)
    collect(trip, 1135)


def ayaka(trip):
    trip.travel(TOWN)
    save_replay(trip, 'ayaka-overlap')
    progress = trip.state.story.quests['ayaka-join']
    for index, (x, y) in enumerate(((250, 480), (570, 340)), 1):
        collect(trip, x, y)
        assert progress.count == index, (x, y, progress.count, trip.state.storyNotice)
    trip.approach(1090, 480, 'the slope beside Sayu’s nap')
    scene = trip.frame()
    assert scene.storyNearbySight and not scene.storyNearbyMilestone
    trip.act('story_collect')
    assert progress.count == 3 and progress.sights.seen.slope
    collect(trip, 790)
    assert trip.frame().storySightChoices
    trip.act('story_sight_mark:rooftops')
    trip.approach(1135, 480, 'Sayu’s nap')
    assert 'もう一度読む' in trip.frame().storyNearbyMilestone.label
    trip.act('story_collect')
    assert trip.state.storyNotice == quests['ina-sayu-quiet-route']['closing']


def forest(trip):
    rooms = ('footprints', 'statues', 'reflections', 'thicket')
    trip.travel(CLEARING)
    trip.cross('inazuma-torii-'+rooms[0])
    trip.approach(1240, 480, 'the looping torii gate')
    trip.act('story_nearby_portal')
    assert trip.state.story.quests['inazuma-torii-maze'].forest.looped
    for point, destination in zip((485, 855, 485), rooms[1:], strict=True):
        collect(trip, point)
        trip.cross('inazuma-torii-'+destination)
    enemies = [unit for unit in trip.state.enemies.values()
               if unit.spawnId and unit.spawnId.startswith('inazuma-thicket-')]
    assert len(enemies) == 3
    trip.fight(enemies, trip.totals(), allow_collateral=True)
    collect(trip, 1280)
    trip.cross('inazuma-forest-shore')


def progress(trip, quest, play, level):
    previous_level = trip.state.progression.level
    trip.travel(quests[quest]['hub'])
    trip.act('story_accept:'+quest)
    assert trip.state.story.quests[quest].status == 'active'
    play(trip)
    assert trip.state.story.quests[quest].count == quests[quest]['goal']
    trip.travel(quests[quest]['hub'])
    trip.report(quest)
    assert trip.state.progression.level == level, (quest, trip.state.progression.level, level)
    return dict(trip.reports[-1], startLevel=previous_level, finishLevel=level)


def confirm_lock(trip, arrival, arena, level):
    trip.travel(arrival)
    reason = f'必要Lv{level}'
    guide = trip.guide(arena)
    assert guide['status'] == 'blocked' and guide['requiredLevel'] == level and reason in guide['reason'], guide
    trip.confirm_lock(arena, f'必要レベル {level}')
    trip.locks[-1].update(atLevel=trip.state.progression.level, gateLevel=level, atlasReason=guide['reason'])
    trip.travel(PORT)


def fight(trip, boss_id, name):
    state, actor = trip.state, trip.actor
    slot = state.fieldSlots[boss_id]
    boss = slot.enemy
    trip.approach(boss.x-95, 480, boss_id)
    before = dict(time=state.t, hp=actor.hp, hits=state.hits, kills=state.kills,
                  xp=state.progression.killXp, mora=state.mora, returns=state.returns)
    moves = ('FMK01', 'FMK02', 'FMK03') if name == 'maguu' else ('FPA01', 'FPA02', 'FPA03')
    controls = {(direction, attack): trip.lua.table(left=direction < 0, right=direction > 0, attack=attack)
                for direction in (-1, 0, 1) for attack in (False, True)}
    evaded, recovery = {}, set()
    next_cast = None
    strike_hp = None
    alternate_x = None
    counter = False
    airborne = False
    for _ in range(120*60):
        if slot.phase == 'respawn':
            break
        assert actor.hp > 0 and state.returns == before['returns'], (name, boss.hp, actor.hp)
        cast = slot.cast
        old_boss_hp = boss.hp
        attack = False
        direction = 0
        dx = boss.x-actor.x
        recovering = False
        if cast:
            move = cast.move
            code, t = move.id, cast.tick
            recovering = t >= move.recover
            if next_cast != code:
                next_cast, strike_hp, alternate_x = code, None, None
            if code not in evaded:
                if strike_hp is None and t == move.lock:
                    strike_hp = actor.hp
                    alternate_x = cast.origin-cast.dir*82
                    view = trip.frame().fieldBoss
                    assert view.move == code and view.label == move.title
                if strike_hp is not None:
                    toward = alternate_x-actor.x
                    direction = 0 if abs(toward) <= 6 else (1 if toward > 0 else -1)
                    active_end = 144 if move.mask else max(w[2] for w in move.active.values())
                    if t >= active_end:
                        assert actor.hp == strike_hp and (actor.x-cast.origin)*cast.dir < 0, (
                            code, t, actor.x, cast.origin, cast.dir, actor.hp, strike_hp,
                        )
                        evaded[code] = dict(warningTick=move.lock, activeEndTick=active_end,
                                            hp=actor.hp, avoidedByCrossing=True)
                    if code == 'FPA03' and boss.y < 450:
                        airborne = airborne or bool(trip.frame().fieldBoss.flying)
            if recovering and code not in recovery:
                view = trip.frame().fieldBoss
                assert view.recovering and '反撃の隙' in view.label, (code, view.label)
                recovery.add(code)
        else:
            next_cast = None
        if len(evaded) == len(moves):
            if not cast or recovering:
                direction = (1 if dx>0 else -1) if abs(dx)>95 or dx*actor.dir<0 else 0
                attack = abs(dx)<122 and dx*actor.dir>=0
            elif cast.tick >= cast.move.lock:
                alternate = cast.origin-cast.dir*82-actor.x
                direction = 0 if abs(alternate)<=6 else (1 if alternate>0 else -1)
        trip.tick(1, controls[direction, attack])
        counter = counter or bool(attack and recovering and boss.hp < old_boss_hp)
    assert slot.phase == 'respawn' and boss.hp == 0 and state.returns == before['returns'], (
        name, boss.hp, actor.hp, evaded, sorted(recovery), counter,
    )
    assert tuple(evaded) == moves and recovery and counter, (name, evaded, recovery, counter)
    assert name != 'array' or airborne
    assert state.kills == before['kills']+1 and state.hits > before['hits']
    assert state.progression.killXp > before['xp'] and state.mora > before['mora']
    return dict(seconds=round(state.t-before['time'], 2), startHP=before['hp'], finishHP=actor.hp,
                evaded=evaded, recoveryLabels=sorted(recovery), counterHit=counter, airborneSeen=airborne,
                killXp=state.progression.killXp-before['xp'], killMora=state.mora-before['mora'])


def run(source):
    WORK.mkdir(parents=True, exist_ok=True)
    trip = Journey(source, engine=runtime())
    state = trip.state
    assert state.story.node == PORT and state.progression.level == 40 and not state.inventory.sampleKit
    equipped = []
    for id in (10, 2):
        item = next(item for item in state.inventory['items'].values() if item.id == id)
        assert item.owner == 0
        trip.act(f'artifact_equip:{id}')
        assert item.owner == 1
        equipped.append(dict(id=id, level=item.itemLv, slot=item.slot))
    for name, _, entry, arena, level in ENCOUNTERS:
        trip.act('story_accept:'+name+'-commission')
        assert state.story.quests[name+'-commission'].status == 'active'
        confirm_lock(trip, entry, arena, level)

    training, trials = [], {}
    training.append(progress(trip, 'inazuma-moving-lantern', lantern, 42))
    training.append(progress(trip, 'ina-sayu-quiet-route', sayu, 43))
    training.append(progress(trip, 'ayaka-join', ayaka, 44))
    for name, boss, entry, arena, level in ENCOUNTERS:
        if name == 'maguu':
            confirm_lock(trip, ENCOUNTERS[1][2], ENCOUNTERS[1][3], ENCOUNTERS[1][4])
        else:
            training.append(progress(trip, 'inazuma-torii-maze', forest, 47))
        actual_level = trip.state.progression.level
        assert actual_level >= level
        save_replay(trip, f'{name}-ready')
        route = [stop['id'] for stop in trip.travel(arena)]
        assert route[-2:] == [entry, arena]
        result = fight(trip, boss, name)
        quest = name+'-commission'
        assert trip.state.story.quests[quest].count == quests[quest]['goal']
        trip.travel(PORT)
        trip.report(quest)
        checkpoint = trip.snapshot()
        assert checkpoint['fieldBosses'][boss]['waitTicks'] > 0
        trip.restore()
        assert trip.state.endgame.bosses[boss].clears == 1
        assert trip.state.story.quests[quest].status == 'complete'
        assert trip.state.story.quests[quest].cycles == 1
        assert trip.snapshot()['fieldBosses'][boss]['waitTicks'] == checkpoint['fieldBosses'][boss]['waitTicks']
        trials[name] = dict(result, arena=arena, route=route, level=actual_level, gateLevel=level,
                            report=trip.reports[-1], restored=True)
        print(name, actual_level, result['seconds'], result['finishHP'], list(result['evaded']), flush=True)
    save_replay(trip, 'array-complete')
    return dict(sourceSha256=trip.source, obtainedEquipment=equipped, sayuReadbackAndAyakaSight=True, training=training,
                locks=trip.locks, trials=trials, returns=trip.state.returns)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', default=str(ROOT/'work/liyue-fresh-route/inazuma-save.json'))
    args = parser.parse_args()
    proof = run(args.from_save)
    (ROOT/'evidence/earned-inazuma-field-bosses.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
