"""Walk the new pass into the snowfield and verify both level gates and the save."""

import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


town, frontier, entry, snow = 'nod-town', 'winter-frontier-switchback', 'snezhnaya-entry', 'snezhnaya-hub'
nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {node['id']: node['exits'] for node in nodes.values()}
edges = {(origin, edge['to']): edge for origin, gates in exits.items() for edge in gates}
regions = {point['id']: region['id'] for region in read('content/world-atlas.json')['regions'] for point in region['points']}
lua, core = runtime()


def xp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def guide(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[target])
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.selected.id == target and view.guide
    result = native(view.guide)
    core.action(s, 'world_map_close')
    return result


def check_locked(walk, target, level):
    s = walk.state
    origin = s.story.node
    plan = guide(s, target)
    assert plan['status'] == 'blocked' and plan['reason'] == f'必要Lv{level}', plan
    assert [leg['id'] for leg in plan['stops']] == [target], plan
    edge = edges[origin, target]
    walk.approach(edge['x'], edge.get('y', 480), target)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == target and not portal.available and portal.level == level
    core.action(s, 'story_nearby_portal')
    assert s.story.node == origin and not s.story.visited[target]


def save(s):
    return validate_save(native(core.checkpoint(s)))


def main():
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, xp(135), 'quest')
    core.enterStoryNode(s, town)
    for actor in s.actors.values():
        actor.inv = 1000
    walk = TrailWalk(lua, core, s, edges, exits)
    check_locked(walk, frontier, 136)
    core.grantExp(s, xp(136) - xp(135), 'quest')
    walk.cross(frontier)
    core.grantExp(s, xp(139) - xp(136), 'quest')
    check_locked(walk, entry, 140)
    walk.cross(town)
    core.grantExp(s, xp(140) - xp(139), 'quest')
    (ROOT / 'work/nod-winter-pass').mkdir(parents=True, exist_ok=True)
    write('work/nod-winter-pass/town.json', save(s))
    walk.cross(frontier)
    plan = guide(s, snow)
    assert plan['status'] == 'ready' and [leg['id'] for leg in plan['stops']] == [entry, snow]
    assert '峠を越えて雪原へ' in plan['stops'][0]['hint']
    walk.cross(entry)
    assert walk.actor.ground and walk.actor.y == 380
    restored = core.restore(lua.table_from(save(s), recursive=True), 12)
    assert restored.story.node == town and native(restored.story.visited) == native(s.story.visited)
    assert not restored.story.visited[snow]
    reverse = guide(s, frontier)
    assert [leg['id'] for leg in reverse['stops']] == [frontier] and '上段の入口' in reverse['stops'][0]['hint']
    walk.cross(frontier)
    walk.cross(entry)
    walk.cross(snow)
    walk.cross(entry)
    walk.cross(frontier)
    walk.cross(town)
    walk.cross(entry)
    assert s.story.visited[snow] and s.story.visited[frontier]
    write('evidence/nod-winter-pass-lua.json', dict(
        frontierMinLevel=136, snowfieldMinLevel=140, bothLowerLevelsRejectedInAtlasAndAtGate=True,
        directPath=plan['stops'], upperSnowfieldLanding=[295, 380], reversePath=reverse['stops'],
        crossings=sorted(walk.crossings), restoredAt=restored.story.node, townsVisited=[town, snow],
    ))
    print('Winter pass, both level gates, upper landing, return and checkpoint passed.')


if __name__ == '__main__':
    main()
