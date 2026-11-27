"""Continue the unmodified Mondstadt checkpoint through Liyue with ordinary actions."""

from hashlib import sha256
import json
import subprocess
import sys

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from tools.quest_guide_test import GuideChecks

guides = GuideChecks('liyue')


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


work = ROOT / 'work' / 'liyue-fresh-route'
work.mkdir(parents=True, exist_ok=True)
# Always derive the starting save so a previous test cannot hide a change in the route.
subprocess.run([sys.executable, str(ROOT / 'test_mondstadt_fresh_route.py')], stdout=subprocess.DEVNULL, check=True)
source_bytes = (ROOT/'work/mondstadt-fresh-route/liyue-save.json').read_bytes()
checkpoint = validate_save(json.loads(source_bytes))
assert checkpoint['story']['node'] == 'liyue-harbor' and checkpoint['progression']['level'] == 20

nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
lua, core = runtime()
state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
trail = TrailWalk(lua, core, state, edges, exits)
attack = {dx: lua.table_from(dict(left=dx < 0, right=dx > 0, attack=True)) for dx in (-1, 0, 1)}
port, field = 'liyue-harbor', 'liyue-field'
post, storage = 'liyue-quarry-post', 'liyue-quarry-storage'
milestones = []


def act(key):
    core.action(state, key)


def frame():
    return core.frame(state)


def step(buttons=trail.idle):
    core.step(state, 1 / 60, buttons)


def wait(predicate, seconds=12, buttons=trail.idle):
    for _ in range(round(seconds * 60) + 1):
        if predicate():
            return
        step(buttons)
    raise AssertionError((state.story.node, trail.actor.x, trail.actor.y, state.kills, state.storyNotice))


def near(x, y=480):
    trail.approach(x, y, 'quest objective')


def jump(y, x):
    act('jump')
    for _ in range(120):
        actor = trail.actor
        if actor.y == y and actor.ground:
            return
        step(lua.table_from(dict(jump=True, right=actor.x < x-3, left=actor.x > x+3)))
    raise AssertionError((state.story.node, x, y, trail.actor.x, trail.actor.y))


def fight(x, finished):
    for _ in range(780):
        actor = trail.actor
        if abs(actor.x - x) < 8 and finished():
            return
        dx = 0 if abs(actor.x - x) < 8 else (1 if actor.x < x else -1)
        step(attack[dx])
    raise AssertionError((state.story.node, x, state.kills, trail.actor.hp))


def defeat(spawn):
    wait(lambda: not any(e.hp > 0 and e.spawnId == spawn for e in state.enemies.values()), buttons=attack[0])


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


act('world_map_toggle')
act('world_map_layer:hunt')
act('world_map_select:liyue-quarry-scree')
assert frame().worldMap.guide.reason == '必要Lv34'
act('world_map_close')

delivery = 'liyue-market-delivery'
q = accept(delivery)
(work/'earned-delivery-start.json').write_text(json.dumps(validate_save(native(core.checkpoint(state)))),encoding='utf8')
for item, x in [('pot', 245), ('vessel', 615)]:
    near(x)
    guides.expect(frame(),delivery,point=item,xy=(x,480))
    act(f'story_deliver:{delivery}:{item}')
    assert q.delivery.delivered[item]
trail.cross('liyue-loading-yard')
guides.expect(frame(),delivery,spawns=['liyue-loading-yard-1'])
fight(432, lambda: q.delivery.guardCleared)
guides.expect(frame(),delivery,point='wheel',xy=(735,380))
# Reopen the earned save between the defeat and the pickup.
mid_delivery = validate_save(native(core.checkpoint(state)))
(work/'earned-wheel-recovery.json').write_text(json.dumps(mid_delivery),encoding='utf8')
state = core.restore(lua.table_from(mid_delivery,recursive=True),12)
trail.state = state
q = state.story.quests[delivery]
assert q.delivery.guardCleared and not q.delivery.recovered
trail.cross('liyue-loading-yard')
guides.expect(frame(),delivery,point='wheel',xy=(735,380))
near(735, 380)
assert frame().storyNearbyParcel.name == '車輪の荷箱'
act('story_collect')
trail.cross(port)
near(1050)
act(f'story_deliver:{delivery}:wheel')
report(delivery)

caravan = 'liyue-caravan-search'
q = accept(caravan)
trail.cross('liyue-river-trail')
near(680)
assert frame().storyNearbyClue.id == 'cart-ruts'
act('story_collect')
trail.cross(post)
near(385)
guides.expect(frame(),caravan,point='caravan')
assert frame().storyNearbyClue.id == 'caravan'
act('story_collect')
guides.expect(frame(),caravan,spawns=['liyue-quarry-post-1'])
fight(870, lambda: q.count == 3)
trail.cross(port)
report(caravan)
(work/'earned-worksites-start.json').write_text(json.dumps(validate_save(native(core.checkpoint(state)))),encoding='utf8')

