"""Play Natlan from the checkpoint earned by the preceding fresh route."""

import json
import subprocess
import sys
from math import ceil

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


hub = 'natlan-hub'
work = ROOT / 'work' / 'natlan-fresh-route'
work.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(ROOT / 'test_fontaine_fresh_route.py')], stdout=subprocess.DEVNULL, check=True)
checkpoint = validate_save(read('work/fontaine-fresh-route/natlan-save.json'))
assert checkpoint['story']['node'] == hub and checkpoint['progression']['level'] == 100

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


first, staging, slope, cleft, summit = (
    'natlan-ridge-flag', 'natlan-flag-staging', 'natlan-flag-slope', 'natlan-flag-cleft', 'natlan-flag-summit',
)
quest = accept(first)
cross(staging)
collect(382)
cross(slope)
collect(445)
near(842, 391)
collect(1445, 391)
cross(cleft)
collect(750, 391)
wait(lambda: quest.count == 4)
assert any(p.raceBridge for p in state.platforms.values())
cross(summit)
collect(1105, 390)
cross(hub)
report(first)

second, steps, high, river, turn, meet = (
    'natlan-two-trials', 'natlan-high-trial-steps', 'natlan-high-trial-field',
    'natlan-river-float-run', 'natlan-river-turn-basin', 'natlan-duel-entry',
)
quest = accept(second)
cross(summit)
collect(795, 390)
cross(steps)
collect(522, 391)
near(900, 302)
collect(1044, 302)
cross(high)
fight(lambda: quest.pathProgress.high.count == 3, (300, 480))
collect(1534, 390)
cross(summit, river)
collect(252)
near(388)
raft = state.riverDecks[1].platform
wait(lambda: raft.x == 340)
jump_to(388, 430)
wait(lambda: raft.x == 914)
jump_to(1117, 480)
fight(lambda: quest.pathProgress.water.count == 2, (1125, 480))
cross(turn)
near(397)
jump_to(478, 411)
jump_to(646, 390)
wait(lambda: trail.actor.x >= 846, controls=trail.inputs['right'])
wait(lambda: trail.actor.ground and trail.actor.y == 411)
raft = state.riverDecks[1].platform
wait(lambda: 785 < raft.x < 805 and (state.t - state.storyEnteredAt) % 12.8 < 6.4)
wait(lambda: trail.actor.x >= 906, controls=trail.inputs['right'])
wait(lambda: trail.actor.ground and trail.actor.y == 435, ticks=120)
wait(lambda: raft.x == 1070)
jump_to(1270, 480)
fight(lambda: quest.pathProgress.water.count == 3, (1250, 480))
collect(1480)
assert quest.pathProgress.high.count == quest.pathProgress.water.count == 4
cross(summit, meet)
collect(431)
collect(847, 390)
cross(hub)
report(second)

third, review, arena, rostrum = (
    'natlan-sunset-duel', 'natlan-sunset-review', 'natlan-sunset-arena', 'natlan-sunset-rostrum',
)
quest = accept(third)
cross(meet)
collect(418)
cross(review)
collect(801, 390)
cross(arena)
near(650, 390)
fight(lambda: quest.count >= 3, (650, 390))
collect(1408)
cross(rostrum)
collect(853, 390)
cross(hub)
report(third)

kachina, charms = 'natlan-kachina-charms', 'natlan-charm-trail'
quest = accept(kachina)
collect(452)
cross(charms)
collect(331)
fight(lambda: quest.count == 3, (570, 480))
collect(1116)
collect(1480, 386)
cross(hub)
collect(452)
act('story_charm_color:teal')
act('story_charm_pattern:row')
act('story_charm_confirm')
report(kachina)

mualani, course, cove = 'natlan-mualani-surf', 'natlan-surf-run', 'natlan-surf-cove'
quest = accept(mualani)
collect(302)
cross(course)
collect(190)
for _ in range(850):
    if not state.surfRound:
        break
    actor = trail.actor
    if actor.ground and (462 <= actor.x < 532 or 1015 <= actor.x < 1080):
        act('jump')
    tick(1, trail.inputs['right'])
assert quest.count == 3
cross(cove)
collect(445)
wait(lambda: frame().storySurf.ready, ticks=350)
act('story_surf_hit')
tick()
assert quest.count == 4
cross(hub)
report(mualani)

kinich, hunt = 'natlan-kinich-ambush', 'natlan-kinich-hunt'
quest = accept(kinich)
collect(392)
cross(hunt)
fight(lambda: quest.count == 2, (810, 480))
assert quest.huntNotes.outcome == 'direct'
cross(hub)
report(kinich)

