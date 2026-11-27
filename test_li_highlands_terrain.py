"""Traverse the Liyue domain fields and verify their early and late weekly entrances."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, nodes, read, start, write, write_fixture

hub = 'liyue-harbor'
routes = [
    (7173, 'liyue-wp-35', 38, 'liyueMingyunAdit', 610),
    (7190, 'liyue-wp-100', 38, 'liyueGuiliRuins', 2230),
    (7215, 'geo-approach', 39, 'liyueGuyunShoal', 610),
    (7218, 'liyue-wp-104', 38, 'liyueGoldenApproach', 610),
    (7220, 'liyue-wp-105', 38, 'liyueTianhengPass', 2230),
    (9778, 'primo-approach', 38, 'liyueLuhuaTerraces', 2230),
    (18048, 'liyue-wp-45', 38, 'liyueDragonQueller', 610),
]
write_fixture('li-highlands-terrain', 40, hub, [host for _, host, *_ in routes])
report = {f'sites-hunt-{id}': check_field(f'sites-hunt-{id}', host, hub, level, art, x)
          for id, host, level, art, x in routes}
report['weeklyEntrances'] = {}
for id, arena, level, boss, art in [
    (7218, 'childe-golden-house-arena', 28, 'boss-29030101', 'boss-childe'),
    (18048, 'azhdaha-dragon-seal-arena', 32, 'boss-29040101', 'boss-azhdaha'),
]:
    trail = f'sites-hunt-{id}'
    waypoint = 'liyue-wp-104' if id == 7218 else 'liyue-wp-45'
    s = start(level, [waypoint], hub)
    walk = TrailWalk(lua, core, s, gates, exits)
    for actor in s.actors.values():
        actor.inv = 1000
    walk.cross(arena)
    slot, spec = core.currentWeeklyBoss(s)
    assert spec.id == boss and spec.mapIdleArt == art
    assert (slot.primary.x, slot.primary.y) == (spec.center, spec.floorY)
    back = gates[arena, trail]
    walk.approach(back['x'], back['y'], trail)
    portal = core.frame(s).storyNearbyPortal
    assert portal.to == trail and portal.level == 38 and not portal.available
    walk.cross(hub)
    core.action(s,'story_fast:' + waypoint)
    core.action(s,'world_map_focus:' + arena)
    view = core.frame(s).worldMap
    assert view.selected.boss.kind == 'weekly' and [n.id for n in view.guide.stops.values()] == [arena]
    core.action(s, 'world_map_close')
    walk.cross(arena)
    walk.cross(waypoint)
    assert walk.actor.y == gates[waypoint, arena]['y']
    report['weeklyEntrances'][arena] = {'boss':boss, 'harborLevel':level, 'waypoint':waypoint, 'waypointLevel':level,
                                       'waypointReturnY':walk.actor.y, 'huntReturnRequires':38,
                                       'comparisonAnchor':[spec.center,spec.floorY], 'art':art}
# The rare room shares the trail's unlock level. The nearby elite stays gated at 40.
root = 'sites-hunt-18048'
s = start(38, ['liyue-wp-45'], hub)
core.action(s,'story_fast:liyue-wp-45')
for actor in s.actors.values():
    actor.inv=1000
walk = TrailWalk(lua, core, s, gates, exits)
walk.cross(root)
walk.approach(2580,480,'sealed chamber')
elite = core.frame(s).storyNearbyPortal
assert elite.to == root+'-pocket-1' and elite.level == 40 and not elite.available
walk.cross(root+'-pocket-2')
fungus = s.enemies[1]
walk.cross(root)
assert walk.actor.y == 389
report['ancientRootAt38'] = {'eliteRequires':elite.level,'rareGuardian':fungus.storyName,'returnedToY':walk.actor.y}
measured = {row['node']: row['key'] for batch in ('li-north', 'li-highlands')
            for row in read(f'assets/{batch}-background-generation.json')['scenes']}
expected = {k:n['scenery'] for k,n in nodes.items() if k.startswith('sites-hunt-') and n['region']=='璃月'}
assert measured == expected
report['coverage'] = {'fields':sum('-pocket-' not in k for k in expected),'rooms':sum('-pocket-' in k for k in expected)}
write('evidence/li-highlands-terrain-lua.json', report)
print('Seven hunt trails, six optional rooms and two weekly gates traversed. All 18 Liyue sites covered.')
