"""Capture Lua traveler positions after automatic voyages and four portal ride types."""
from tools.domain_terrain_test import core, gates, lua, nodes, read, write

save = read('evidence/remaining-survey-save.json')
transfers = [(n['id'], n['voyage']['destination'], True) for n in nodes.values() if n.get('voyage')]
transfers.extend((origin, dest, False) for origin, dest in [
    ('liyue-cart-lift', 'liyue-harbor'), ('inazuma-port', 'watatsumi-landing'),
    ('fontaine-field', 'fon-wp-50064'), ('enkan-wp-21592', 'enkan-wp-21587')])
rows = []
for origin, dest, automatic in transfers:
    state = core.restore(lua.table_from(save, recursive=True))
    core.enterStoryNode(state, origin)
    row = dict(origin=origin, destination=dest, automatic=automatic)
    if not automatic:
        edge = gates[origin, dest]
        actor = state.actors[state.active]
        actor.x, actor.y = edge['x'], edge.get('y', 480)
        core.action(state, 'story_portal:' + dest)
        assert state.lift, (origin, dest, state.storyNotice)
        row['departureX'] = edge['x']
    for _ in range(6000):
        core.step(state, 1/60, lua.table())
        if state.story.node == dest:
            break
    assert state.story.node == dest, (origin, dest)
    actor = state.actors[1]
    row.update(x=actor.x, y=actor.y)
    rows.append(row)
write('evidence/transport-landings.json', rows)
print(len(rows), 'Lua arrivals')
