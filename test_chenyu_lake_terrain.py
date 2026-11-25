"""Walk the meadow, both lake banks and the tea terraces using the ordinary Lua controls."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, start, write, write_fixture

hub = 'chenyu-camp'
fields = [(64830, 83, 'chenyuGrassSteps'), (64831, 85, 'chenyuLakePier'),
          (64832, 84, 'chenyuAqueduct'), (64833, 88, 'chenyuRiverBendTea')]
write_fixture('chenyu-lake-terrain', 95, hub, [f'liyue-wp-{n}' for n, *_ in fields])
report = {}
for number, level, scenery in fields:
    stage = f'branch-hunt-{number}'
    report[stage] = check_field(stage, f'liyue-wp-{number}', hub, level, scenery, 690,
                                population_count=48)

course = ['liyue-wp-64833', 'branch-hunt-64833', 'liyue-wp-64833', 'liyue-wp-64831',
          'branch-hunt-64831', 'liyue-wp-64831', 'liyue-wp-64832', 'branch-hunt-64832',
          'liyue-wp-64832', 'liyue-wp-64831', 'liyue-wp-64833']
state = start(90, [], hub)
core.enterStoryNode(state, course[0])
for actor in state.actors.values():
    actor.inv = 1000
walk = TrailWalk(lua, core, state, gates, exits)
for dest in course[1:]:
    walk.cross(dest)
report['lakeRoundTrip'] = course
write('evidence/chenyu-lake-terrain-lua.json', report)
print('Four hunts, four side rooms and the two-way lake crossing passed.')
