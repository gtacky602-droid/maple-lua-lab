"""Start at Lv1 and exercise the real gates to Mondstadt's forest and encounters."""

import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {node['id']: node['exits'] for node in nodes.values()}
edges = {(origin, edge['to']): edge for origin, gates in exits.items() for edge in gates}
regions = {point['id']: region['id'] for region in read('content/world-atlas.json')['regions'] for point in region['points']}
lua, core = runtime()
town, road, border = 'mond-town', 'mond-road', 'mond-border'
forest, lake = 'sites-corridor-mond-forest', 'mond-wp-12'
lookout, domain = 'sites-lookout-10009', 'ridge-watch-domain'
arenas = (
    (road, 'anemo-approach', 'anemo-field-basin'),
    (road, 'electro-approach', 'electro-field-shelf'),
    (road, border, 'cryo-approach', 'cryo-field-grove'),
    (road, 'dvalin-sky-arena'),
    (road, 'andrius-wolf-ring'),
)


def new():
    s = core.new(12)
    core.action(s, 'story_start')
    assert s.story.node == town and s.progression.level == 1
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def raise_level(s, level):
    core.grantExp(s, LEVELS[level - 1]['maple_reference_total_exp_to_reach'] - s.progression.total, 'quest')
    assert s.progression.level == level


def map_to(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[target])
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.selected.id == target and view.guide
    route = native(view.guide)
    core.action(s, 'world_map_close')
    return route


def check_locked(walk, target):
    s = walk.state
    origin = s.story.node
    level = nodes[target]['level']
    assert map_to(s, target)['reason'] == f'必要Lv{level}'
    gate = edges[origin, target]
    walk.approach(gate['x'], gate.get('y', 480), target)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == target and not portal.available and portal.level == level
    core.action(s, 'story_nearby_portal')
    assert s.story.node == origin and not s.story.visited[target]


def check_restore(s):
    saved = validate_save(native(core.checkpoint(s)))
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    assert restored.story.node == town and native(restored.story.visited) == native(s.story.visited)
    assert restored.progression.total == s.progression.total
    return saved


def verify_arena(path):
    walk = new()
    s = walk.state
    arena = path[-1]
    level = nodes[arena]['level']
    initial = map_to(s, arena)
    assert initial['status'] == 'blocked' and initial['reason'] == f'必要Lv{level}'
    assert [leg['id'] for leg in initial['stops']] == list(path)
    for stop in path[:-1]:
        walk.cross(stop)
    raise_level(s, level - 1)
    check_locked(walk, arena)
    raise_level(s, level)
    walk.cross(arena)
    check_restore(s)
    for stop in reversed((town, *path[:-1])):
        walk.cross(stop)
    return dict(path=path, level=level, rejectedBelowLevel=True, restoredAt=town, roundTrip=True)


def main():
    walk = new()
    s = walk.state
    planned = map_to(s, domain)
    assert [(leg['id'], leg.get('reason')) for leg in planned['stops']] == [
        (road, None), (border, None), (lookout, '必要Lv12'), (domain, '必要Lv20')]
    assert '上段の入口' in planned['stops'][-1]['hint']
    walk.cross(road)
    walk.cross(border)
    raise_level(s, 11)
    check_locked(walk, lookout)
    raise_level(s, 12)
    walk.cross(lookout)
    raise_level(s, 19)
    check_locked(walk, domain)
    raise_level(s, 20)
    (ROOT / 'work/mondstadt-map-access').mkdir(parents=True, exist_ok=True)
    write('work/mondstadt-map-access/domain-ready.json', check_restore(s))
    walk.cross(domain)
    check_restore(s)
    walk.cross(lookout)
    assert walk.actor.y == 380 and walk.actor.ground
    for stop in (border, road, town):
        walk.cross(stop)

    walk = new()
    s = walk.state
    walk.cross(road)
    raise_level(s, 6)
    check_locked(walk, forest)
    raise_level(s, 7)
    for stop in (forest, lake, forest, road, town):
        walk.cross(stop)
    check_restore(s)

    write('evidence/mondstadt-map-access-lua.json', dict(
        freshStartLevel=1, domainPath=planned['stops'], bothDomainLevelGates=True, domainRoundTrip=True,
        forestLevel=7, forestRoundTrip=True, arenas=[verify_arena(path) for path in arenas],
        setup='Starts in the regular Lv1 town. Tests add XP at the boundary and suppress damage during travel.',
    ))
    print('Lv1 route, lake corridor, both artifact-domain gates and five boss approaches passed.')


if __name__ == '__main__':
    main()
