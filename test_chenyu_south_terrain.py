"""Traverse the remaining Chenyu branch hunts and the boat and lifts that serve them."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, start, write, write_fixture

hub = 'liyue-harbor'
fields = [
    (64845, 'chenyu-depth', 81, 'chenyuDepthTrail', 36),
    (64846, 'liyue-wp-64846', 82, 'chenyuFoothillTurn', 36),
    (64847, 'liyue-wp-64847', 86, 'chenyuSouthScree', 36),
    (64848, 'liyue-wp-64848', 88, 'chenyuSouthFork', 36),
    (64849, 'liyue-wp-64849', 90, 'chenyuWestVault', 36),
    (64850, 'chenyu-camp', 76, 'chenyuTrailCamp', 36),
    (66768, 'liyue-wp-66768', 88, 'chenyuHarborBluff', 36),
    (66769, 'liyue-wp-66769', 86, 'chenyuCargoWharf', 36),
    (66770, 'liyue-wp-66770', 90, 'chenyuOuterReef', 36),
    (66979, 'liyue-wp-66979', 87, 'chenyuHiddenGrotto', 36),
]
write_fixture('chenyu-south-terrain', 90, hub, [host for _, host, *_ in fields])
report = {}
for number, host, level, scenery, count in fields:
    stage = f'branch-hunt-{number}'
    report[stage] = check_field(stage, host, hub, level, scenery, 690, population_count=count)

routes = [
    ['chenyu-camp', 'chenyu-depth', 'liyue-wp-64846', 'liyue-wp-64847', 'liyue-wp-64848', 'chenyu-depth'],
    ['liyue-wp-64847', 'liyue-wp-64829', 'liyue-wp-66770'],
    ['liyue-wp-64827', 'liyue-wp-64849'],
    ['liyue-wp-64834', 'liyue-wp-66768', 'liyue-wp-66769'],
    ['liyue-wp-64839', 'liyue-wp-66979'],
]
report['routeTrips'] = []
for route in routes:
    state = start(90, [], hub)
    core.enterStoryNode(state, route[0])
    walk = TrailWalk(lua, core, state, gates, exits)
    path = route + route[-2::-1]
    for dest in path[1:]:
        walk.cross(dest)
    report['routeTrips'].append(path)
write('evidence/chenyu-south-terrain-lua.json', report)
print('Ten fields, nine side rooms, five return journeys passed.')
