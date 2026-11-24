"""Exercise Fontaine's gates to legends, the Beryl corridor and Icewind Suite."""

import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


story = read('content/story-graph.json')
nodes = {node['id']: node for node in story['nodes']}
quests = {quest['id']: quest for quest in story['quests']}
exits = {node['id']: node['exits'] for node in nodes.values()}
edges = {(origin, edge['to']): edge for origin, gates in exits.items() for edge in gates}
regions = {point['id']: region['id'] for region in read('content/world-atlas.json')['regions'] for point in region['points']}
lua, core = runtime()
hub = 'fontaine-hub'

legends = [
    ('fon-wp-50056', 'vivianne-legend-bank'),
    ('fon-wp-50042', 'ninianne-legend-bank'),
    ('fon-wp-50058', 'yseut-legend-court'),
    ('fon-wp-53859', 'gravity-device-legend-terrace'),
    ('fon-wp-55780', 'rocky-legend-ledge'),
    ('fon-wp-55781', 'liam-legend-pond'),
    ('fon-wp-50065', 'ocean-judge-legend-pool'),
    ('iron-viscount-thermal-gallery', 'iron-viscount-legend-pool'),
    ('fon-wp-50075', 'fairy-knight-twins-legend-court'),
    ('fon-wp-50071', 'swords-of-the-gorge-legend-rift'),
    ('fon-wp-50073', 'fading-veteran-legend-wreck'),
    ('fon-wp-50062', 'dobharcu-legend-garden'),
    ('fon-wp-53865', 'luachra-legend-shelf'),
    ('fon-wp-55765', 'chassanion-legend-bubble-room'),
    ('morte-tower-sluice', 'chassanion-legend-bubble-room'),
    ('erinnyes-root-waterway', 'erinnyes-corrouge-cleft'),
]


def new(origin, level, completed=None):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, hub)
    if completed:
        quest = quests[completed]
        for step in quest['itinerary']:
            s.story.visited[step['node']] = True
        s.story.quests[completed] = lua.table_from(dict(status='complete', count=quest['goal'], cycles=1))
    core.enterStoryNode(s, origin)
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def guide(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[target])
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.selected.id == target and view.guide
    planned = native(view.guide)
    core.action(s, 'world_map_close')
    return planned


def follow(walk, path, mode):
    s = walk.state
    origin, *stops = path
    assert s.story.node == origin
    planned = guide(s, stops[-1])
    assert planned['status'] == 'ready' and [leg['id'] for leg in planned['stops']] == stops, (origin, planned)
    assert all(leg['mode'] == mode for leg in planned['stops']), planned
    if mode == 'swim':
        assert all(leg['label'] == '遊泳' and '門と同じ深さまで泳ぐ' in leg['hint'] for leg in planned['stops'])
    for dest in stops:
        walk.cross(dest)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def restored_to_hub(s):
    restored = core.restore(lua.table_from(save(s), recursive=True), 12)
    assert restored.story.node == hub and not restored.storySwimming
    assert native(restored.story.visited) == native(s.story.visited)
    assert native(restored.story.quests) == native(s.story.quests)


def try_legend(host, arena):
    gate = edges[host, arena]
    rule = gate.get('requires', {})
    completed = None if rule.get('unreported') else rule.get('quest')
    walk = new(host, 99, completed)
    s = walk.state
    planned = guide(s, arena)
    assert planned['status'] == 'blocked' and planned['reason'] == '必要Lv100', (host, arena, planned)
    walk.approach(gate['x'], gate.get('y', 480), arena)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == arena and not portal.available and portal.level == 100
    core.action(s, 'story_nearby_portal')
    assert s.story.node == host
    core.grantExp(s, LEVELS[99]['maple_reference_total_exp_to_reach'] - LEVELS[98]['maple_reference_total_exp_to_reach'], 'quest')

    mode = 'swim' if nodes[arena].get('swim') else 'walk'
    if mode == 'swim':
        walk.approach(gate['x'], gate['y'] - 80, arena)
        core.action(s, 'story_portal:' + arena)
        assert s.story.node == host and not s.story.visited[arena]
    follow(walk, (host, arena), mode)
    restored_to_hub(s)
    follow(walk, (arena, host), mode)
    return dict(host=host, arena=arena, mode=mode, roundTrip=True, levelBelowRejected=True,
                wrongDepthRejected=mode == 'swim', restoredAt=hub, prerequisite=completed)


def main():
    runs = [try_legend(*route) for route in legends]
    assert len({run['arena'] for run in runs}) == 15 and len(runs) == 16
    climbing = ('fon-wp-50036', 'sites-corridor-beryl-ledge', 'fon-wp-50037')
    foyer = 'icewind-promenade'
    icewind = [(hub, foyer, 'icewind-coppelia-field'), (hub, foyer, 'icewind-coppelius-field')]
    for path in [climbing, *icewind]:
        walk = new(path[0], max(nodes[node]['level'] for node in path))
        follow(walk, path, 'walk')
        restored_to_hub(walk.state)
        follow(walk, tuple(reversed(path)), 'walk')
    write('evidence/fontaine-exploration-routes-lua.json', dict(
        legendRoutes=runs, landRoutes=[climbing, *icewind],
        scope='Physical gate approaches from prepared starting areas; combat is covered by encounter suites.',
    ))
    (ROOT / 'work/fontaine-exploration-routes').mkdir(parents=True, exist_ok=True)
    write('work/fontaine-exploration-routes/lake.json', save(new('fon-wp-50065', 100).state))
    print('16 legend routes and 3 land routes passed, including both Morte entrances.')


if __name__ == '__main__':
    main()
