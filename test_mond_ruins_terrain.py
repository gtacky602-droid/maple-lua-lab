"""Check the Mondstadt ruins gates, shelf traversal, levels and rare encounter."""
from experience import LEVELS
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, start, write, write_fixture

hub = 'mond-town'
routes = [
    ('sites-hunt-7092', 'mond-wp-21', 13, 'mondCeciliaGarden', 2230),
    ('sites-hunt-7111', 'mond-wp-24', 14, 'mondBrokenSpire', 2230),
    ('sites-hunt-7137', 'mond-wp-19', 13, 'mondMemoryValley', 610),
]
write_fixture('mond-ruins-terrain', 20, hub, [host for _, host, *_ in routes])
report = {stage: check_field(stage, host, hub, level, scenery, x)
          for stage, host, level, scenery, x in routes}
tower, host = routes[1][:2]
s = start(14, [host], hub)
core.action(s, 'story_fast:' + host)
for actor in s.actors.values():
    actor.inv = 1000
walk = TrailWalk(lua, core, s, gates, exits)
walk.cross(tower)
walk.approach(116, 480, 'shield camp')
elite = core.frame(s).storyNearbyPortal
assert elite.to == tower+'-pocket-1' and not elite.available
walk.approach(245, 480, 'below the overlook')
core.action(s, 'story_nearby_portal')
assert s.story.node == tower
walk.cross(tower+'-pocket-2')
guardian = s.enemies[1]
assert guardian.art == 'hilichurl'
walk.cross(tower)
assert walk.actor.y == 389
report['towerAtLevel14'] = {'eliteRequires': elite.level, 'rareArt': guardian.art, 'returnY': walk.actor.y}
arena = 'dvalin-sky-arena'
s = start(19, [host], hub)
core.action(s, 'story_fast:' + host)
walk = TrailWalk(lua, core, s, gates, exits)
for actor in s.actors.values():
    actor.inv = 1000
walk.cross(tower)
walk.approach(2590, 388, 'tower summit')
portal = core.frame(s).storyNearbyPortal
assert portal.to == arena and portal.level == 20 and not portal.available
core.action(s, 'story_nearby_portal')
assert s.story.node == tower
core.grantExp(s, LEVELS[19]['maple_reference_total_exp_to_reach']
              - LEVELS[18]['maple_reference_total_exp_to_reach'], 'quest')
core.action(s, 'world_map_focus:' + arena)
view = core.frame(s).worldMap
assert view.selected.boss.kind == 'weekly'
assert [stop.id for stop in view.guide.stops.values()] == [arena]
core.action(s, 'world_map_close')
walk.cross(arena)
assert s.weeklySlots['boss-29010101'] is not None
walk.cross(tower)
assert walk.actor.y == 388
report['weeklyGate'] = {'level':20, 'blockedAt':19, 'boss':'boss-29010101', 'mapSteps':[arena],
                        'returnedTo':tower, 'returnY':walk.actor.y}
write('evidence/mond-ruins-terrain-lua.json', report)
print('Three hunt fields, the grounded and raised tower gates, and all returns passed.')
