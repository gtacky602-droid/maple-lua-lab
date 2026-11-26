"""Continue the untouched Mondstadt–Liyue checkpoint through Inazuma."""

import json
import subprocess
import sys

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from tools.quest_guide_test import GuideChecks

guides = GuideChecks('inazuma')


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


work = ROOT / 'work' / 'inazuma-fresh-route'
work.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(ROOT / 'test_liyue_fresh_route.py')], stdout=subprocess.DEVNULL, check=True)
checkpoint = validate_save(read('work/liyue-fresh-route/inazuma-save.json'))
assert checkpoint['story']['node'] == 'inazuma-port' and checkpoint['progression']['level'] == 40

nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
lua, core = runtime()
state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
trail = TrailWalk(lua, core, state, edges, exits)
attack = {dx: lua.table_from(dict(left=dx < 0, right=dx > 0, attack=True)) for dx in (-1, 0, 1)}
port, road, town = 'inazuma-port', 'inazuma-road', 'inazuma-town'
clearing, shore = 'inazuma-lantern-clearing', 'inazuma-forest-shore'
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


def collect(x, y=480):
    near(x, y)
    act('story_collect')


def fight(x, finished):
    for _ in range(900):
        actor = trail.actor
        if abs(actor.x - x) < 8 and finished():
            return
        dx = 0 if abs(actor.x - x) < 8 else (1 if actor.x < x else -1)
        step(attack[dx])
    raise AssertionError((state.story.node, x, state.kills, trail.actor.hp))


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


def cross_all(*stages):
    for stage in stages:
        trail.cross(stage)


lantern = 'inazuma-moving-lantern'
act('world_map_toggle')
act('world_map_layer:hunt')
act('world_map_select:inazuma-outer-shore')
assert frame().worldMap.guide.reason == '必要Lv52'
act('world_map_close')

q = accept(lantern)
near(430)
for _ in range(60):
    step()
near(410)
assert frame().storyNearbyLantern.id == 'ayaka-lantern'
act('story_collect')
cross_all(road, town, 'inazuma-lantern-trail')
collect(305)
collect(670, 391)
collect(1100)
assert q.count == 4
trail.cross(clearing)
near(680)
assert frame().storyNearbyLantern.id == 'leaf-lantern'
act('story_collect')
assert frame().storyNearbyLantern.id == 'tanuki-invitation'
act('story_collect')
cross_all(town, road, port)
report(lantern)

(work/'forest-earned-start.json').write_text(json.dumps(validate_save(native(core.checkpoint(state)))),encoding='utf8')
maze = 'inazuma-torii-maze'
q = accept(maze)
prints, statues, water, thicket = ('inazuma-torii-footprints', 'inazuma-torii-statues',
                                   'inazuma-torii-reflections', 'inazuma-torii-thicket')
cross_all(road, town, clearing, prints)
near(1240)
act('story_nearby_portal')
guides.expect(frame(),maze,absent=True)
assert state.story.node == prints and q.forest.looped
forest_art=read('content/worksite-props.json')['forest']
def check_room_art():
    near(670)
    node=state.story.node
    scene=forest_art['rooms'][node]['search']
    moving=any(len(p)>3 for p in scene)
    checked=set()
    for _ in range(150):
        f=frame()
        beat=f.storyForest.beat if moving else 0
        if beat not in checked:
            expected=[]
            for name,x,y,*motion in scene:
                offset=forest_art['offsets'][beat] if motion else 0
                expected.extend((x-f.camera+dx,y+offset+dy,w,h,color)
                                for dx,dy,w,h,color in forest_art['motifs'][name])
            drawn=[(r.x,r.y,r.w,r.h,r.color) for r in f.draws.values() if r.kind=='rect']
            assert any(drawn[i:i+len(expected)]==expected for i in range(len(drawn))), (node,beat)
            checked.add(beat)
            if len(checked)==(len(forest_art['offsets']) if moving else 1):
                return dict(node=node,phases=len(checked),rectangles=len(expected))
        step()
    raise AssertionError((node,checked))

def verify_torii_names(s, solved):
    rooms = nodes[prints]['name']
    expected = {id: rooms + ('（' + clue + '）' if index < solved else '')
                for index, (id, clue) in enumerate([(prints, '岩のそば'), (statues, '石像'), (water, '水たまり')])}
    core.action(s, 'world_map_focus:' + prints)
    f = core.frame(s)
    points = {p.id: p.name for p in f.worldMap.points.values()}
    names = {n.id: n.name for n in f.storyGraph.nodes.values()}
    for id, name in expected.items():
        assert names[id] == points[id] == name
    core.action(s, 'world_map_close')


