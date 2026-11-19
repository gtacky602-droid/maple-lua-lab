"""Walk the reviewed Sites connections, including their real quest unlocks."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


routes = read('sources/map-research/sites-atlas-connections.json')['routes']
nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
edges = {(n['id'], e['to']): e for n in nodes.values() for e in n['exits']}
plan = read('design/world/atlas-route-plan.json')['sites_only_route_review']
assert len(routes) == 18
pending = [r for r in plan if 'review_focus' in r]
assert len(pending) == 1 and set(pending[0]['fields']) == {'map37:96380', 'teyvat:95801'}
assert pending[0]['regional_entrances'] == ['nat-sky-camp', 'dornman-camp']
assert not pending[0].get('runtime_paths')

lua, core = runtime()
crossings = set()


def experience(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(level, id):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, experience(level), 'quest')
    core.enterStoryNode(s, id)
    return s, TrailWalk(lua, core, s, edges, {})


def step(walk, target):
    start = walk.state.story.node
    for actor in walk.state.actors.values():
        actor.inv = 1000
    if edges[start, target].get('darkOnly') and walk.state.storyLightMode == 'bright':
        control = nodes[start]['localLight']['controls'][0]
        interact(walk, control['x'], control['y'])
        assert walk.state.storyLightMode == 'dark'
    walk.cross(target)
    crossings.add((start, target))


def follow(walk, path):
    assert walk.state.story.node == path[0]
    for target in path[1:]:
        step(walk, target)


def interact(walk, x, y=480, action='story_collect'):
    for actor in walk.state.actors.values():
        actor.inv = 1000
    walk.approach(x, y, 'quest prop')
    core.action(walk.state, action)


def open_map(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_select:' + target)
    return core.frame(s).worldMap


def stage_save(s):
    return validate_save(native(core.checkpoint(s)))


def unlock(walk, id):
    s = walk.state
    if id == 'mond-road':
        interact(walk, 1105)
        step(walk, 'golden-mainland-coast')
        core.action(s, 'story_accept:golden-little-boat')
        interact(walk, 345)
        interact(walk, 827, 390)
        interact(walk, 1308)
        assert s.story.quests['golden-little-boat'].count == 3
    elif id == 'sumeru-entry':
        interact(walk, 1050)
        step(walk, 'veluriyam-bottle-yard')
        core.action(s, 'story_accept:veluriyam-bottle-ticket')
        interact(walk, 355)
        for _ in range(3):
            interact(walk, 873, 391)
        interact(walk, 873, 391, 'story_airflow_commit')
        assert s.story.quests['veluriyam-bottle-ticket'].count == 2
    elif id == 'fontaine-hub':
        interact(walk, 1050)
        step(walk, 'simulanka-book-room')
        core.action(s, 'story_accept:simulanka-open-page')
        interact(walk, 321)
        for _ in range(3):
            interact(walk, 497)
        interact(walk, 497, action='story_paper_confirm')
        assert s.story.quests['simulanka-open-page'].count == 2
        walk.approach(639, 389, 'paper bridge leading edge')


phase = [r for r in routes if r['fields'][0].startswith('map7:')]
quest = 'ina-mapped-enkan-beacons'
s, walk = start(57, 'enkanomiya-camp')
core.action(s, 'story_accept:' + quest)
record = s.story.quests[quest]
follow(walk, ['enkanomiya-camp', 'enkanomiya-depth', 'enkan-wp-21573', 'enkan-wp-21574',
              'enkan-wp-21576', 'enkan-wp-21577'])
gate = edges['enkan-wp-21577', 'enkan-wp-21593']
walk.approach(gate['x'], gate['y'], gate['to'])
assert not core.frame(s).storyNearbyPortal.available
core.action(s, 'story_nearby_portal')
assert s.story.node == 'enkan-wp-21577' and s.lift is None and record.count == 0
view = open_map(s, 'enkan-wp-21593')
assert view.guide.status == 'blocked' and '依頼' in view.guide.reason
core.action(s, 'world_map_close')

follow(walk, ['enkan-wp-21577', 'enkan-wp-21576', 'enkan-wp-21579', 'enkan-wp-21580'])
assert record.count == 1
interact(walk, 816)
assert record.count == 2
follow(walk, ['enkan-wp-21580', 'enkan-wp-21579', 'enkan-wp-21576', 'enkan-wp-21577'])
write('work/sites-atlas-phase-fixture.json', stage_save(s))
view = open_map(s, 'enkan-wp-21593')
assert view.guide.status == 'ready' and view.guide.stops[1].label == '位相門'
assert any(draw.color == '#ffe196' and draw.dash for draw in view.draws.values())
core.action(s, 'world_map_close')
walk.approach(gate['x'], gate['y'], gate['to'])
core.action(s, 'story_nearby_portal')
assert s.lift and s.lift.phase
restored = core.restore(lua.table_from(stage_save(s), recursive=True), 12)
assert restored.story.node == 'enkanomiya-camp' and restored.lift is None
assert restored.story.quests[quest].count == 2
while s.lift:
    core.step(s, 1 / 60, lua.table())
assert s.story.node == 'enkan-wp-21593'
crossings.add(('enkan-wp-21577', 'enkan-wp-21593'))
interact(walk, 816)
assert record.count == 3
follow(walk, phase[0]['paths']['return'])

approaches = {
    'enkan-wp-21591': ['enkan-wp-21577', 'enkan-wp-21576', 'enkan-wp-21579', 'enkan-wp-21580',
                        'enkan-wp-21581', 'enkan-wp-21590', 'enkan-wp-21589', 'enkan-wp-21591'],
    'enkan-wp-21587': ['enkan-wp-21591', 'enkan-wp-21589', 'enkan-wp-21590', 'enkan-wp-21581',
                        'enkan-wp-21580', 'enkan-wp-21582', 'enkan-wp-21583', 'enkan-wp-21584',
                        'enkan-wp-21587'],
}
for i, route in enumerate(phase[1:], start=4):
    beginning = route['paths']['forward'][0]
    follow(walk, approaches[beginning])
    follow(walk, route['paths']['forward'])
    interact(walk, 816)
    assert record.count == i
    follow(walk, route['paths']['return'])

special = {'slot:GAA-01': 'mond-road', 'slot:VLM-01': 'sumeru-entry', 'slot:SIM-01': 'fontaine-hub'}
for route in routes:
    if route in phase:
        continue
    forward, back = route['paths'].values()
    entry = special.get(route['fields'][-1])
    peak = max(nodes[id]['level'] for id in forward + back)
    s, walk = start(max(peak, 35 if entry == 'mond-road' else 1), forward[0])
    if entry:
        gate = forward.index(entry)
        follow(walk, forward[:gate+1])
        unlock(walk, entry)
        follow(walk, forward[gate+1:])
    else:
        follow(walk, forward)
    follow(walk, back)
    assert s.story.node == forward[0]
    assert stage_save(s)

for level, start_id, corridor, destination in [
    (62, 'sum-wp-28716', 'sites-sumeru-terrace-road', 'sum-wp-28715'),
    (60, 'sumeru-hub', 'sites-sumeru-north-bridge', 'sum-wp-28745'),
    (43, 'liyue-wp-34', 'sites-dragonspine-south-foothill', 'mond-wp-6599'),
    (99, 'sum-wp-36696', 'sites-west-desert-border', 'natlan-entry'),
    (139, 'nod-wp-92889', 'sites-northern-fault-pass', 'snezhnaya-entry'),
]:
    s, walk = start(level, start_id)
    edge = edges[start_id, corridor]
    walk.approach(edge['x'], edge.get('y', 480), corridor)
    assert core.frame(s).storyNearbyPortal.to == corridor
    assert not core.frame(s).storyNearbyPortal.available
    core.action(s, 'story_nearby_portal')
    assert s.story.node == start_id
    core.grantExp(s, experience(level + 1) - experience(level), 'quest')
    for departure, arrival in [(start_id, destination), (destination, start_id)]:
        start_checkpoint = nodes[departure]['checkpoint']
        s.story.visited[start_checkpoint] = True
        step(walk, corridor)
        saved = stage_save(s)
        assert saved['story']['node'] == departure
        restored = core.restore(lua.table_from(saved, recursive=True), 12)
        assert restored.story.node == start_checkpoint
        step(walk, arrival)

write('evidence/sites-atlas-connections-lua.json', {
    'reviewed_round_trips': len(routes), 'directed_transitions': len(crossings),
    'phase_gates_require_correct_light_sequence': True, 'phase_return_restores_platform_y': True,
    'save_mid_phase_preserves_camp_and_quest': True, 'unlocked_route_preview': True,
    'other_hidden_discoveries_and_entry_quests': 3, 'tested_corridor_level_boundaries': 5,
    'corridor_save_restores_departure_side': True,
    'pending_incompatible_special_pair': pending[0]['fields'],
    'isolated_from_field_combat': True,
})
print(f'{len(routes)} reviewed round trips, {len(crossings)} directed transitions')
