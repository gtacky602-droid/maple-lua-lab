"""Follow the lake ridge to the ferry, including the journey to the offshore island."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, start, write, write_fixture

hub = 'chenyu-camp'
fields = [(64840, 83, 'chenyuNeedlePeak'), (64841, 77, 'chenyuSaddle'),
          (64842, 78, 'chenyuReedBend'), (64844, 80, 'chenyuNorthFerry')]
write_fixture('chenyu-ferry-terrain', 84, hub, [f'liyue-wp-{number}' for number, *_ in fields])
report = {}
for number, level, scenery in fields:
    stage = f'branch-hunt-{number}'
    report[stage] = check_field(stage, f'liyue-wp-{number}', hub, level, scenery, 690)

# The source placement names the Fatui family. The lab uses its shared Cryogunner pose.
state = start(84, [], hub)
core.enterStoryNode(state, 'branch-hunt-64842')
gunners = [enemy for enemy in state.enemies.values() if enemy.art == 'fatui-skirmisher-cryogunner']
assert len(gunners) == 32
gunner = gunners[0]
for actor in state.actors.values():
    actor.hp = 0
for enemy in state.enemies.values():
    enemy.hp = 0
state.camera = max(0, gunner.x - 480)
art = core.enemyIdleArt[gunner.art]
rectangles = {}
for quality in ('legacy', 'h48c32', 'h32c16'):
    gunner.hp = 0
    baseline = sum(d.kind == 'rect' for d in core.frame(state, 'rect', quality).draws.values())
    gunner.hp = gunner.maxhp
    total = sum(d.kind == 'rect' for d in core.frame(state, 'rect', quality).draws.values())
    assert total - baseline == len(art.profiles[quality].runs) > 0
    rectangles[quality] = total - baseline
assert any(d.source == art.source for d in core.frame(state, 'sprite', 'legacy').draws.values())
report['riverFatui'] = dict(count=len(gunners), art=gunner.art, source=art.source, rectangles=rectangles)

numbers = [64840, 64838, 64839, 64841, 64842, 64844, 38]
course = [f'liyue-wp-{number}' for number in numbers]
state = start(90, [], hub)
core.enterStoryNode(state, course[0])
walk = TrailWalk(lua, core, state, gates, exits)
for destination in course[1:] + course[-2::-1]:
    walk.cross(destination)
report['roundTrip'] = course + course[-2::-1]
report['ferrySeconds'] = [gates[course[-2], course[-1]]['boatSeconds'],
                          gates[course[-1], course[-2]]['boatSeconds']]
write('evidence/chenyu-ferry-terrain-lua.json', report)
print('Four hunting grounds, three ranger camps and the ferry round trip passed.')
