"""Walk the cliff, tunnel and desert connections and verify the desert checkpoint."""

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

cliff = ('nat-wp-79057', 'sites-corridor-natlan-cliff', 'nat-wp-79545')
tunnel = ('nat-wp-82562', 'sites-corridor-natlan-tunnel', 'nat-wp-82568')
desert = ('sum-wp-36696', 'sites-west-desert-border', 'natlan-entry')
routes = [cliff, tunnel, desert]
gap_levels = {tunnel[1]: 112, desert[1]: 100}


def new(origin, level, fontaine_known=False):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    if fontaine_known:
        core.enterStoryNode(s, 'fontaine-hub')
    core.enterStoryNode(s, nodes[origin]['checkpoint'])
    core.enterStoryNode(s, origin)
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def guide(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[target])
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.selected and view.selected.id == target
    route = native(view.guide)
    core.action(s, 'world_map_close')
    return route


def follow(walk, route):
    origin, *stops = route
    s = walk.state
    assert s.story.node == origin
    planned = guide(s, stops[-1])
    assert planned['status'] == 'ready', planned
    assert [leg['id'] for leg in planned['stops']] == stops, (origin, stops, planned)
    for dest in stops:
        edge = edges[s.story.node, dest]
        if s.story.node == tunnel[1] and dest == tunnel[-1] and walk.actor.y == 480:
            walk.approach(802, 383, dest)
        walk.cross(dest)
        if edge.get('arrivalY', 480) < 480:
            assert walk.actor.ground and walk.actor.y == edge['arrivalY']


def save(s):
    return validate_save(native(core.checkpoint(s)))


def resume_on(s, checkpoint):
    restored = core.restore(lua.table_from(save(s), recursive=True), 12)
    assert restored.story.node == checkpoint, (s.story.node, restored.story.node, checkpoint)
    assert native(restored.story.visited) == native(s.story.visited)
    assert restored.progression.level == s.progression.level


def level_boundary(origin, gate, level):
    walk = new(origin, level - 1)
    s = walk.state
    route = guide(s, gate)
    assert route['status'] == 'blocked' and route['reason'] == f'必要Lv{level}', route
    approach = edges[origin, gate]
    walk.approach(approach['x'], approach.get('y', 480), gate)
    near = core.frame(s).storyNearbyPortal
    assert near.to == gate and not near.available and near.level == level
    core.action(s, 'story_nearby_portal')
    assert s.story.node == origin and not s.story.visited[gate]


def main():
    fixtures = ROOT / 'work/natlan-corridors'
    fixtures.mkdir(parents=True, exist_ok=True)
    report = []
    for origin, gate, end in routes:
        level = max(nodes[id]['level'] for id in (origin, gate, end))
        walk = new(origin, level)
        s = walk.state
        write(f'work/natlan-corridors/{gate}.json', save(s))
        if gate in gap_levels:
            level_boundary(origin, gate, gap_levels[gate])
        follow(walk, (origin, gate, end))
        checkpoint = nodes[origin]['checkpoint']
        resume_on(s, checkpoint)
        follow(walk, (end, gate, origin))
        assert len(walk.crossings) == 4
        report.append(dict(stages=[origin, gate, end], directions=sorted(walk.crossings), level=level,
                           levelBelowRejected=gate in gap_levels, restoredAt=checkpoint))

    # The new path does not require visiting Fontaine. The usual Fontaine-side save still works.
    checkpoint_cases = []
    for fontaine_known, checkpoint in ((False, 'sumeru-hub'), (True, 'fontaine-hub')):
        origin, gate, end = desert
        walk = new(origin, 100, fontaine_known=fontaine_known)
        s = walk.state
        follow(walk, (origin, gate, end))
        assert bool(s.story.visited['fontaine-hub']) == fontaine_known
        resume_on(s, checkpoint)
        for actor in s.actors.values():
            actor.hp = 0
        core.step(s, 1 / 60, lua.table())
        assert s.story.node == checkpoint and s.returns == 1, (checkpoint, s.story.node, s.returns)
        checkpoint_cases.append(dict(fontaineVisited=fontaine_known, saveAndDefeatReturnTo=checkpoint))

    write('evidence/natlan-corridors-lua.json', dict(routes=report, checkpoints=checkpoint_cases))
    print('3 Natlan corridors, 12 directions, 2 level gates and both checkpoint cases passed.')


if __name__ == '__main__':
    main()
