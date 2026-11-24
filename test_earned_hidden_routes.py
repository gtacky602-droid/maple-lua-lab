"""Walk, fight and report quests in hidden worlds on an earned adventure save."""

from hashlib import sha256
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_bytes())


graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
exits = {n['id']: n['exits'] for n in graph['nodes']}
edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
lua, core = runtime(draft_balance=True)
source = (ROOT / 'work/cap-fresh-route-draft/lv200-save.json').read_bytes()
saved = validate_save(json.loads(source))
assert saved['progression']['level'] == 200 and not saved['story']['discovered']
state = core.restore(lua.table_from(saved, recursive=True), 12)
assert state.active == 1 and not state.auto
walk = TrailWalk(lua, core, state, edges, exits)
atlas_regions = {'hidden-01', 'hidden-02', 'hidden-03'}
trips, reports, battles, locks = [], [], [], []
step_many = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def act(action):
    core.action(state, action)


def frame():
    return core.frame(state, 'sprite', 'legacy')


def save():
    return validate_save(native(core.checkpoint(state)))


def warp(hub):
    assert state.story.visited[hub]
    act('story_fast:' + hub)
    assert state.story.node == hub, (hub, state.storyNotice)


def guide(target):
    act('world_map_focus:' + target)
    view = frame().worldMap
    assert view and view.selected and view.selected.id == target, (state.story.node, target)
    itinerary = native(view.guide)
    act('world_map_close')
    itinerary['stops'] = itinerary['stops'] or []
    return itinerary


def travel(target):
    origin = state.story.node
    plan = guide(target)
    assert plan['status'] in ('ready', 'here'), (origin, target, plan)
    for leg in plan['stops']:
        assert state.story.node == leg['from']
        if (leg['from'], leg['id']) in edges:
            walk.cross(leg['id'], leg.get('gateX'))
        else:
            voyage = state.voyage
            assert voyage and voyage.destination == leg['id']
            step_many(core, state, round((voyage.arrives - state.t) * 60) + 2, walk.idle)
            assert state.story.node == leg['id'] and not state.voyage
    assert state.story.node == target
    trips.append(dict(origin=origin, destination=target, stops=plan['stops']))
    return plan['stops']


def gate_waits(target):
    start = state.story.node
    edge = edges[start, target]
    walk.approach(edge['x'], edge.get('y', 480), target)
    portal = frame().storyNearbyPortal
    assert portal and portal.to == target and not portal.available, (start, target, native(portal))
    act('story_nearby_portal')
    assert state.story.node == start
    locks.append(dict(node=start, target=target, reason=portal.reason))


def inspect(x, y=480, action='story_collect'):
    walk.approach(x, y, action)
    act(action)


def marker(quest, index, repeats=1, confirm=None):
    mark = quests[quest]['itinerary'][index - 1]
    assert mark['node'] == state.story.node
    for _ in range(repeats):
        inspect(mark['x'], mark.get('y', 480))
    if confirm:
        act(confirm)
    assert state.story.quests[quest].count == index, (quest, index, state.storyNotice)


def jump_to(x, y):
    act('jump')
    for _ in range(90):
        actor = walk.actor
        dx = x - actor.x
        core.step(state, 1 / 60, lua.table(left=dx < -4, right=dx > 4, jump=True))
        if actor.ground and abs(actor.x - x) < 8 and abs(actor.y - y) < 2:
            return
    raise AssertionError((state.story.node, x, y, walk.actor.x, walk.actor.y, state.returns))


def report(quest):
    assert state.story.node == quests[quest]['hub']
    before = state.progression.total, state.mora
    act('story_report:' + quest)
    assert state.story.quests[quest].status == 'complete', (quest, state.storyNotice)
    after = state.progression.total, state.mora
    assert after[0] > before[0] and after[1] > before[1]
    act('story_report:' + quest)
    assert after == (state.progression.total, state.mora)
    reports.append(dict(quest=quest, xp=after[0] - before[0], mora=after[1] - before[1]))


def discover(base, parent, clue, group, region, door):
    warp(base)
    travel(parent)
    act('world_map_toggle')
    assert region not in {option.id for option in frame().worldMap.options.values()}
    act('world_map_focus:' + door)
    assert frame().worldMap.selected.id != door
    act('world_map_close')
    assert not state.story.discovered[group]
    act('story_discover:' + group)
    assert not state.story.discovered[group]
    inspect(clue)
    assert state.story.discovered[group]
    assert guide(door)['status'] == 'ready'
    travel(door)


def combat_totals():
    return state.kills, state.progression.killXp, state.returns