market = 'liyue-market-opening'
q = accept(market)
trail.cross(post)
near(1370)
jump(389, 1380)
jump(305, 1420)
trail.cross(storage)
near(380)
guides.expect(frame(),market,point='cart-latch')
jump(397, 400)
near(490, 397)
jump(312, 520)
near(658, 312)
assert frame().storyNearbyClue.id == 'cart-latch'
act('story_collect')
guides.expect(frame(),market,absent=True)
wait(lambda: q.count == 1)
guides.expect(frame(),market,spawns=['liyue-quarry-storage-keeper'])
near(1025)
jump(411, 1025)
near(1148, 411)
jump(397, 1210)
act('drop')
wait(lambda: trail.actor.y == 480 and trail.actor.ground)
before = state.progression.questXp
fight(1250, lambda: q.count == 2)
assert state.progression.questXp - before == 73057
near(1030)
guides.expect(frame(),market,point='market-switch')
assert frame().storyNearbyClue.id == 'market-switch'
act('story_collect')
wait(lambda: q.count == 3)
trail.cross(port)
report(market)

crew = 'beidou-join'
q = accept(crew)
trail.cross('liyue-crux-wharf')
guides.expect(frame(),crew,spawns=['liyue-crux-pier'])
near(315)
defeat('liyue-crux-pier')
guides.expect(frame(),crew,point='pier')
act('story_collect')
near(975, 382)
defeat('liyue-crux-ledge')
act('story_collect')
act('drop')
wait(lambda: trail.actor.y == 480 and trail.actor.ground)
near(690)
defeat('liyue-crux-rocks')
act('story_collect')
guides.expect(frame(),crew,spawns=['liyue-crux-return'])
fight(260, lambda: q.count == 4)
trail.cross(port)
report(crew)
assert frame().storyJoined.beidou

book = 'liyue-book-rescue'
q = accept(book)
trail.cross(field)
near(530)
guides.expect(frame(),book,point='proof-sheet')
assert frame().storyNearbyBook.id == 'proof-sheet'
act('story_collect')
near(820, 350)
guides.expect(frame(),book,absent=True)
assert frame().storyNearbyBook.id == 'forked-tree'
act('story_collect')
near(1120, 390)
assert frame().storyNearbyBook.id == 'stone-arch'
act('story_collect')
trail.cross('liyue-book-camp')
guides.expect(frame(),book,spawns=['liyue-book-scout-1','liyue-book-scout-2','liyue-book-scout-3'])
fight(415, lambda: q.book.defeated['liyue-book-scout-1'])
fight(1030, lambda: q.book.defeated['liyue-book-scout-3'])
near(840, 392)
defeat('liyue-book-scout-2')
near(1250)
guides.expect(frame(),book,point='print-crate')
assert frame().storyNearbyBook.id == 'print-crate'
act('story_collect')
trail.cross(field)
trail.cross(port)
report(book)
guides.expect(frame(),book,absent=True)
guides.save()

shortcut = 'liyue-hauling-shortcut'
q = accept(shortcut)
worksites = GuideChecks('liyue-market-worksites')
near(558, 350)
near(570, 350)
jump(300, 780)
near(855, 300)
worksites.expect(frame(),shortcut,point='roof')
act('story_collect')
near(1300)
worksites.expect(frame(),shortcut,point='detour')
act('story_collect')
trail.cross(post)
near(1535)
worksites.expect(frame(),shortcut,point='old-lift')
act('story_collect')
trail.cross(port)
assert q.count == 3
near(875)
worksites.expect(frame(),shortcut,point='work-plan')
(work/'earned-worksite-plan.json').write_text(json.dumps(validate_save(native(core.checkpoint(state)))),encoding='utf8')
act('story_collect')
act('story_construction_plan:' + shortcut + ':ground')
assert q.count == 4 and q.construction.plan == 'ground'
near(170)
worksites.expect(frame(),shortcut,xy=(170,480))
act('story_collect')
assert frame().storyHunts[shortcut].action=='Gで資材を渡す'
act('story_collect')
report(shortcut)
trail.cross('liyue-cart-road')
cart = frame().storyHaulCart
assert cart and cart.route=='ground' and cart.y==480
trail.cross(field)
trail.cross(port)

near(720)
portal = frame().storyNearbyPortal
assert portal.to == 'liyue-ferry' and not portal.available and portal.level == 40
act('story_nearby_portal')
assert state.story.node == port
mark('inazuma-level-gate')

meal = 'liyue-harbor-meal'
q = accept(meal)
trail.cross('liyue-river-trail')
near(365)
worksites.expect(frame(),meal,point='fish')
act('story_collect')
trail.cross(port)
trail.cross('liyue-cliff-planks')
near(510)
jump(395, 510)
jump(305, 510)
near(560, 305)
worksites.expect(frame(),meal,point='herb')
act('story_collect')
trail.cross(port)
trail.cross(field)
near(270)
worksites.expect(frame(),meal,point='mushroom')
act('story_collect')
trail.cross(port)
near(925)
worksites.expect(frame(),meal,name='香菱の屋台',xy=(925,480))
act('story_cook:' + meal + ':herbal')
report(meal)
worksites.save()

