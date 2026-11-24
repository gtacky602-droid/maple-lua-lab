"""Follow the M map to each added Sites hunt and side room, then verify the return."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
edges = {(node['id'], edge['to']): edge for node in graph['nodes'] for edge in node['exits']}
atlas = read('content/world-atlas.json')
points = {point['id']: point for region in atlas['regions'] for point in region['points']}
waypoints = {row['stage_id'] for row in read('content/coverage.json')['map_catalog']['stage_links'].values()}
sources = (
    ('sites-geographic-fields', 'approach'),
    ('sites-branch-hunts', 'host'),
)
lua, core = runtime()


def xp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def ready(host, level):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, xp(level), 'quest')
    core.enterStoryNode(s, nodes[host]['checkpoint'])
    core.enterStoryNode(s, host)
    for actor in s.actors.values():
        actor.inv = 1000
    return s


def guide(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_layer:hunt')
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s, 'sprite', 'legacy').worldMap
    assert view.layer == 'hunt' and view.selected.id == target and view.guide, (s.story.node, target)
    data = native(view.guide)
    core.action(s, 'world_map_close')
    return data


def check_route(host, path, kind):
    target = path[-1]
    required = nodes[target]['level']
    prior = max(nodes[stage]['level'] for stage in [host, *path[:-1]])
    assert required >= prior and target not in waypoints, (path, required, prior)
    can_test_boundary = required > prior
    start_level = required - int(can_test_boundary)
    s = ready(host, start_level)
    walk = TrailWalk(lua, core, s, edges, {})
    quests = native(s.story.quests)
    assert not s.story.visited[target]
    route = guide(s, target)
    assert [leg['id'] for leg in route['stops']] == path, (host, path, route)
    assert route['status'] == ('blocked' if can_test_boundary else 'ready'), route
    for stage in path[:-1]:
        walk.cross(stage)

    if can_test_boundary:
        assert route['reason'] == f'必要Lv{required}'
        entrance = s.story.node
        edge = edges[entrance, target]
        walk.approach(edge['x'], edge.get('y', 480), target)
        portal = core.frame(s, 'sprite', 'legacy').storyNearbyPortal
        assert portal.to == target and not portal.available and portal.level == required
        core.action(s, 'story_nearby_portal')
        assert s.story.node == entrance and not s.story.visited[target] and not s.lift
        core.grantExp(s, xp(required) - xp(start_level), 'quest')
        assert guide(s, target)['status'] == 'ready'
    walk.cross(target)

    saved = validate_save(native(core.checkpoint(s)))
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    assert restored.story.node == nodes[host]['checkpoint'] and restored.story.visited[target]

    route_back = guide(s, host)
    assert route_back['status'] == 'ready'
    assert [leg['id'] for leg in route_back['stops']] == [*reversed(path[:-1]), host], (target, route_back)
    for leg in route_back['stops']:
        walk.cross(leg['id'])
    assert s.story.node == host and not s.lift and native(s.story.quests) == quests
    return dict(stage=target, host=host, intermediate=path[:-1], kind=kind, level=required,
                belowLevelRejected=can_test_boundary, restoredAt=restored.story.node), walk.crossings


def main():
    records, crossed = [], set()
    for source, approach_key in sources:
        for row in read(f'sources/map-research/{source}.json')['routes']:
            host, hunt = row[approach_key], row['stage']
            assert nodes[hunt]['level'] in points[host]['huntLevels']
            destinations = [([hunt], 'field')]
            destinations.extend(([hunt, pocket], 'elite') for pocket in row['pockets'])
            for path, kind in destinations:
                assert points[path[-1]]['huntKind'] == kind
                record, crossings = check_route(host, path, kind)
                records.append(record)
                crossed.update(crossings)

    assert len({row['stage'] for row in records}) == len(records) == 186
    assert len(crossed) == len(records) * 2
    for host, level in (('mond-wp-21', 14), ('mond-wp-21', 15), ('liyue-wp-104', 36)):
        s = ready(host, level)
        write(f'work/hunt-atlas-{host}-{level}.json', validate_save(native(core.checkpoint(s))))

    evidence = dict(
        scope='Sites geographic and branch hunts and their side rooms. Movement starts from regional fixtures; combat does not gate these paths.',
        fieldRoundTrips=sum(row['kind'] == 'field' for row in records),
        sideRoomRoundTrips=sum(row['kind'] == 'elite' for row in records),
        uniqueDirectedCrossings=len(crossed),
        separateLevelBoundaries=sum(row['belowLevelRejected'] for row in records),
        savedVisitsRestored=len(records),
        stages=records,
    )
    write('evidence/world-hunt-routes-lua.json', evidence)
    print(f'{len(records)} guided round trips, {len(crossed)} unique directions, '
          f'{evidence["separateLevelBoundaries"]} level boundaries, and {len(records)} save restores passed.')


if __name__ == '__main__':
    main()
