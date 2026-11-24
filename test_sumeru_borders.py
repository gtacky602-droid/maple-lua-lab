"""Exercise Sumeru's forest and Chasm approaches, checkpoints and desert shafts."""

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
edges = {(origin, edge['to']): edge for origin, row in exits.items() for edge in row}
regions = {p['id']: region['id'] for region in read('content/world-atlas.json')['regions'] for p in region['points']}
lua, core = runtime()
chasm, forest, ferry = 'chasm-camp', 'sumeru-hub', 'inazuma-town'
cliff, border, statue = 'liyue-wp-28732', 'sites-corridor-chasm-border', 'sum-wp-28704'
entry, bridge, north = 'sumeru-entry', 'sites-corridor-sumeru-bridge', 'sum-wp-28700'
desert = 'sum-wp-36696'


def xp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def new(hub, stage, level):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, xp(level), 'quest')
    core.enterStoryNode(s, hub)
    if stage != hub:
        core.enterStoryNode(s, stage)
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def map_to(s, destination):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[destination])
    core.action(s, 'world_map_select:' + destination)
    view = core.frame(s).worldMap
    assert view.selected.id == destination and view.guide
    route = native(view.guide)
    core.action(s, 'world_map_close')
    return route


def follow(walk, stages):
    route = map_to(walk.state, stages[-1])
    assert route['status'] == 'ready' and [leg['id'] for leg in route['stops']] == list(stages), route
    for stage in stages:
        walk.cross(stage)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def check_restore(s, expected):
    restored = core.restore(lua.table_from(save(s), recursive=True), 12)
    assert restored.story.node == expected, (s.story.node, restored.story.node, expected)
    assert native(restored.story.visited) == native(s.story.visited)
    assert native(restored.story.quests) == native(s.story.quests)


def follow_and_restore(walk, path, expected):
    for stage in path:
        follow(walk, (stage,))
        check_restore(walk.state, expected)
    return dict(stages=path, restoredAt=expected)


def main():
    cases = [follow_and_restore(new(ferry, ferry, 60), (entry, bridge, north), ferry)]
    walk = new(chasm, cliff, 63)
    s = walk.state
    route = map_to(s, border)
    assert route['status'] == 'blocked' and route['reason'] == '必要Lv64'
    walk.approach(edges[cliff, border]['x'], 480, border)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == border and not portal.available
    core.action(s, 'story_nearby_portal')
    assert s.story.node == cliff
    core.grantExp(s, xp(64) - s.progression.total, 'quest')
    (ROOT / 'work/sumeru-borders').mkdir(parents=True, exist_ok=True)
    write('work/sumeru-borders/chasm-start.json', save(s))
    cases.append(follow_and_restore(walk, (border, statue, entry, bridge, north), chasm))
    for actor in s.actors.values():
        actor.hp = 0
    core.step(s, 1/60, lua.table())
    assert s.story.node == chasm and s.returns == 1

    cases.append(follow_and_restore(new(forest, statue, 64), (border, cliff), forest))
    walk = new(forest, entry, 64)
    cases.append(follow_and_restore(walk, (bridge, north), forest))
    follow(walk, (bridge, entry))
    assert walk.actor.y == 350 and walk.actor.ground

    # Older saves could store the corridor itself when its departure checkpoint was unknown.
    walk = new(ferry, statue, 64)
    follow(walk, (border,))
    legacy = save(walk.state)
    legacy['story']['node'] = border
    restored = core.restore(lua.table_from(validate_save(legacy), recursive=True), 12)
    assert restored.story.node == ferry

    routes = []
    for hub, path, level in (
        (forest, (forest, 'sites-sumeru-north-bridge', 'sum-wp-28745'), 61),
        (forest, ('sum-wp-28716', 'sites-sumeru-terrace-road', 'sum-wp-28715'), 63),
        (forest, (desert, 'sum-wp-36702'), 68),
        (forest, (desert, 'sum-wp-36695'), 68),
    ):
        walk = new(hub, path[0], max(level, *(nodes[id]['level'] for id in path)))
        follow(walk, path[1:])
        check_restore(walk.state, hub)
        follow(walk, tuple(reversed(path[:-1])))
        routes.append(dict(stages=path, directions=sorted(walk.crossings), restoredAt=hub))

    write('evidence/sumeru-border-routes-lua.json', dict(
        checkpoints=cases, chasmDefeatReturnsTo=chasm, chasmGateRejectsLevel63=True, legacyCorridorSaveRestoresTo=ferry,
        bridgesAndShafts=routes, fixture='Testing starts at an existing hub or a border waypoint at the stated level.',
    ))
    print('Sumeru border checkpoints, Chasm defeat, forest bridges and both desert shafts passed.')


if __name__ == '__main__':
    main()
