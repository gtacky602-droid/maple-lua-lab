"""Play three optional encounters and capture the two quest entrances at each milestone."""
import json
from itertools import permutations
import sys

from runtime import native
from test_earned_branch_quests import Journey, ROOT, graph, quests

trip = Journey('lv165-save.json')
assert trip.state.progression.level == 165
hub = 'natlan-hub'
trip.warp(hub)
key_quest, crystal_quest = 'natlan-rainbow-cave-keys', 'natlan-toyac-electro-crystals'
cave, shore = 'toyac-rainbow-key-cave', 'toyac-electro-crystal-shore'
sappho, balachko, cocijo = 'tepeakak-sappho-bank', 'toyac-balachko-inner-cave', 'toyac-cocijo-stone-ring'
nodes = {n['id']: n for n in graph['nodes']}
roster = json.loads((ROOT/'content/field-boss-spawns.json').read_bytes())['fieldBosses']
previews, clears = {}, {}

def capture(label, focus, ids, walk=trip):
    node = walk.state.story.node
    groups = {}
    # Read two viewports of the same Lua frame. Overlapping props must agree in world coordinates.
    old_camera, old_capture = walk.state.camera, walk.state.captureQuestProps
    try:
        walk.state.captureQuestProps = True
        for camera in (0, nodes[node]['width'] - 960):
            walk.state.camera = camera
            visible = {}
            for draw in walk.frame().draws.values():
                if draw.questProp is None:
                    continue
                part = native(draw)
                prop = str(part.pop('questProp'))
                part['x'] += camera
                visible.setdefault(prop, []).append(part)
            for prop, marks in visible.items():
                assert groups.setdefault(prop, marks) == marks
    finally:
        walk.state.camera, walk.state.captureQuestProps = old_camera, old_capture
    assert set(groups) == {str(id) for id in ids}, (node,label,groups.keys(),ids)
    entry = previews.setdefault(node, dict(props={}, stages=[]))
    for prop, marks in groups.items():
        assert entry['props'].setdefault(prop, marks) == marks
    state = dict(label=label, focusX=focus, visible=list(groups))
    if state not in entry['stages']:
        entry['stages'].append(state)

def clear(node):
    trip.travel(node)
    boss = next(b['id'] for b in roster if b['node'] == node)
    slot = trip.state.fieldSlots[boss]
    previous = trip.state.endgame.bosses[boss]
    count = previous.clears if previous else 0
    if node == sappho:
        trip.tick(90)
        assert slot.phase == 'available' and slot.enemy.hp == slot.enemy.maxhp
    trip.fight([slot.enemy], trip.totals())
    assert slot.phase == 'cleared' and trip.state.endgame.bosses[boss].clears == count + 1
    clears[boss] = count + 1
    trip.travel(nodes[node]['exits'][0]['to'])
    trip.warp(hub)

clear(sappho)
for quest in (key_quest, crystal_quest):
    assert trip.state.story.quests[quest] is None
    trip.act('story_accept:' + quest)
trip.travel(cave)
trip.confirm_lock(balachko, '鍵を2本')
capture('一本目の鍵を取る前', 460, ['cage',balachko])
trip.mark(key_quest, 2)
capture('一本目を入手・次は上段の鍵', 855, ['shelf',balachko])
trip.restore()
trip.travel(cave)
assert trip.state.story.quests[key_quest].count == 2
trip.mark(key_quest, 3)
capture('二本の鍵を入手・格子は閉鎖中', 1400, [balachko])
trip.mark(key_quest, 4)
capture('解錠後', 1400, [])
clear(balachko)
trip.report(key_quest)

trip.travel(shore)
trip.confirm_lock(cocijo, '電気水晶')
points = nodes[shore]['breakTargets']
ids = [p['entity'] for p in points]
directions = ['左','中央','右']

def capture_crystals(walk, remaining):
    focus = next((p['x'] for p in points if p['entity'] in remaining), nodes[shore]['exits'][-1]['x'])
    if len(remaining) == 3:
        label, focus = '水晶が3つ残っている', points[1]['x']
    elif remaining:
        label = '残っている水晶：'+'・'.join(d for d,id in zip(directions,ids) if id in remaining)
    else:
        label = 'すべて破壊・石広場へ入場可能'
    capture(label, focus, remaining, walk)

def break_crystal(walk, point):
    target = next(e for e in walk.state.enemies.values() if e.id == point['entity'])
    walk.approach(target.x-40, target.y, crystal_quest)
    walk.tick(1, walk.inputs['right'])
    before = walk.state.kills, walk.state.progression.killXp
    for _ in range(360):
        if target.hp == 0:
            break
        walk.act('skill1')
        walk.tick(1)
    assert target.hp == 0 and before == (walk.state.kills,walk.state.progression.killXp)

trip.act('swap')
assert trip.state.active == 2
shore_save = trip.snapshot()
orders = []
for order in permutations(range(len(points))):
    if order == (0,1,2):
        walk = trip
    else:
        walk = Journey('lv165-save.json')
        walk.state = walk.core.restore(walk.lua.table_from(shore_save,recursive=True),12)
        walk.travel(shore)
    remaining = ids.copy()
    capture_crystals(walk,remaining)
    for i in order:
        break_crystal(walk,points[i])
        remaining.remove(ids[i])
        capture_crystals(walk,remaining)
        assert walk.guide(cocijo)['status'] == ('blocked' if remaining else 'ready')
        if len(remaining) == 2 and walk is trip:
            walk.restore()
            walk.travel(shore)
            assert not any(e.id == ids[i] and e.hp > 0 for e in walk.state.enemies.values())
    orders.append([points[i]['id'] for i in order])
assert len(previews[shore]['stages']) == 8
previews[shore]['stages'].sort(key=lambda stage:(-len(stage['visible']),stage['focusX'],stage['label']))
trip.act('swap')
clear(cocijo)
trip.report(crystal_quest)
trip.restore()
assert all(trip.state.endgame.bosses[b].clears == count for b,count in clears.items())
assert all(trip.state.story.quests[q].status == 'complete' for q in (key_quest,crystal_quest))
path = ROOT/'content/toyac-quest-previews.json'
if '--build-preview' in sys.argv:
    path.write_text(json.dumps(previews, ensure_ascii=False, indent=2)+'\n','utf8')
else:
    assert json.loads(path.read_bytes()) == previews
proof = trip.proof() | dict(levelAtStart=165, draftBalance=True, clearsAfterReload=clears,
                           crystalOrders=orders, partiallyCollectedAfterReload=[key_quest,crystal_quest])
(ROOT/'evidence/earned-toyac-legends.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
print('Three legend clears, two quests, two mid-quest reloads and twelve prop views verified.')