verify_torii_names(state, 0)
forest_clues=[]
for count, x, stage in [(1, 485, statues), (2, 855, water), (3, 485, thicket)]:
    art_check=check_room_art()
    collect(245)
    assert q.count==count-1 and '綾華' in frame().storyForest.message
    collect(855 if x==485 else 485)
    assert q.count==count-1 and 'もう一方' in frame().storyForest.message
    forest_clues.append(dict(**art_check,hintAndRetry=True))
    collect(x)
    assert q.count == count
    verify_torii_names(state, count)
    trail.cross(stage)
for i, x in enumerate((420, 785, 1130), 1):
    guides.expect(frame(),maze,spawns=['inazuma-thicket-'+str(n) for n in range(i,4)])
    fight(x, lambda: q.forest.defeated['inazuma-thicket-' + str(i)])
assert q.count == 4
guides.expect(frame(),maze,name='化け狸',xy=(1280,480))
collect(1280)
cross_all(shore, town, road, port)
report(maze)
guides.expect(frame(),maze,absent=True)
assert q.status=='complete' and q.cycles==1
verify_torii_names(core.restore(core.checkpoint(state),12), 3)
(ROOT/'evidence/torii-earned-route.json').write_text(json.dumps(dict(
    startLevel=checkpoint['progression']['level'],rooms=forest_clues,coast=shore,report=milestones[-1]),
    ensure_ascii=False,indent=2)+'\n',encoding='utf8')
guides.save()

contest, cave, cape = 'inazuma-lantern-contest', 'inazuma-sea-cave', 'inazuma-shiomi-cape'
(work/'lantern-earned-start.json').write_text(json.dumps(validate_save(native(core.checkpoint(state)))),encoding='utf8')
art=read('content/worksite-props.json')['contest']
def check_lantern_art(stage):
    from math import floor
    f=frame()
    assert f.storyContest.stage==stage
    shapes=[art['curtain'],*art['stages'][stage-1]['placements']]
    expected=[(floor(x-f.camera+dx*k),floor(y+dy*k),w*k,h*k,color)
              for name,x,y,k in shapes for dx,dy,w,h,color in art['motifs'][name]]
    draws=[(r.x,r.y,r.w,r.h,r.color) for r in f.draws.values() if r.kind=='rect']
    assert any(draws[i:i+len(expected)]==expected for i in range(len(draws))),stage
    return dict(stage=stage,rectangles=len(expected))
q = accept(contest)
cross_all(road, town, shore, cave)
collect(440)
contest_art=[check_lantern_art(1)]
fight(716, lambda: frame().storyContest.stage == 2)
contest_art.append(check_lantern_art(2))
for decoy in (560,760):
    collect(decoy)
    assert q.count==2 and '紙吹雪' in frame().storyContest.message
collect(960)
contest_art.append(check_lantern_art(3))
assert frame().storyContest.stage == 3
before = state.progression.questXp
fight(716, lambda: frame().storyContest.stage == 4)
assert state.progression.questXp - before == 335632
trail.cross(cape)
collect(675)
cross_all(cave, shore, town, road, port)
report(contest)
(ROOT/'evidence/earned-lantern-contest.json').write_text(json.dumps(dict(
    receivedAt=port,phases=contest_art,wrongChoices=2,cape=cape,report=milestones[-1]
),ensure_ascii=False,indent=2)+'\n',encoding='utf8')

ayaka = 'ayaka-join'
q = accept(ayaka)
cross_all(road, town)
collect(250)
collect(570, 340)
collect(1090)
collect(790)
act('story_sight_mark:rooftops')
assert q.count == 4
cross_all(road, port)
report(ayaka)
assert frame().storyJoined.ayaka

sayu, watchpath = 'ina-sayu-quiet-route', 'ina-sayu-watchpath'
cross_all(road, town)
q = accept(sayu)
collect(346)
near(454)
act('story_nearby_portal')
assert state.story.node == watchpath
collect(472)
collect(1012, 392)
collect(1589)
assert q.count == 4
collect(1943)
wait(lambda: q.count == 5)
trail.cross(town)
collect(1135)
report(sayu)

tea, forks, landing = 'ina-walking-teahouse', 'ina-tea-crossroads', 'ina-tea-landing'
q = accept(tea)
collect(169)
collect(396)
trail.cross(forks)
collect(345)
collect(744, 403)
trail.cross(landing)
collect(284)
near(469)
act('story_tea_card:ruts')
act('story_tea_card:dusk')
act('story_tea_confirm')
assert q.count == 6
wait(lambda: frame().storyTeaCase.parked)
collect(600)
trail.cross(town)
report(tea)

