"""Play Nod-Krai from the checkpoint earned by the preceding fresh route."""

import json
import subprocess
import sys

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


hub = 'nod-town'
work = ROOT / 'work' / 'nod-fresh-route'
work.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(ROOT / 'test_natlan_fresh_route.py')], stdout=subprocess.DEVNULL, check=True)
checkpoint = validate_save(read('work/natlan-fresh-route/nod-save.json'))
assert checkpoint['story']['node'] == hub and checkpoint['progression']['level'] == 120

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
farm = lua.eval('''function(core, state, level, controls)
    for elapsed=1,4500 do
        core.step(state, 1/60, controls)
        if state.progression.level >= level or state.actors[state.active].hp < 65
                or #state.inventory.ground >= 12 then
            return elapsed
        end
    end
    return 4500
end''')
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


def fight(cleared, approach):
    near(*approach)
    for _ in range(1600):
        if cleared():
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
    raise AssertionError((state.story.node, native(trail.actor), state.storyNotice))


def tick(number=1, controls=trail.idle):
    for _ in range(number):
        core.step(state, 1 / 60, controls)


def wait(predicate, ticks=1000, controls=trail.idle):
    for _ in range(ticks):
        if predicate():
            return
        tick(1, controls)
    raise AssertionError((state.story.node, trail.actor.x, trail.actor.y, state.storyNotice))


def jump_to(x, y):
    act('jump')
    for _ in range(100):
        actor = trail.actor
        if actor.ground and actor.y == y and abs(actor.x - x) < 9:
            return
        tick(1, jump_right if actor.x < x - 5 else trail.inputs['jump'])
    raise AssertionError((state.story.node, trail.actor.x, trail.actor.y, x, y, state.storyNotice))


def clear_backlog():
    items = state.inventory['items']
    spare = sorted(
        (item for item in items.values() if item.owner == 0 and not item.locked),
        key=lambda item: (item.rarity, item.itemLv, item.id),
    )
    for item in spare[:max(0, len(items) - 55)]:
        act('artifact_sell:' + str(item.id))
    act('artifact_recover')
    assert len(state.inventory.ground) == 0


clear_backlog()
first, coast, shallows, rocks = 'nod-first-treasure', 'nod-workshop-coast', 'nod-moon-shallows', 'nod-tide-rocks'
quest = accept(first)
collect(320)
assert quest.storyChoice == 'fisher'
cross(coast)
collect(540)

columbina, stalls, detour, bench = (
    'columbina-coast-detour', 'nod-night-stalls', 'nod-detour-shore', 'nod-far-sea-bench',
)
side = accept(columbina)
collect(579)
cross(stalls)
collect(717)
cross(detour)
fight(lambda: side.count == 3, (530, 480))
cross(bench)
collect(777, 386)
collect(1116, 386)
cross(coast)
report(columbina)
assert frame().storyJoined.columbina

cross(shallows)
for _ in range(3):
    collect(500)
assert quest.count == 3 and any(p.moonDeck for p in state.platforms.values())
near(572)
jump_to(680, 447)
cross(rocks)
fight(lambda: quest.count == 4, (560, 480))
collect(1337)
cross(hub)
report(first)

second, rest, wood, inlet, mouth = (
    'nod-moon-crossroads', 'nod-lull-wood', 'nod-spruce-clearing', 'nod-box-inlet', 'nod-moon-cave-mouth',
)
quest = accept(second)
collect(686)
cross(rest)
collect(478)
cross(wood)
fight(lambda: quest.pathProgress.wood.count == 2, (310, 480))
cross(inlet)
collect(470)
collect(801, 386)
assert frame().storyBoxGlimpse.seconds > 2
collect(934, 386)
assert quest.count == 5 and any(p.moonDeck for p in state.platforms.values())
cross(mouth)
collect(549)
cross(hub)
report(second)

third, arena, vault = 'nod-moon-vault-quest', 'nod-moon-crab-arena', 'nod-moon-vault'
quest = accept(third)
cross(mouth)
collect(1080)
cross(arena)
fight(lambda: quest.count == 2, (810, 480))
cross(vault)
collect(416)
collect(657)
assert quest.storyChoice == 'feather'
cross(hub)
report(third)

appraisal, workshop, yard = 'nod-treasure-appraisal', 'nod-appraisal-workshop', 'nod-appraisal-yard'
cross(workshop)
quest = accept(appraisal)
collect(430)
cross(yard)
collect(1215, 382)
collect(825)
collect(420)
cross(workshop)
for _ in range(3):
    collect(430)
for x in (761, 1224, 991, 1432):
    collect(x)
