"""Traverse the trading post, both tea-stream branches and the northern ridge."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, start, write, write_fixture

hub = 'chenyu-camp'
fields = [(64834, 87, 'chenyuPostRoad'), (64835, 81, 'chenyuStreamTea'),
          (64836, 84, 'chenyuEastLake'), (64838, 80, 'chenyuHarborBamboo'),
          (64839, 79, 'chenyuNorthEdge')]
write_fixture('chenyu-post-terrain', 89, hub, [f'liyue-wp-{n}' for n, *_ in fields])
report = {}
for number, level, scenery in fields:
    stage = f'branch-hunt-{number}'
    report[stage] = check_field(stage, f'liyue-wp-{number}', hub, level, scenery, 690,
                                population_count=36)

# Walk from the trading post to the northern overlook through the existing waypoints.
numbers = [64834, 64833, 64835, 64836, 64840, 64838, 64839, 66979]
course = [f'liyue-wp-{n}' for n in numbers]
state = start(90, [], hub)
core.enterStoryNode(state, course[0])
walk = TrailWalk(lua, core, state, gates, exits)
for to in course[1:] + course[-2::-1]:
    walk.cross(to)
report['ridgeRoundTrip'] = course + course[-2::-1]
write('evidence/chenyu-post-terrain-lua.json', report)
print('Five hunts, six side rooms and the return trip across the ridge passed.')