equipment = {}
for role in (1, 2):
    assert state.active == role
    equipment[role] = []
    for slot in range(1, 6):
        choices = [item for item in state.inventory['items'].values() if item.slot == slot and item.owner == 0]
        best = max(choices, key=lambda item: (item.rarity, item.itemLv, item.id))
        act('artifact_equip:' + str(best.id))
        assert best.owner == role
        equipment[role].append(best.id)
    act('swap')
    tick(26)


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
rocky_road, port, ship = 'natlan-field', 'natlan-port', 'natlan-voyage'
destination, approach, nod = 'nod-port', 'nod-field', 'nod-town'
cross(rocky_road, port)
near(720)
closed = frame().storyNearbyPortal
assert closed.to == ship and not closed.available and closed.level == 120
act('story_nearby_portal')
assert state.story.node == port and not state.voyage

entry, ridge, slope_side, boulder = 'natlan-entry', 'nat-wp-72413', 'nat-wp-72414', 'nat-wp-72440'
red_clay, rock_shelves, domain = 'natlan-terrace-red-clay', 'natlan-east-valley-rocks', 'sites-hunt-73159'
cross(rocky_road, hub, entry, ridge, slope_side, boulder)
for stage, required in ((red_clay, 110), (rock_shelves, 115), (domain, 119)):
    act('world_map_toggle')
    act('world_map_layer:hunt')
    act('world_map_select:' + stage)
    guide = frame().worldMap.guide
    if required == 110:
        assert guide.status == 'ready'
    else:
        assert guide.status == 'blocked' and guide.reason == f'必要Lv{required}', (stage, guide.reason)
    act('world_map_close')

recovery_trips, inventory_trips = 0, 0
hunting = []
for stage, parent, threshold in ((red_clay, boulder, 115), (rock_shelves, slope_side, 119),
                                 (domain, slope_side, 120)):
    if state.story.node != parent:
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
            act('story_fast:' + parent)
            assert state.story.node == parent
        cross(stage)
        before_kills, before_xp = state.kills, state.progression.killXp
        if stage == domain:
            near(370)
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

cross(ridge, entry, hub)
act('world_map_toggle')
act('world_map_region:region-07')
act('world_map_select:' + nod)
guide = frame().worldMap.guide
expected = [rocky_road, port, ship, destination, approach, nod]
assert guide.status == 'ready' and [stop.id for stop in guide.stops.values()] == expected
assert [stop.mode for stop in guide.stops.values()] == ['walk', 'walk', 'boat', 'boat', 'walk', 'walk']
assert guide.stops[4].hint == '出航から90秒で着岸'
act('world_map_close')
cross(rocky_road, port)
ready = validate_save(native(core.checkpoint(state)))
(work / 'nod-ready-save.json').write_text(json.dumps(ready, ensure_ascii=False) + '\n', encoding='utf8')
cross(ship)
voyage = state.voyage
assert voyage.destination == destination and voyage.total == 90
sea_save = validate_save(native(core.checkpoint(state)))
assert core.restore(lua.table_from(sea_save, recursive=True), 12).story.node == port
act('world_map_toggle')
at_sea = state.t
tick(60)
assert state.t == at_sea and state.story.node == ship
act('world_map_close')
tick(ceil((voyage.arrives - state.t) * 60) - 2)
assert state.story.node == ship
wait(lambda: state.story.node == destination, ticks=5)
seconds = round(state.t - voyage.started, 2)
assert seconds == 90 and not state.voyage
cross(approach, nod)
mark(nod)
assert state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == nod and restored.progression.total == state.progression.total
quests = (first, second, third, kachina, mualani, kinich)
assert all(restored.story.quests[id].status == 'complete' and restored.story.quests[id].cycles == 1 for id in quests)
next_quest = 'nod-first-treasure'
core.action(restored, 'story_accept:' + next_quest)
assert restored.story.quests[next_quest].status == 'active'

stopover = core.restore(lua.table_from(ready, recursive=True), 12)
stopover_walk = TrailWalk(lua, core, stopover, edges, exits)
dock = 'ochkanatlan-dock'
stopover_walk.cross(ship)
stopover_walk.cross(dock)
assert stopover.story.node == dock and not stopover.voyage
stopover_walk.cross(ship)
assert abs(stopover.voyage.arrives - stopover.t - 40) < 1e-8
wait_clock = lua.eval('''function(C,s)
    for _=1,2401 do C.step(s,1/60,{}) end
end''')
wait_clock(core, stopover)
assert stopover.story.node == destination and not stopover.voyage

(work / 'nod-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(route=milestones, completedQuests=quests, hunts=hunting, equippedEarnedArtifactIds=equipment,
              recoveryTrips=recovery_trips, inventoryTrips=inventory_trips,
              partyWipes=state.returns, ferrySeconds=seconds, stopoverResumeSeconds=40,
              seaSaveRestoredToPort=True, mapPausesVoyage=True, savedAndRestored=True,
              firstNodQuestAvailable=next_quest,
              scope='Continuation of the new Lv1 adventure. Scripted Lua inputs and auto-battle for hunting.')
(ROOT / 'evidence/natlan-fresh-route.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
