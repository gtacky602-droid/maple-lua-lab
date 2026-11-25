"""Play Fontaine from the checkpoint earned by the preceding fresh route."""

import json
import subprocess
import sys

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from tools.quest_guide_test import GuideChecks

guides = GuideChecks('fontaine')


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


hub = 'fontaine-hub'
after_revisits = '--after-revisits' in sys.argv
work = ROOT / 'work' / ('fontaine-revisits-route' if after_revisits else 'fontaine-fresh-route')
work.mkdir(parents=True, exist_ok=True)
if after_revisits:
    checkpoint = validate_save(read('evidence/sumeru-revisit-save.json'))
else:
    subprocess.run([sys.executable, str(ROOT / 'test_sumeru_fresh_route.py')], stdout=subprocess.DEVNULL, check=True)
    checkpoint = validate_save(read('work/sumeru-fresh-route/fontaine-save.json'))
assert checkpoint['story']['node'] == hub and checkpoint['progression']['level'] == (81 if after_revisits else 80)

graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
lua, core = runtime()
state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
trail = TrailWalk(lua, core, state, edges, exits)
attack = {dx: lua.table_from(dict(left=dx < 0, right=dx > 0, attack=True)) for dx in (-1, 0, 1)}
jump_attack = lua.table_from(dict(attack=True, jump=True))
jump_right = lua.table_from(dict(right=True, jump=True))
milestones = []


def act(key):
    core.action(state, key)


def frame():
    return core.frame(state, 'sprite', 'legacy')


def cross(*destinations):
    for destination in destinations:
        trail.cross(destination)


def near(x, y=480):
    trail.approach(x, y, 'quest objective')


def collect(x, y=480, key='story_collect'):
    near(x, y)
    act(key)


def accept(id):
    act('story_accept:' + id)
    quest = state.story.quests[id]
    assert quest.status == 'active', (id, state.storyNotice)
    return quest


def mark(id):
    p = state.progression
    row = dict(id=id, seconds=round(state.t, 2), level=p.level, total=p.total, questXp=p.questXp,
               killXp=p.killXp, kills=state.kills)
    milestones.append(row)
    print(id, p.level, p.total, flush=True)


def report(id):
    act('story_report:' + id)
    quest = state.story.quests[id]
    assert quest.status == 'complete' and quest.cycles == 1, (id, quest.count, state.storyNotice)
    mark(id)


def fight(quest, cleared_count, approach):
    near(*approach)
    for _ in range(1600):
        if quest.count == cleared_count:
            return
        actor = trail.actor
        assert actor.hp > 0, (state.story.node, actor.hp, state.returns)
        enemies = [enemy for enemy in state.enemies.values() if enemy.hp > 0]
        target = min(enemies, key=lambda enemy: abs(enemy.x - actor.x) + abs(enemy.y - actor.y))
        dx = 0 if abs(actor.x - target.x) < 30 else (-1 if actor.x > target.x else 1)
        if dx == 0 and target.y < actor.y - 35:
            act('jump')
            controls = jump_attack
        else:
            controls = attack[dx]
        core.step(state, 1 / 60, controls)
    raise AssertionError((state.story.node, quest.count, native(trail.actor), state.storyNotice))


def tick(number=1, controls=trail.idle):
    for _ in range(number):
        core.step(state, 1 / 60, controls)


def choose(x, presses):
    near(x)
    for _ in range(presses):
        act('story_collect')
    act('story_airflow_commit')


def jump_across(start, end, y):
    near(start)
    act('jump')
    for _ in range(90):
        actor = trail.actor
        if actor.ground and actor.y == y and actor.x >= end:
            return
        tick(1, jump_right if actor.x < end else trail.inputs['jump'])
    raise AssertionError((state.story.node, trail.actor.x, trail.actor.y, y))


first, counter, quay, old_door, loft = (
    'fontaine-moon-parcel', 'fontaine-parcel-counter', 'fontaine-delivery-quay',
    'fontaine-old-scenery-door', 'fontaine-moon-fly-loft',
)
quest = accept(first)
cross(counter)
collect(320)
cross(quay)
collect(508)
collect(900)
choose(1038, 1)
assert quest.count == 3
choose(1038, 2)
assert quest.count == 4
guides.expect(frame(),first,name='メカの出発ベル',xy=(1178,480))
collect(1178)
near(820)
tick(90)
assert frame().storyTheaterCart.phase=='waitingForPlayer'
guides.expect(frame(),first,name='搬送メカ',xy=(state.theaterCart.x,480))
assert frame().storyHunts[first].action=='近づいて合流'
# A reload restarts this trip at its bell, with the completed clue comparison saved.
cart_save = validate_save(native(core.checkpoint(state)))
state = core.restore(lua.table_from(cart_save,recursive=True),12)
trail.state = state
quest = state.story.quests[first]
assert state.story.node==hub and quest.count==4
cross(counter,quay)
guides.expect(frame(),first,name='メカの出発ベル',xy=(1178,480))
collect(1178)
for x in (1270, 1400, 1540, 1650):
    near(x)
    tick(100)
