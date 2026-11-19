"""Play a new adventure from Mondstadt to Liyue with public actions and ordinary EXP."""

import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


graph = json.loads((ROOT / 'content/story-graph.json').read_text(encoding='utf8'))
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(node, edge['to']): edge for node, gates in exits.items() for edge in gates}
lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
assert state.progression.level == 1 and state.progression.total == 0
trail = TrailWalk(lua, core, state, edges, exits)
inputs = {direction: lua.table_from(dict(left=direction < 0, right=direction > 0, attack=True))
          for direction in (-1, 0, 1)}
milestones = []


def act(key):
    core.action(state, key)


def step(buttons=trail.idle):
    core.step(state, 1 / 60, buttons)


def wait(predicate, seconds=12):
    for _ in range(seconds * 60):
        if predicate():
            return
        step()
    raise AssertionError((state.story.node, trail.actor.x, trail.actor.y, state.kills))


def fight(x, finished):
    for _ in range(720):
        actor = trail.actor
        if abs(actor.x - x) < 8 and finished():
            return
        direction = 0 if abs(actor.x - x) < 8 else (1 if actor.x < x else -1)
        step(inputs[direction])
    raise AssertionError((state.story.node, x, state.kills, trail.actor.hp))


def near(x, y=480):
    trail.approach(x, y, 'quest objective')


def collect(x, y=480):
    near(x, y)
    act('story_collect')


def accept(id):
    act('story_accept:' + id)
    progress = state.story.quests[id]
    assert progress.status == 'active'
    return progress


def mark(id):
    p = state.progression
    milestones.append(dict(id=id, seconds=round(state.t, 2), level=p.level,
                           total=p.total, questXp=p.questXp, killXp=p.killXp, kills=state.kills))


def report(id):
    act('story_report:' + id)
    progress = state.story.quests[id]
    assert progress.status == 'complete' and progress.cycles == 1
    mark(id)


main = accept('amber-join')
trail.cross('mond-road')
fight(465, lambda: True)
act('skill1')
for x in (500, 835, 1080):
    fight(x, lambda: True)
    for _ in range(180):
        if main.count >= 3:
            break
        step(inputs[0])
    if main.count >= 3:
        break
assert main.count == 3
collect(335)
collect(650, 390)
collect(975)
assert all(main.recovered[id] for id in ('basket', 'toolbox', 'crate'))
fight(1165, lambda: main.count == 4)
trail.cross('mond-town')
report('amber-join')

main = accept('mond-old-trail')
trail.cross('mond-road')
trail.cross('mond-old-road')
trail.cross('mond-old-ground')
collect(660)
assert main.inspected['wheel-ruts']
trail.cross('mond-hill')
fight(662, lambda: main.count == 2)
trail.cross('mond-road')
trail.cross('mond-town')
report('mond-old-trail')

main = accept('mond-watchtower-clear')
trail.cross('mond-road')
trail.cross('mond-hill')
trail.cross('mond-watchtower')
before = state.progression.questXp
fight(455, lambda: True)
fight(780, lambda: main.count == 1)
assert state.progression.questXp - before == 5152
trail.cross('mond-restored-road')
trail.cross('mond-town')
report('mond-watchtower-clear')

rest = accept('mond-rest-stop')
trail.cross('mond-road')
trail.cross('mond-roadside-rest')
fight(315, lambda: rest.rest and rest.rest.defeated['mond-rest-slime'])
fight(758, lambda: rest.rest.defeated['mond-rest-hilichurl'])
collect(515, 392)
collect(750)
collect(925)
collect(1050)
trail.cross('mond-road')
trail.cross('mond-town')
report('mond-rest-stop')

cave = accept('mond-bennett-cave')
trail.cross('mond-road')
trail.cross('mond-hill')
trail.cross('mond-bennett-ledge')
collect(270)
near(505, 400)
near(594, 315)
collect(1170, 315)
for _ in range(180):
    if state.caveFall:
        break
    step(trail.inputs['left'])
