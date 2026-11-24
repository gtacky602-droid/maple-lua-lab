"""Check the Ritou shuttles, their field-boss approaches and the Yashiori sandbar."""

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
lua, core = runtime()
advance = lua.eval('function(C,s,ticks) for _=1,ticks do C.step(s,1/60,{}) end end')
port = 'inazuma-port'
routes = (('watatsumi-landing', 'hydro-hypostasis-field-cove', 52, 4.2),
          ('tsurumi-coast', 'wolflord-field-ruins', 54, 4.8))


def xp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def new(level, start=port):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, xp(level), 'quest')
    core.enterStoryNode(s, port)
    if start != port:
        core.enterStoryNode(s, start)
    for actor in s.actors.values():
        actor.inv = 1000
    return TrailWalk(lua, core, s, edges, exits)


def guide(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.selected.id == target and view.guide
    planned = native(view.guide)
    core.action(s, 'world_map_close')
    return planned


def save(s):
    return validate_save(native(core.checkpoint(s)))


def check_restore(s):
    restored = core.restore(lua.table_from(save(s), recursive=True), 12)
    assert restored.story.node == port and not restored.lift
    assert restored.progression.total == s.progression.total
    assert native(restored.story.visited) == native(s.story.visited)


def cross_boat(walk, dest, seconds):
    s = walk.state
    origin = s.story.node
    edge = edges[origin, dest]
    walk.approach(edge['x'], edge.get('y', 480), dest)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == dest and portal.available and portal.boatSeconds == seconds
    core.action(s, 'story_nearby_portal')
    assert s.story.node == origin and s.lift.boat and s.lift.destination == dest and s.lift.remaining == seconds
    saved_xp = s.progression.total
    advance(core, s, 60)
    check_restore(s)
    advance(core, s, round(seconds * 60) - 61)
    assert s.story.node == origin and s.lift
    advance(core, s, 1)
    assert s.story.node == dest and not s.lift and s.progression.total == saved_xp
    assert (walk.actor.x, walk.actor.y) == (edge['arrivalX'], edge['arrivalY'])


def verify_shuttle(shore, arena, level, seconds):
    walk = new(level - 1)
    s = walk.state
    locked = guide(s, shore)
    assert locked['status'] == 'blocked' and locked['reason'] == f'必要Lv{level}'
    walk.approach(edges[port, shore]['x'], 480, shore)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == shore and not portal.available and portal.level == level
    core.action(s, 'story_nearby_portal')
    assert s.story.node == port and not s.lift
    core.grantExp(s, xp(level) - s.progression.total, 'quest')
    route = guide(s, arena)
    assert route['status'] == 'ready'
    assert [(leg['id'], leg['mode']) for leg in route['stops']] == [(shore, 'boat'), (arena, 'walk')]
    assert f'移動に{seconds:g}秒' in route['stops'][0]['hint']
    cross_boat(walk, shore, seconds)
    walk.cross(arena)
    check_restore(s)
    walk.cross(shore)
    cross_boat(walk, port, seconds)
    return dict(shore=shore, fieldBossArena=arena, minLevel=level, secondsEachWay=seconds,
                belowLevelRejected=True, restoredMidRideAt=port, returned=True)


def main():
    result = [verify_shuttle(*route) for route in routes]
    sandbar = ('ina-wp-12704', 'sites-corridor-inazuma-sandbar', 'ina-wp-12716')
    walk = new(44, sandbar[0])
    for path in (sandbar, tuple(reversed(sandbar))):
        planned = guide(walk.state, path[-1])
        assert [leg['id'] for leg in planned['stops']] == list(path[1:])
        for dest in path[1:]:
            walk.cross(dest)
    assert walk.actor.y == 373 and walk.actor.ground
    check_restore(walk.state)

    (ROOT / 'work/inazuma-island-routes').mkdir(parents=True, exist_ok=True)
    write('work/inazuma-island-routes/port.json', save(new(54).state))
    write('evidence/inazuma-island-routes-lua.json', dict(
        shuttles=result, sandbar={'directions': sorted(walk.crossings), 'upperLandingY': 373},
    ))
    print('Two island shuttles, field-boss gates, checkpoints and the sandbar passed.')


if __name__ == '__main__':
    main()