wharf, scree, upper = 'liyue-wp-104', 'liyue-quarry-scree', 'sites-hunt-7218'
act('world_map_toggle')
act('world_map_layer:hunt')
act('world_map_select:' + upper)
view = frame().worldMap
assert view.guide.status == 'blocked' and view.guide.reason == '必要Lv38'
act('world_map_select:' + scree)
view = frame().worldMap
assert view.selected.huntKind == 'field' and view.selected.level == 34 and view.selected.provisional
assert view.guide.status == 'ready' and [stop.id for stop in view.guide.stops.values()] == [wharf, scree]
act('world_map_close')

sorties = []
meals_bought = 0
meals_eaten = 0


def resupply():
    global meals_bought, meals_eaten
    assert state.story.node == port and min(actor.hp for actor in state.actors.values()) > 0
    near(925)
    progress = state.story.quests[meal].cooking
    for _ in range(2):
        for _ in range(4):
            if trail.actor.hp == trail.actor.maxhp:
                break
            if not progress.meals:
                act('story_buy_meal:' + meal)
                assert progress.meals == 1
                meals_bought += 1
            count, hp = progress.meals, trail.actor.hp
            act('story_eat_meal:' + meal)
            assert progress.meals == count - 1 and trail.actor.hp > hp
            meals_eaten += 1
        assert trail.actor.hp == trail.actor.maxhp
        wait(lambda: state.swap == 0)
        act('swap')


for stage, threshold in [(scree, 38), (upper, 40)]:
    while state.progression.level < threshold:
        resupply()
        trail.cross(wharf)
        trail.cross(stage)
        population = len(state.enemies)
        assert population == (36 if stage == scree else 48)
        assert all(e.expRole == 'normal' for e in state.enemies.values())
        old_kills, old_exp, old_time = state.kills, state.progression.killXp, state.t
        near(455)
        act('auto')
        wait(lambda: state.progression.level >= threshold or state.t - old_time >= 75
             or min(a.hp for a in state.actors.values()) <= 65, seconds=76)
        act('auto')
        assert not state.auto and state.story.node == stage and state.returns == 0
        kills, exp = state.kills - old_kills, state.progression.killXp - old_exp
        assert kills > 0 and exp > 0
        sorties.append(dict(stage=stage, kills=kills, xp=exp, seconds=round(state.t-old_time, 2)))
        trail.cross(wharf)
        trail.cross(port)
    mark('lv' + str(threshold))

act('world_map_toggle')
act('world_map_region:region-03')
act('world_map_select:inazuma-port')
itinerary = frame().worldMap.guide
assert itinerary.status == 'ready'
assert [stop.id for stop in itinerary.stops.values()] == ['liyue-ferry', 'inazuma-port']
assert itinerary.stops[2].hint == '出航から30秒で着岸'
act('world_map_close')

(work / 'ferry-ready-save.json').write_text(
    json.dumps(validate_save(native(core.checkpoint(state))), ensure_ascii=False) + '\n', encoding='utf8')
trail.cross('liyue-ferry')
departed = state.t
assert state.voyage.kind == 'ferry' and state.voyage.destination == 'inazuma-port'
near(900)
portal = frame().storyNearbyPortal
assert portal.to == 'inazuma-port' and not portal.available and portal.reason == '到着待ち'
act('story_nearby_portal')
assert state.story.node == 'liyue-ferry'
at_sea = validate_save(native(core.checkpoint(state)))
resumed_at_port = core.restore(lua.table_from(at_sea, recursive=True), 12)
assert resumed_at_port.story.node == port and not resumed_at_port.voyage
assert resumed_at_port.progression.total == state.progression.total
wait(lambda: state.story.node == 'inazuma-port', seconds=31)
travel_seconds = round(state.t-departed, 2)
assert travel_seconds == 30
mark('inazuma-port')
assert state.progression.level >= 40 and state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == 'inazuma-port' and restored.progression.total == state.progression.total
quests = [row['id'] for row in milestones if row['id'] in saved['story']['quests']]
assert len(quests) == 7 and all(restored.story.quests[id].cycles == 1 for id in quests)
(work / 'inazuma-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(sourceSha256=sha256(source_bytes).hexdigest(), route=milestones, hunting=sorties, mealsBought=meals_bought, mealsEaten=meals_eaten,
              ferrySeconds=travel_seconds, partyWipes=state.returns, savedAndRestored=True,
              scope='Continuation of the new Mondstadt adventure. Scripted Lua inputs and auto-battle for hunting.')
(ROOT / 'evidence/liyue-fresh-route.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