def fight(spawn_ids, before=None):
    origin = state.story.node
    before = before or combat_totals()
    ids = set(spawn_ids)
    enemies = [e for e in state.enemies.values() if e.spawnId in ids]
    assert {e.spawnId for e in enemies} == ids
    for enemy in enemies:
        if enemy.hp <= 0:
            continue
        x = max(30, enemy.x - 50)
        walk.approach(x, enemy.y, enemy.spawnId)
        for _ in range(8):
            step_many(core, state, 36, lua.table(attack=True))
            if enemy.hp <= 0:
                break
        assert enemy.hp == 0, (origin, enemy.spawnId, enemy.x, walk.actor.x, walk.actor.dir)
    assert state.story.node == origin and state.returns == before[2]
    assert state.kills - before[0] >= len(ids) and state.progression.killXp > before[1]
    battles.append(dict(node=origin, targets=sorted(ids),
                        kills=state.kills-before[0], xp=state.progression.killXp-before[1]))


def optional_fight(parent, arena):
    travel(arena)
    guard = state.enemies[1]
    assert guard.spawnId.endswith('-guardian')
    fight([guard.spawnId])
    legs = travel(parent)
    assert len(legs) == 1 and '戻る' in legs[0]['hint'], legs


first = 'golden-little-boat'
discover('mond-town', 'mond-road', 1050, 'golden', 'hidden-01', 'golden-mainland-coast')
assert guide('golden-hub')['status'] == 'blocked'
gate_waits('golden-hub')
act('story_accept:' + first)
for i in (1, 2, 3):
    marker(first, i)
assert travel('golden-hub')[-1]['mode'] == 'boat'
for i in (4, 5, 6):
    marker(first, i)
assert travel('golden-mainland-coast')[-1]['mode'] == 'boat'
report(first)
travel('golden-hub')
side = 'golden-trace-shadows'
act('story_accept:' + side)
travel('golden-shadow-lookouts')
for i in (1, 2, 3):
    marker(side, i)
inspect(1290, 392)
assert state.story.quests[side].count == 4
travel('golden-shadow-grotto')
fight(quests[side]['itinerary'][4]['enemies'])
assert state.story.quests[side].count == 5
marker(side, 6)
travel('golden-hub')
marker(side, 7)
report(side)
(ROOT / 'work/earned-golden-atlas-checkpoint.json').write_text(
    json.dumps(save(), ensure_ascii=False) + '\n', encoding='utf8')
for part in ('04', '06', '07'):
    optional_fight('sites-gaa-' + part, 'sites-gaa-' + part + '-side-arena')
travel('mond-town')

first = 'veluriyam-bottle-ticket'
discover('sumeru-hub', 'sumeru-entry', 1050, 'veluriyam', 'hidden-02', 'veluriyam-bottle-yard')
act('story_accept:' + first)
marker(first, 1)
marker(first, 2, 3, 'story_airflow_commit')
travel('veluriyam-hub')
marker(first, 3)
marker(first, 4)
gate_waits('veluriyam-trolley-out')
travel('veluriyam-bottle-yard')
report(first)
travel('veluriyam-hub')
side = 'veluriyam-trolley-lookout'
act('story_accept:' + side)
legs = travel('veluriyam-petal-stop')
assert any('途中下車' in leg.get('hint', '') for leg in legs), legs
gate_waits('veluriyam-petal-lookout')
marker(side, 1)
travel('veluriyam-petal-lookout')
marker(side, 2)
travel('veluriyam-petal-stop')
walk.cross('veluriyam-trolley-back')
travel('veluriyam-hub')
assert state.story.quests[side].count == 3
marker(side, 4)
report(side)
travel('sites-vlm-02')
fight([state.enemies[1].spawnId])
travel('sumeru-hub')

first = 'simulanka-open-page'
discover('fontaine-hub', 'fontaine-hub', 1050, 'simulanka', 'hidden-03', 'simulanka-book-room')
act('story_accept:' + first)
marker(first, 1)
inspect(497)
inspect(497, action='story_paper_confirm')
assert state.story.quests[first].count == 2
walk.approach(623, 480, 'paper bridge')
jump_to(639, 389)
travel('simulanka-hub')
marker(first, 3)
marker(first, 4)
travel('simulanka-book-room')
report(first)
travel('simulanka-hub')
side = 'simulanka-folded-road'
act('story_accept:' + side)
travel('simulanka-fold-valley')
prior = combat_totals()
for x, count in ((235, 2), (398, 2), (556, 3)):
    for _ in range(count):
        inspect(x)