wait(lambda: state.story.node == 'mond-bennett-depth')
collect(480)
assert cave.count == 4
trail.cross('mond-old-ground')
trail.cross('mond-old-road')
trail.cross('mond-road')
trail.cross('mond-town')
report('mond-bennett-cave')

roof = accept('mond-windmill')
trail.cross('mond-roof-route')
collect(329, 395)
near(498, 310)
collect(584, 310)
collect(742, 310)
assert state.roofFlight
wait(lambda: not state.roofFlight)
collect(965, 145)
collect(1045, 145)
assert state.roofFlight
wait(lambda: not state.roofFlight)
trail.cross('mond-windmill-lookout')
collect(563)
assert roof.count == 4
trail.cross('mond-town')
report('mond-windmill')

trail.cross('mond-road')
trail.cross('mond-border')
near(1380)
portal = core.frame(state).storyNearbyPortal
assert portal.to == 'liyue-entry' and not portal.available
act('story_nearby_portal')
assert state.story.node == 'mond-border' and state.progression.level < 20
mark('liyue-level-gate')

act('world_map_toggle')
act('world_map_layer:hunt')
act('world_map_select:sites-hunt-7137')
atlas = core.frame(state).worldMap
assert atlas.selected.huntKind == 'field' and atlas.selected.level == 13
assert atlas.guide.status == 'ready'
assert [stop.id for stop in atlas.guide.stops.values()] == ['mond-wp-19', 'sites-hunt-7137']
act('world_map_close')

gate_time = state.t
sorties = []
while state.progression.level < 20:
    trail.cross('mond-wp-19')
    trail.cross('sites-hunt-7137')
    assert len(state.enemies) == 48
    assert all(enemy.storyName and enemy.expRole == 'normal' for enemy in state.enemies.values())
    start_kills, start_xp, start_time = state.kills, state.progression.killXp, state.t
    near(455)
    act('auto')
    wait(lambda: state.progression.level >= 20 or min(a.hp for a in state.actors.values()) <= 50, seconds=900)
    act('auto')
    kills, earned = state.kills - start_kills, state.progression.killXp - start_xp
    # Lv13 enemies give 90% of base EXP against players Lv18 through Lv20.
    assert kills > 0 and earned == kills * round(LEVELS[12]['normal_enemy_base_exp'] * .9)
    sorties.append(dict(seconds=round(state.t - start_time, 2), kills=kills, xp=earned))
    if state.progression.level >= 20:
        break
    assert state.returns == 0 and min(a.hp for a in state.actors.values()) > 0
    act('story_fast:mond-road')
    assert state.story.node == 'mond-road'
    trail.cross('mond-roadside-rest')
    near(990)
    for _ in range(2):
        for _ in range(4):
            act('story_collect')
        assert trail.actor.hp == trail.actor.maxhp
        wait(lambda: state.swap == 0)
        act('swap')
    trail.cross('mond-road')
    trail.cross('mond-border')
assert not state.auto and state.story.node == 'sites-hunt-7137'
hunt = dict(scene='sites-hunt-7137', expeditions=sorties, seconds=round(sum(row['seconds'] for row in sorties), 2),
            kills=sum(row['kills'] for row in sorties), xp=sum(row['xp'] for row in sorties),
            recoveryTrips=len(sorties)-1, gateToLv20Seconds=round(state.t - gate_time, 2))
mark('lv20')

trail.cross('mond-wp-19')
trail.cross('mond-border')
trail.cross('liyue-entry')
trail.cross('liyue-harbor')
mark('liyue-harbor')
assert state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == 'liyue-harbor' and restored.progression.level >= 20
assert restored.progression.total == state.progression.total
assert all(restored.story.quests[row['id']].cycles == 1 for row in milestones[:6])
work = ROOT / 'work' / 'mondstadt-fresh-route'
work.mkdir(parents=True, exist_ok=True)
(work / 'liyue-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(route=milestones, hunt=hunt, partyWipes=state.returns, savedAndRestored=True,
              scope='New Lv1 save, scripted normal inputs and built-in auto-battle for hunting. Lua clock.')
(ROOT / 'evidence/mondstadt-fresh-route.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
