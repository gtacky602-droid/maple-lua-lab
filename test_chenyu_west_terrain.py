"""Walk the four west-valley branches, their side rooms and their approach routes."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, start, write, write_fixture

hub = 'chenyu-camp'
fields = [
    (64826, 88, 'chenyuWestBank', 36),
    (64827, 89, 'chenyuWestPeak', 36),
    (64828, 89, 'chenyuFerry', 48),
    (64829, 85, 'chenyuSouthPass', 48),
]
write_fixture('chenyu-west-terrain', 90, hub, [f'liyue-wp-{n}' for n, *_ in fields])
report = {}
for number, level, scenery, population in fields:
    stage = f'branch-hunt-{number}'
    report[stage] = check_field(stage, f'liyue-wp-{number}', hub, level, scenery, 690,
                                population_count=population)

# Enter the real hunt gates along the river-to-peak route, and from the southern boat.
for key, course in [
    ('riverToPeak', ['liyue-wp-64828', 'branch-hunt-64828', 'liyue-wp-64828', 'liyue-wp-64826',
                     'branch-hunt-64826', 'liyue-wp-64826', 'liyue-wp-64827', 'branch-hunt-64827',
                     'liyue-wp-64827', 'liyue-wp-64849', 'liyue-wp-64827', 'liyue-wp-64826', 'liyue-wp-64828']),
    ('southernBoat', ['liyue-wp-66770', 'liyue-wp-64829', 'branch-hunt-64829', 'liyue-wp-64829', 'liyue-wp-66770']),
]:
    state = start(90, [], hub)
    core.enterStoryNode(state, course[0])
    for actor in state.actors.values():
        actor.inv = 1000
    walk = TrailWalk(lua, core, state, gates, exits)
    for dest in course[1:]:
        walk.cross(dest)
    report[key] = course
write('evidence/chenyu-west-terrain-lua.json', report)
print('Walked all four hunts, four side rooms, west peak lift, and southern ferry.')