act('story_paper_confirm')
assert state.story.quests[side].count == 1
walk.approach(645, 480, 'paper stairs')
for x, y in ((680, 422), (753, 361), (882, 310)):
    jump_to(x, y)
walk.approach(1261, 310, 'paper bridge far end')
jump_to(1274, 281)
walk.approach(1340, 281, 'paper jump platform')
jump_to(1500, 270)
fight(quests[side]['itinerary'][1]['enemies'], prior)
assert state.story.quests[side].count == 2
travel('simulanka-lantern-perch')
marker(side, 3)
marker(side, 4, 2, 'story_paper_confirm')
travel('simulanka-hub')
marker(side, 5)
report(side)
for part in ('06', '08'):
    optional_fight('sites-sim-' + part, 'sites-sim-' + part + '-side-arena')
travel('fontaine-hub')

restored = core.restore(lua.table_from(save(), recursive=True), 12)
assert restored.story.node == 'fontaine-hub'
assert all(restored.story.discovered[group] for group in ('golden','veluriyam','simulanka'))
assert all(restored.story.quests[entry['quest']].status == 'complete' for entry in reports)
proof = dict(sourceSha256=sha256(source).hexdigest(), level=state.progression.level,
             trips=trips, crossings=len(walk.crossings), reports=reports, battles=battles, locks=locks,
             resumedAt=restored.story.node, returns=state.returns)
(ROOT / 'evidence/earned-hidden-routes-lua.json').write_text(
    json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print('Earned hidden routes:', len(trips), 'atlas itineraries,', len(reports), 'quest reports,',
      len(battles), 'battles and a restored checkpoint.', flush=True)


late = []


def start_late(path, expected, origin):
    global state, walk, trips, battles, locks
    raw = (ROOT / path).read_bytes()
    state = core.restore(lua.table_from(validate_save(json.loads(raw)), recursive=True), 12)
    assert state.progression.level == expected and state.active == 1 and not state.auto
    walk = TrailWalk(lua, core, state, edges, exits)
    trips, battles, locks = [], [], []
    warp(origin)
    result = dict(level=expected, sourceSha256=sha256(raw).hexdigest(), origin=origin,
                  trips=trips, battles=battles, lockedGates=locks)
    late.append(result)
    return result


def check_low_gate(destination, need):
    preview = guide(destination)
    assert preview['status'] == 'blocked' and preview['reason'] == f'必要Lv{need}', preview
    leg = next(stop for stop in preview['stops'] if stop.get('reason'))
    travel(leg['from'])
    gate_waits(leg['id'])
    assert frame().storyNearbyPortal.level == need
    assert not state.story.visited[destination]
    return preview


sky = 'nat-wp-96380'
open_sky = start_late('work/snez-fresh-route-draft/white-pass-save.json', 160, 'natlan-hub')
assert travel(sky)[-1]['mode'] == 'lift'
assert '南東の小島へ上がる昇降機' in travel('natlan-hub')[0]['hint']
open_sky['visitedTarget'] = sky
assert save()['story']['visited'][sky]

port = 'mond-wp-95801'
locked_port = start_late('work/cap-fresh-route-draft/lv165-save.json', 165, 'mond-town')
locked_port['blockedPlan'] = check_low_gate(port, 168)
travel('mond-town')

open_port = start_late('work/cap-fresh-route-draft/lv180-save.json', 180, 'mond-town')
assert any('上段の入口' in leg.get('hint', '') for leg in travel(port))
travel('mond-town')
open_port['visitedTarget'] = port
assert save()['story']['visited'][port]

edge_station = 'sites-nsp-08'
locked_frontier = start_late('work/cap-fresh-route-draft/lv180-save.json', 180, 'nod-town')
locked_frontier['blockedPlan'] = check_low_gate(edge_station, 184)
travel('nod-town')

open_frontier = start_late('work/cap-fresh-route-draft/lv200-save.json', 200, 'nod-town')
assert any('凍った水路へ降りる' in leg.get('hint', '') for leg in travel(edge_station))
fight([state.enemies[1].spawnId])
return_trip = travel('nod-town')
assert '奥の遺構へ戻る' in return_trip[0]['hint'], return_trip
assert any('境界の観測所へ上がる' in leg.get('hint', '') for leg in return_trip)
open_frontier['visitedTarget'] = edge_station
assert save()['story']['visited'][edge_station]

(ROOT / 'evidence/earned-late-atlas-routes-lua.json').write_text(
    json.dumps({'routes': late}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print('Earned late routes:', len(late), 'sessions, three destinations and two level gates.', flush=True)