assert quest.count == 5 and state.theaterShutter is None
guides.expect(frame(),first,absent=True)
cross(old_door)
guides.expect(frame(),first,spawns=['fontaine-old-door-patrol-1','fontaine-old-door-patrol-2'])
fight(quest, 6, (410, 480))
cross(loft)
collect(863, 391)
cross(hub)
report(first)
guides.expect(frame(),first,absent=True)
if not after_revisits:
    guides.save()

second, wings, catwalk, workfloor, store, rehearsal = (
    'fontaine-understage-crew', 'fontaine-stage-wings', 'fontaine-lift-catwalk',
    'fontaine-understage-workfloor', 'fontaine-parcel-storeroom', 'fontaine-rehearsal-room',
)
quest = accept(second)
cross(loft, wings)
collect(366)
collect(866)
near(870, 400)
near(1060, 321)
cross(catwalk)
near(575, 390)
cross(workfloor)
choose(552, 2)
assert quest.count == 3 and state.theaterWaveWall
jump_across(621, 760, 390)
fight(quest, 4, (760, 390))
cross(store)
assert not state.solids or len(state.solids) == 0, 'The wave board must stay in the workfloor'
collect(292)
collect(534)
collect(833, 390)
choose(1008, 2)
collect(1162)
cross(rehearsal)
collect(764)
cross(hub)
report(second)

furina = 'fon-furina-cues'
quest = accept(furina)
cross(rehearsal)
collect(245)
collect(454)
for cue in ('curtain', 'lamp', 'wave'):
    act('story_rehearsal:' + cue)
assert quest.count == 2
collect(454)
tick(300)
act('story_rehearsal:pair')
tick(75)
act('story_rehearsal:wave')
collect(245)
cross(hub)
report(furina)

third, watch, booth, runway, arena = (
    'fontaine-grand-finale', 'fontaine-stage-watch', 'fontaine-scenery-booth',
    'fontaine-grand-stage-approach', 'fontaine-grand-stage',
)
quest = accept(third)
cross(watch)
collect(424)
cross(booth)
choose(700, 2)
assert quest.count == 2 and quest.stagePlan == 'deck'
cross(runway)
jump_across(571, 740, 391)
fight(quest, 3, (790, 391))
cross(arena)
fight(quest, 4, (912, 480))
collect(1176)
collect(1447, 390)
tick(95)
collect(1447, 390)
assert quest.count == 6
cross(hub)
report(third)

emilie, atelier, shore = 'fon-emilie-scent', 'fon-emilie-atelier', 'fon-emilie-scent-shore'
quest = accept(emilie)
cross(atelier)
collect(456)
cross(shore)
collect(347)
collect(664, 394)
fight(quest, 4, (790, 480))
collect(1325)
cross(atelier)
collect(456)
collect(1080)
collect(670)
collect(1080)
cross(hub)
report(emilie)

navia, photo = 'fon-navia-photo', 'fon-photo-terrace'
quest = accept(navia)
cross(photo)
for x in (210, 365, 547, 720, 897):
    collect(x)
collect(1066)
act('story_photo_riser:low')
act('story_photo_seat:side')
act('story_photo_confirm')
assert quest.count == 6
collect(1066)
near(1450)
tick(280)
assert quest.count == 7
collect(1724)
act('story_photo_publish:candid')
cross(hub)
report(navia)

lyney, freminet = 'fon-lyney-magic', 'fon-freminet-dive'
if after_revisits:
    partial = validate_save(native(core.checkpoint(state)))
    (work/'three-exhibits.json').write_text(json.dumps(partial, ensure_ascii=False), encoding='utf8')
    quest = accept(lyney)
    magic, seats = 'fon-magic-wings', 'fon-magic-seats'
    cross(rehearsal, magic)
    collect(219)
    collect(553, 392)
    cross(seats)
    collect(424)
    cross(magic)
    collect(819)
    tick(100)
    collect(1303)
    collect(1179)
    tick(68)
    act('story_collect')
    tick(211)
    cross(seats)
    collect(424)
    tick(211)
    cross(hub)
    report(lyney)
    assert quest.storyChoice == 'light'

    quest = accept(freminet)
    collect(477)
    party = (state.active, state.companion)
    cross('fon-toy-shallows')

    def swim(x, y):
        for axis, goal, low, high in [('y', y, 'up', 'down'), ('x', x, 'left', 'right')]:
            for _ in range(600):
                delta = goal - trail.actor[axis]
                if abs(delta) < 3:
                    break
                tick(1, trail.inputs[low if delta < 0 else high])
            else:
                raise AssertionError((axis, goal, trail.actor.x, trail.actor.y))

    for x, y in [(291,216), (525,368), (715,261), (1082,437), (1354,304)]:
        swim(x,y)
        if x == 1354:
            tick(300)
        act('story_collect')
    assert quest.storyChoice == 'coral' and quest.count == 6
    swim(1547,250)
    act('story_nearby_portal')
    assert state.story.node == hub and (state.active,state.companion) == party
    report(freminet)

