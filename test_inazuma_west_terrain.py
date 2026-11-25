"""Exercise the western island hunt routes, including Yashiori's two different doors."""
from tools.domain_terrain_test import (
    TrailWalk, check_field, core, exits, gates, lua, nodes, start, write, write_fixture,
)

hub = 'inazuma-town'
routes = [
    ('sites-hunt-12788','ina-wp-12715',650,'inaTataraFurnace'),
    ('sites-hunt-12791','ina-wp-12749',650,'inaYashioriRift'),
    ('sites-hunt-12794','maguu-approach',2330,'inaSerpentQuarry'),
]
write_fixture('inazuma-west-terrain',60,hub,[host for _,host,_,_ in routes])
result = {stage:check_field(stage,host,hub,59,scenery,x)
          for stage,host,x,scenery in routes}

stage, host = routes[1][:2]
rare, elite = stage+'-pocket-2', stage+'-pocket-1'
s = start(59,[host],hub)
core.action(s,'story_fast:'+host)
for actor in s.actors.values():
    actor.inv = 1000
walk = TrailWalk(lua,core,s,gates,exits)
walk.cross(stage)
walk.approach(2730,480,'ground-floor elite door')
assert core.frame(s).storyNearbyPortal.to == elite
core.action(s,'story_nearby_portal')
assert s.story.node == stage
walk.approach(2600,480,'below the rare encounter')
core.action(s,'story_nearby_portal')
assert s.story.node == stage
walk.cross(rare)
enemy=s.enemies[1]
assert enemy.art=='fanged-beast'
walk.cross(stage)
assert walk.actor.y == 380
core.action(s,'world_map_toggle')
view=core.frame(s).worldMap
choices={r.id:(r.pocketRole,r.entryHeight,r.level) for r in view.routes.values() if r.pocketRole}
assert choices=={rare:('rare_pocket',380,59),elite:('optional_elite',480,60)}
result['yashioriAtLevel59']={'routes':choices,'returnedOnShelfY':walk.actor.y,'rareArt':enemy.art}
write('evidence/inazuma-west-terrain-lua.json',result)
print('Three western approaches, both Yashiori gates, all jumps and returns passed.')
