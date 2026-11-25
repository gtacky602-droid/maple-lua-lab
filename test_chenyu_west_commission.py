"""Clear Zhongli's commission by walking to named side rooms and using normal attacks."""
import argparse
from tools.domain_terrain_test import TrailWalk, core, exits, gates, lua, start, write
from runtime import native
from savegame import validate_save

quest = 'daily-liyue-relics'
hub = 'liyue-harbor'
parser = argparse.ArgumentParser(description=__doc__)
areas = {'west':range(64826, 64830), 'lake':range(64830, 64834), 'post':(64834, 64835, 64836, 64839), 'ferry':(64841, 64842, 64844),
         'south':(64845, 64846, 64847, 64848, 64849, 64850, 66768, 66770, 66979)}
parser.add_argument('area', nargs='?', choices=areas, default='west')
area = parser.parse_args().area
fields = areas[area]
host_aliases = {64845: 'chenyu-depth', 64850: 'chenyu-camp'}
hosts = [host_aliases.get(n, f'liyue-wp-{n}') for n in fields]
rooms = [f'branch-hunt-{n}-pocket-1' for n in fields]
fight = lua.eval("""function(C, s)
    local enemy = s.enemies[1]
    for tick = 1, 7200 do
        local actor = s.actors[s.active]
        local distance = enemy.x - actor.x
        C.step(s, 1/60, {left=distance < -35 or (distance < 0 and actor.dir > 0),
                      right=distance > 35 or (distance > 0 and actor.dir < 0), attack=true})
        if enemy.hp <= 0 then return tick end
        if actor.hp <= 0 then break end
    end
    return 0
end""")

def slot(state):
    return next(row for row in state.daily.ledger.activeSlots.values() if row.id == quest)

def reload(state):
    save = validate_save(native(core.checkpoint(state)))
    return core.restore(lua.table_from(save, recursive=True))

trips = []
second_route = (2, 1, 0) if area == 'ferry' else (3, 1, 2)
routes = ((0, 1, 2), (3, 4, 5), (6, 7, 8)) if area == 'south' else ((0, 1, 2), second_route)
for stops in routes:
    state = start(90, hosts, hub)
    core.dailyBind(state, 'd72ac5349dd6498f9e25ea3dfff820e1', 20801, None)
    core.action(state, 'daily_accept:' + quest)
    entry = next(q for q in core.frame(state).daily.activeSlots.values() if q.id == quest)
    assert set(rooms).issubset(entry.targetNodes.values())
    for count, index in enumerate(stops, 1):
        host, room = hosts[index], rooms[index]
        stage = room.removesuffix('-pocket-1')
        core.action(state, 'story_fast:' + host)
        assert state.story.node == host
        walk = TrailWalk(lua, core, state, gates, exits)
        for direction in ('left', 'right'):
            walk.inputs[direction].attack = True
        walk.cross(stage)
        walk.cross(room)
        assert len(state.enemies) == 1
        ticks = fight(core, state)
        assert ticks and slot(state).count == count, (room, ticks, slot(state).count)
        walk.cross(stage)
        walk.cross(host)
        state = reload(state)
        assert slot(state).count == count
        trips.append({'room': room, 'normalAttackTicks': ticks, 'savedCount': count})
    core.action(state, 'story_fast:' + hub)
    assert state.story.node == hub
    for _ in range(2):
        core.action(state, 'daily_claim:' + quest)
        core.dailySettle(state)
        state = reload(state)
        assert (state.daily.paidXp, state.daily.paidMora) == (1830, 380)
result = {'quest': quest, 'trips': trips, 'xp': 1830, 'mora': 380}
if area == 'post':
    result['rareEncounters'] = []
    for field in (64835, 64836):
        state = start(90, hosts, hub)
        core.dailyBind(state, 'd72ac5349dd6498f9e25ea3dfff820e1', 20801, None)
        core.action(state, 'daily_accept:' + quest)
        core.action(state, f'story_fast:liyue-wp-{field}')
        walk = TrailWalk(lua, core, state, gates, exits)
        stage = f'branch-hunt-{field}'
        room = stage + '-pocket-2'
        shown = next(q for q in core.frame(state).daily.activeSlots.values() if q.id == quest)
        assert room not in shown.targetNodes.values()
        walk.cross(stage)
        walk.cross(room)
        ticks = fight(core, state)
        assert ticks and slot(reload(state)).count == 0
        result['rareEncounters'].append({'room':room, 'normalAttackTicks':ticks, 'savedCount':0})
write(f'evidence/chenyu-{area}-commission.json', result)
print(f'{len(routes)} three-room circuits paid once and survived reloads.')