report(appraisal)
cross(hub)

patrol, cabin, shore, bend, post = (
    'nod-lantern-patrol', 'nod-patrol-cabin', 'nod-patrol-shore', 'nod-patrol-bend', 'nod-patrol-post',
)
cross(cabin)
quest = accept(patrol)
collect(318)
cross(shore)
collect(340)
collect(1118, 386)
cross(bend)
near(616, 386)
near(905, 290)
fight(lambda: quest.count == 4, (1015, 290))
cross(post)
collect(410)
cross(cabin)
collect(756)
report(patrol)
cross(hub)

entry, snow_town = 'snezhnaya-entry', 'snezhnaya-hub'
near(1380)
closed = frame().storyNearbyPortal
assert closed.to == entry and not closed.available and closed.level == 140
act('story_nearby_portal')
assert state.story.node == hub

statue, forest_path, west = 'nod-wp-88128', 'nod-wp-88145', 'nod-wp-88144'
spruce, frost, switchback = 'nod-north-spruce-shelves', 'nod-west-frost-slope', 'winter-frontier-switchback'
cross(statue, forest_path)
for stage, required in ((spruce, 130), (frost, 133), (switchback, 136)):
    act('world_map_toggle')
    act('world_map_layer:hunt')
    act('world_map_select:' + stage)
    guide = frame().worldMap.guide
    if required == 130:
        assert guide.status == 'ready'
    else:
        assert guide.status == 'blocked' and guide.reason == f'必要Lv{required}', (stage, guide.reason)
    act('world_map_close')

recovery_trips, inventory_trips = 0, 0
hunting = []
for stage, parent, threshold in ((spruce, forest_path, 133), (frost, west, 136), (switchback, hub, 140)):
    if parent == hub:
        cross(statue, hub)
    elif state.story.node != parent:
        cross(parent)
    exp_per_enemy = LEVELS[nodes[stage]['level'] - 1]['normal_enemy_base_exp']
    totals = dict(stage=stage, sorties=0, kills=0, xp=0, ticks=0)
    for _ in range(125):
        if state.progression.level >= threshold:
            break
        needs_recovery = trail.actor.hp < 95
        needs_inventory = len(state.inventory.ground) >= 12
        if needs_recovery or needs_inventory:
            act('story_fast:' + hub)
            assert state.story.node == hub and trail.actor.hp == trail.actor.maxhp
            if needs_inventory:
                clear_backlog()
                inventory_trips += 1
            if needs_recovery:
                recovery_trips += 1
            if parent != hub:
                act('story_fast:' + parent)
                assert state.story.node == parent
        cross(stage)
        before_kills, before_xp = state.kills, state.progression.killXp
        if stage == frost:
            near(555)
        elif stage == switchback:
            near(260)
        act('auto')
        elapsed = farm(core, state, threshold, trail.idle)
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

ready = validate_save(native(core.checkpoint(state)))
(work / 'snow-ready-save.json').write_text(json.dumps(ready, ensure_ascii=False) + '\n', encoding='utf8')
act('world_map_toggle')
act('world_map_region:region-08')
act('world_map_select:' + snow_town)
guide = frame().worldMap.guide
assert guide.status == 'ready' and [(stop.id, stop.mode) for stop in guide.stops.values()] == [
    (entry, 'walk'), (snow_town, 'walk'),
]
act('world_map_close')
cross(entry, snow_town)
mark(snow_town)
assert state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == snow_town and restored.progression.total == state.progression.total
quests = (first, second, third, columbina, appraisal, patrol)
assert all(restored.story.quests[id].status == 'complete' and restored.story.quests[id].cycles == 1 for id in quests)
ticket = 'white-pass-ticket'
core.action(restored, 'story_accept:' + ticket)
assert restored.story.quests[ticket] is None
assert next(q['level'] for q in graph['quests'] if q['id'] == ticket) == 141
snow_trail = TrailWalk(lua, core, restored, edges, exits)
snow_trail.cross('snezhnaya-field')
snow_trail.cross('white-pass-cut')
assert restored.story.node == 'white-pass-cut' and len(restored.enemies) == 28

(work / 'snezhnaya-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(route=milestones, completedQuests=quests, hunts=hunting, recoveryTrips=recovery_trips,
              inventoryTrips=inventory_trips, partyWipes=state.returns, savedAndRestored=True,
              nextChapter=dict(id=ticket, requiredLevel=141, availableHunt='white-pass-cut'),
              scope='Continuation of the new Lv1 adventure. Scripted Lua inputs and auto-battle for hunting.')
(ROOT / 'evidence/nod-fresh-route.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
