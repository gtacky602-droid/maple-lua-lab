"""Travel each narrow shelf entrance as both characters and stand still after landing."""
from tools.domain_terrain_test import core, gates, lua, read, write
from test_regional_quest_prop_packing import measure

save = read('evidence/remaining-survey-save.json')
routes = [
    ('sites-corridor-mond-forest', 'mond-road'),
    ('fontaine-understage-workfloor', 'fontaine-lift-catwalk'),
    ('natlan-flag-cleft', 'natlan-flag-ledges'),
]
measurements = {}
idle = lua.table()
for origin, dest in routes:
    for active in (1, 2):
        state = core.restore(lua.table_from(save, recursive=True))
        core.enterStoryNode(state, origin)
        if state.active != active:
            core.action(state, 'swap')
        assert state.active == active
        edge = gates[origin, dest]
        actor = state.actors[active]
        actor.x, actor.y, actor.vy, actor.ground = edge['x'], edge.get('y', 480), 0, True
        gate = core.frame(state).storyNearbyPortal
        assert gate and gate.to == dest and gate.available, (origin, gate and gate.to)
        core.action(state, 'story_nearby_portal')
        for _ in range(360):
            if state.lift is None:
                break
            core.step(state, 1/60, idle)
        assert state.story.node == dest
        x, y = edge['arrivalX'], edge['arrivalY']
        assert (state.actors[1].x, state.actors[1].y) == (x, y)
        shelves = [p for p in state.platforms.values() if p.y == y]
        for member in state.actors.values():
            assert member.y == y and any(p.x <= member.x <= p.x+p.w for p in shelves), (origin, member.x)
        for _ in range(15):
            core.step(state, 1/60, idle)
        actor = state.actors[active]
        assert actor.ground and actor.y == y, (dest, active, actor.y)
        print(origin, dest, active, actor.x, actor.y)
        if active == 2:
            measurements[dest] = {profile: measure(core, state, profile)
                                  for profile in ('legacy', 'h48c32', 'h32c16')}

write('evidence/shelf-arrival-packing.json', measurements)
