"""Check return points when crossing from Liyue before discovering either regional hub."""

from runtime import ROOT
from test_sumeru_borders import check_restore, core, edges, follow, lua, map_to, new, save, write, xp

harbor, wetland, snowline, slope = 'liyue-harbor', 'liyue-wp-34', 'sites-dragonspine-south-foothill', 'mond-wp-6599'
cliff, tunnel, statue = 'liyue-wp-28732', 'sites-corridor-chasm-border', 'sum-wp-28704'
spine_camp, chasm_camp, forest = 'dragonspine-camp', 'chasm-camp', 'sumeru-hub'
fixtures = ROOT / 'work/subregion-checkpoints'


def reject_gate(walk, origin, destination, level):
    state = walk.state
    route = map_to(state, destination)
    assert route['status'] == 'blocked' and route['reason'] == f'必要Lv{level}', route
    edge = edges[origin, destination]
    walk.approach(edge['x'], edge.get('y', 480), destination)
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == destination and not portal.available
    core.action(state, 'story_nearby_portal')
    assert state.story.node == origin
    core.grantExp(state, xp(level) - state.progression.total, 'quest')


def check_snowline():
    walk = new(harbor, wetland, 43)
    state = walk.state
    reject_gate(walk, wetland, snowline, 44)
    write('work/subregion-checkpoints/snowline-ready.json', save(state))
    assert not state.story.visited[spine_camp]
    follow(walk, (snowline, slope))
    for stop in ('mond-wp-6596', 'mond-wp-6594', 'mond-wp-6601'):
        check_restore(state, harbor)
        walk.cross(stop)
    check_restore(state, harbor)
    walk.cross(spine_camp)
    for stop in ('mond-wp-6601', 'mond-wp-6594', 'mond-wp-6596', slope, snowline):
        walk.cross(stop)
        check_restore(state, spine_camp)
    walk.cross(wetland)
    check_restore(state, harbor)
    from_mond = new('mond-town', 'mond-wp-6596', 44)
    from_mond.cross(slope)
    check_restore(from_mond.state, 'mond-town')
    return dict(gateLevel=44, firstArrivalRestoresAt=harbor, returnTripRestoresAt=spine_camp,
                directions=sorted(walk.crossings))


def check_tunnel():
    walk = new(harbor, cliff, 63)
    state = walk.state
    reject_gate(walk, cliff, tunnel, 64)
    write('work/subregion-checkpoints/tunnel-ready.json', save(state))
    follow(walk, (tunnel, statue))
    for stop in ('sumeru-entry', 'sites-corridor-sumeru-bridge', 'sum-wp-28700'):
        check_restore(state, harbor)
        walk.cross(stop)
    check_restore(state, harbor)
    assert not any(state.story.visited[id] for id in (chasm_camp, forest, 'inazuma-town'))
    for stop in ('sites-corridor-sumeru-bridge', 'sumeru-entry', statue, tunnel, cliff):
        walk.cross(stop)
        check_restore(state, harbor)
    follow(walk, (tunnel, statue))
    for actor in state.actors.values():
        actor.hp = 0
    core.step(state, 1/60, lua.table())
    assert state.story.node == harbor and state.returns == 1
    return dict(gateLevel=64, firstArrivalRestoresAt=harbor, defeatReturnsTo=harbor,
                directions=sorted(walk.crossings))


if __name__ == '__main__':
    fixtures.mkdir(parents=True, exist_ok=True)
    proof = dict(snowline=check_snowline(), tunnel=check_tunnel())
    write('evidence/subregion-checkpoints-lua.json', proof)
    print('Both Liyue approaches, level gates and return points passed.')