field, natlan_entry, natlan = 'fontaine-field', 'natlan-entry', 'natlan-hub'
cross(field)
near(1380)
blocked = frame().storyNearbyPortal
assert blocked.to == natlan_entry and not blocked.available and blocked.level == 100
act('story_nearby_portal')
assert state.story.node == field

entry, inlet, mountain = 'fontaine-entry', 'fon-wp-50035', 'fon-wp-50036'
cross(hub, entry, inlet)
bank, hills, beryl = 'fontaine-beryl-bank', 'fontaine-beryl-foothills', 'sites-hunt-50034'
for stage, required in ((bank, 91), (hills, 95), (beryl, 99)):
    act('world_map_toggle')
    act('world_map_layer:hunt')
    act('world_map_select:' + stage)
    guide = frame().worldMap.guide
    if state.progression.level >= required:
        assert guide.status == 'ready'
    else:
        assert guide.status == 'blocked' and guide.reason == f'必要Lv{required}', (stage, guide.reason)
    act('world_map_close')

recovery_trips = 0
hunting = []
for stage, parent, threshold in ((bank, inlet, 95), (hills, mountain, 99), (beryl, inlet, 100)):
    if state.story.node != parent:
        cross(parent)
    exp_per_enemy = LEVELS[nodes[stage]['level'] - 1]['normal_enemy_base_exp']
    totals = dict(stage=stage, sorties=0, kills=0, xp=0, ticks=0)
    for _ in range(90):
        if state.progression.level >= threshold:
            break
        if trail.actor.hp < 95:
            act('story_fast:' + hub)
            assert state.story.node == hub and trail.actor.hp == trail.actor.maxhp
            act('story_fast:' + parent)
            assert state.story.node == parent
            recovery_trips += 1
        cross(stage)
        before_kills, before_xp = state.kills, state.progression.killXp
        if stage == beryl:
            near(2370)
        act('auto')
        for elapsed in range(1, 4501):
            tick()
            if state.progression.level >= threshold or trail.actor.hp < 65:
                break
        act('auto')
        kills, xp = state.kills - before_kills, state.progression.killXp - before_xp
        assert kills > 0 and xp == kills * exp_per_enemy and state.returns == 0, (
            stage, kills, xp, elapsed, trail.actor.x, trail.actor.hp,
        )
        totals['sorties'] += 1
        totals['kills'] += kills
        totals['xp'] += xp
        totals['ticks'] += elapsed
        cross(parent)
    assert state.progression.level == threshold, (stage, threshold, state.progression.level)
    totals['seconds'] = round(totals.pop('ticks') / 60, 2)
    hunting.append(totals)
    mark('lv' + str(threshold))

cross(entry, hub)
ready = validate_save(native(core.checkpoint(state)))
(work / 'natlan-ready-save.json').write_text(json.dumps(ready, ensure_ascii=False) + '\n', encoding='utf8')
act('world_map_toggle')
act('world_map_region:region-06')
act('world_map_select:' + natlan)
guide = frame().worldMap.guide
assert guide.status == 'ready' and [(stop.id, stop.mode) for stop in guide.stops.values()] == [
    (field, 'walk'), (natlan_entry, 'walk'), (natlan, 'walk'),
]
act('world_map_close')
cross(field, natlan_entry, natlan)
mark(natlan)
assert state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == natlan and restored.progression.level == 100
assert restored.progression.total == state.progression.total
quests = (first, second, third, furina, emilie, navia) + ((lyney, freminet) if after_revisits else ())
assert all(restored.story.quests[id].status == 'complete' and restored.story.quests[id].cycles == 1 for id in quests)
next_quest = 'natlan-ridge-flag'
core.action(restored, 'story_accept:' + next_quest)
assert restored.story.quests[next_quest].status == 'active'

(work / 'natlan-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(route=milestones, completedQuests=quests, hunts=hunting, recoveryTrips=recovery_trips,
              partyWipes=state.returns, noWorkfloorWallInStoreroom=True, savedAndRestored=True,
              firstNatlanQuestAvailable=next_quest,
              scope='Continuation of the new Lv1 adventure. Scripted Lua inputs and auto-battle for hunting.')
if after_revisits:
    for key, record in checkpoint['story']['quests'].items():
        if record['status'] == 'complete':
            assert saved['story']['quests'][key] == record
    (ROOT/'evidence/fontaine-revisit-save.json').write_bytes((json.dumps(saved, ensure_ascii=False, sort_keys=True)+'\n').encode('utf8'))
filename = 'fontaine-after-revisits.json' if after_revisits else 'fontaine-fresh-route.json'
(ROOT/'evidence'/filename).write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
