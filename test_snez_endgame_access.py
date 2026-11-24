"""Walk the nine endgame fields, then verify the two earned waypoints and three corridors."""

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
edges = {(origin, gate['to']): gate for origin, gates in exits.items() for gate in gates}
regions = {point['id']: region['id'] for region in read('content/world-atlas.json')['regions'] for point in region['points']}
lua, core = runtime()
station, mine, cap = 'white-pass-station', 'dawn-vein-mine', 'dawn-crystal-field'
fields = ('aurora-ice-cut', 'aurora-ice-shelf', 'aurora-steam-channel', 'aurora-mineral-terraces',
          mine, 'dawn-vein-deep', 'dawn-glass-ridge', 'dawn-glass-divide', cap)
corridors = (
    ('white-pass-cut', 'sites-white-pass-service-path', station),
    ('sne-wp-100642', 'sites-corridor-snow-ravine', 'sne-wp-100657'),
    ('sne-wp-106180', 'sites-corridor-snow-mine', 'sne-wp-106186'),
)


def xp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def new(origin, level):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, xp(level), 'quest')
    core.enterStoryNode(s, nodes[origin]['checkpoint'])
    core.enterStoryNode(s, origin)
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def advance_to(s, level):
    core.grantExp(s, xp(level) - s.progression.total, 'quest')
    assert s.progression.level == level


def map_to(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[target])
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.selected.id == target and view.guide, (s.story.node, target)
    selected, plan = native(view.selected), native(view.guide)
    core.action(s, 'world_map_close')
    return selected, plan


def blocked(walk, target):
    s = walk.state
    previous = s.story.node
    required = nodes[target]['level']
    _, guide = map_to(s, target)
    assert guide['status'] == 'blocked' and guide['reason'] == f'必要Lv{required}', guide
    gate = edges[previous, target]
    walk.approach(gate['x'], gate.get('y', 480), target)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == target and not portal.available and portal.level == required
    core.action(s, 'story_nearby_portal')
    assert s.story.node == previous


def save(s):
    return validate_save(native(core.checkpoint(s)))


def check_warp_registration(s, target):
    selected, _ = map_to(s, target)
    assert selected['waypoint'] and selected['visited']
    core.action(s, 'story_fast:' + target)
    actor = s.actors[s.active]
    point = nodes[target]['waypoint']
    assert s.story.node == target and (actor.x, actor.y) == (point['x'], point['y']) and actor.ground


def main():
    fixtures = ROOT / 'work/snez-endgame-access'
    fixtures.mkdir(parents=True, exist_ok=True)
    s = new(station, 200).state
    for target in (mine, cap):
        selected, plan = map_to(s, target)
        assert selected['waypoint'] and not selected.get('visited') and plan['status'] == 'ready'
        core.action(s, 'story_fast:' + target)
        assert s.story.node == station and not s.story.visited[target]
    write('work/snez-endgame-access/unvisited.json', save(s))

    walk = new(station, 159)
    s = walk.state
    for field in fields:
        need = nodes[field]['level']
        advance_to(s, need - 1)
        blocked(walk, field)
        advance_to(s, need)
        walk.cross(field)
    assert s.story.node == cap and len(walk.crossings) == 9
    write('work/snez-endgame-access/visited.json', save(s))
    restored = core.restore(lua.table_from(save(s), recursive=True), 12)
    assert restored.story.node == station and native(restored.story.visited) == native(s.story.visited)
    assert restored.progression.level == 200 and restored.progression.total == s.progression.total
    for target in (mine, cap):
        check_warp_registration(restored, target)
        core.action(restored, 'story_fast:' + station)
        assert restored.story.node == station
    for target in reversed((station, *fields[:-1])):
        walk.cross(target)
    assert len(walk.crossings) == 18

    results = []
    for path in corridors:
        walk = new(path[0], max(nodes[stage]['level'] for stage in path))
        for route in (path, tuple(reversed(path))):
            _, guide = map_to(walk.state, route[-1])
            assert guide['status'] == 'ready' and [leg['id'] for leg in guide['stops']] == list(route[1:]), guide
            for target in route[1:]:
                walk.cross(target)
        results.append(dict(stages=path, crossings=sorted(walk.crossings)))

    write('evidence/snez-endgame-access-lua.json', dict(
        walkedFields=fields, levels=[nodes[field]['level'] for field in fields], levelBoundaries=9,
        huntDirections=18, corridors=results, registeredAfterVisit=[mine, cap],
        unvisitedWarpsRejected=True, restoredAt=station, warpedAgainAfterRestore=True,
    ))
    print('All 9 hunt gates, both waypoint visits and the three corridors passed.')


if __name__ == '__main__':
    main()