near(1380)
portal = frame().storyNearbyPortal
assert portal.to == 'sumeru-entry' and not portal.available and portal.level == 60
act('story_nearby_portal')
assert state.story.node == town
mark('sumeru-level-gate')

cross_all(road, port)
outer = 'inazuma-outer-shore'
island = 'sites-hunt-18667'
tsurumi = 'tsurumi-coast'
act('world_map_toggle')
act('world_map_layer:hunt')
act('world_map_select:' + island)
assert frame().worldMap.guide.reason == '必要Lv56'
act('world_map_select:' + outer)
atlas = frame().worldMap
assert atlas.selected.huntKind == 'field' and atlas.selected.provisional
assert atlas.guide.status == 'ready' and [stop.id for stop in atlas.guide.stops.values()] == [outer]
act('world_map_close')

sorties = []
recovery_trips = 0


def restock():
    assert min(a.hp for a in state.actors.values()) > 0
    act('story_fast:' + landing)
    assert state.story.node == landing
    near(600)
    for _ in range(2):
        for _ in range(4):
            act('story_collect')
        assert trail.actor.hp == trail.actor.maxhp
        wait(lambda: state.swap == 0)
        act('swap')
    act('story_fast:' + port)
    assert state.story.node == port


for stage, threshold, enemy_level, population in [(outer, 56, 52, 42), (island, 60, 56, 48)]:
    access = (tsurumi, stage) if stage == island else (stage,)
    while state.progression.level < threshold:
        if min(a.hp for a in state.actors.values()) < 100:
            restock()
            recovery_trips += 1
        cross_all(*access)
        assert len(state.enemies) == population
        assert all(e.expRole == 'normal' and e.level == enemy_level for e in state.enemies.values())
        start_kills, start_xp, start_time = state.kills, state.progression.killXp, state.t
        near(2450 if stage == island else 450)
        act('auto')
        wait(lambda: state.progression.level >= threshold or state.t-start_time >= 75
             or min(a.hp for a in state.actors.values()) <= 65, seconds=77)
        act('auto')
        assert state.story.node == stage and state.returns == 0
        kills, xp = state.kills-start_kills, state.progression.killXp-start_xp
        assert kills > 0 and xp == kills * LEVELS[enemy_level-1]['normal_enemy_base_exp']
        sorties.append(dict(stage=stage, kills=kills, xp=xp, seconds=round(state.t-start_time, 2)))
        if stage == island:
            trail.cross(tsurumi)
        trail.cross(port)
    mark('lv' + str(threshold))

entry, hub = 'sumeru-entry', 'sumeru-hub'
cross_all(road, town)
act('world_map_toggle')
act('world_map_region:region-04')
act('world_map_select:sumeru-hub')
guide = frame().worldMap.guide
assert guide.status == 'ready' and [stop.id for stop in guide.stops.values()] == [entry, hub]
assert guide.stops[1].mode == 'boat'
act('world_map_close')

ready = validate_save(native(core.checkpoint(state)))
(work / 'boat-ready-save.json').write_text(json.dumps(ready, ensure_ascii=False) + '\n', encoding='utf8')
near(1380)
xp_before_boat = state.progression.total
act('story_nearby_portal')
assert state.lift and state.lift.boat and state.lift.destination == entry
for boat_ticks in range(1, 361):
    step()
    if state.story.node == entry:
        break
assert state.story.node == entry and boat_ticks == 288
assert state.progression.total == xp_before_boat
boat_seconds = boat_ticks / 60
trail.cross(hub)
mark(hub)
assert state.progression.level >= 60 and state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == hub and restored.progression.total == state.progression.total
complete = [row['id'] for row in milestones if row['id'] in saved['story']['quests']]
assert len(complete) == 6 and all(restored.story.quests[id].cycles == 1 for id in complete)
return_trip = TrailWalk(lua, core, restored, edges, exits)
return_trip.cross(entry)
return_trip.cross(town)

(work / 'sumeru-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(route=milestones, hunting=sorties, recoveryTrips=recovery_trips, boatSeconds=boat_seconds,
              boatRoundTrip=True, partyWipes=state.returns, savedAndRestored=True,
              scope='Continuation of the new Lv1 adventure. Scripted Lua inputs and auto-battle for hunting.')
(ROOT / 'evidence/inazuma-fresh-route.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(result)
