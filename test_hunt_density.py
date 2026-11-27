"""Check how many ordinary enemies fit in a scrolling Lua hunt at entry."""

from argparse import ArgumentParser
from bisect import bisect_left
from collections import defaultdict
import json
from math import ceil
from pathlib import Path

from runtime import ROOT, runtime
from savegame import validate_save
from story_scope import suspended_stage_returns

VIEW_WIDTH = 960
MINE_AND_SNOW_ARRIVALS = {
    'chasm-wp-25268', 'chasm-wp-25269', 'chasm-wp-25270',
    'spine-lee-walk', 'dragonspine-depth',
}
QUEST_FIELD_ARRIVALS = {
    'liyue-loading-yard','inazuma-lantern-trail','liyue-cliff-planks',
    'sum-visitors-meadow','natlan-flag-slope',
}


def read(path):
    return json.loads((ROOT / path).read_bytes())


def peak_view(positions, world_width):
    """Find the densest view as the camera scrolls between its two limits."""
    xs = sorted(positions)
    max_camera = max(0, world_width - VIEW_WIDTH)
    candidates = {0, max_camera, *(x for x in xs if 0 <= x <= max_camera)}
    return max((bisect_left(xs, left + VIEW_WIDTH) - bisect_left(xs, left), left)
               for left in candidates)


def hunt_points():
    graph = read('content/story-graph.json')
    suspended = suspended_stage_returns(graph)
    for area in read('content/world-atlas.json')['regions']:
        for point in area['points']:
            if point.get('huntKind') == 'field' and point['id'] not in suspended:
                yield area['id'], point['id']


def ordinary(placement):
    return not (placement.get('dailyElite') or placement.get('expRole') in ('elite', 'named')
                or (placement.get('respawnSeconds') or 6) >= 12 or placement.get('questPhase', 0))


def verify_intro_contact(lua, core, node, rows):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, node)
    by_id = {e.spawnId: e for e in state.enemies.values()}
    for row in rows:
        enemy = by_id[row['id']]
        assert enemy.contactDamage == row['contactDamage'] and enemy.contactCooldown == row['contactCooldown']
    sample_row = next((row for row in rows if row.get('platform', 0) == 0), rows[0])
    sample = by_id[sample_row['id']]
    state.enemies = lua.table_from([sample])
    player = state.actors[1]
    partner = state.actors[2]
    partner.hp = 0
    player.x, player.y = sample.x - 130, sample.y
    full_hp = player.hp
    sample.cd = 0
    idle = lua.table()
    for _ in range(140):
        core.step(state, 1/60, idle)
    assert player.hp == full_hp and sample.warning == 0, node
    player.x, player.y, player.vy = sample.x, sample.y, 0
    for _ in range(40):
        core.step(state, 1/60, idle)
    assert full_hp - player.hp == sample.contactDamage, node
    assert sample.contactCooldown - .05 <= sample.cd <= sample.contactCooldown, node
    return dict(configured=len(rows), distantHit=False, closeDamage=full_hp-player.hp,
                cooldownSeconds=sample.contactCooldown)


def check_landing(state, placements):
    ordinary_ids = {row['id'] for row in placements if ordinary(row)}
    positions = [(a.x, a.y) for a in state.actors.values()]
    for enemy in state.enemies.values():
        if enemy.spawnId not in ordinary_ids:
            continue
        for x, y in positions:
            assert abs(enemy.y-y)>=45 or x<=enemy.patrolMin-60 or x>=enemy.patrolMax+60, (
                state.story.node,enemy.spawnId,x,y)
    return positions


def verify_intro_arrivals(lua, core, graph, placements, targets):
    # A completed save opens the authored routes. Each probe uses the real portal
    # action so a lift or a boat can choose a different arrival than a walk.
    checkpoint = validate_save(read('evidence/remaining-survey-save.json'))
    finish_transfer = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) if not s.lift then return end end end')
    arrivals = []
    for stage in graph['nodes']:
        for edge in stage['exits']:
            destination = edge['to']
            if destination not in targets:
                continue
            state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
            core.enterStoryNode(state, stage['id'])
            actor = state.actors[state.active]
            actor.x, actor.y = edge['x'], edge.get('y', 480)
            core.action(state, 'story_portal:' + destination)
            if state.lift:
                finish_transfer(core, state, ceil(state.lift.remaining * 60) + 2)
            assert state.story.node == destination, (stage['id'],destination,state.storyNotice)
            positions = check_landing(state, placements[destination])
            arrivals.append(dict(origin=stage['id'], destination=destination, positions=positions))
    return arrivals


def verify_intro_waypoints(lua, core, graph, placements, targets):
    checkpoint = validate_save(read('evidence/remaining-survey-save.json'))
    waypoints = []
    for stage in graph['nodes']:
        destination = stage['id']
        if destination not in targets or not stage.get('waypoint'):
            continue
        state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
        core.enterStoryNode(state, stage['checkpoint'])
        core.action(state, 'story_fast:' + destination)
        assert state.story.node == destination, (destination,state.storyNotice)
        positions = check_landing(state, placements[destination])
        assert positions[0] == (stage['waypoint']['x'],stage['waypoint']['y'])
        waypoints.append(dict(node=destination,positions=positions))
    return waypoints


def measure():
    lua, core = runtime()
    state = core.new(12)
    core.action(state, 'story_start')
    placements = read('content/enemy-spawns.json')['nodes']
    graph = read('content/story-graph.json')
    hidden = {stage['id'] for stage in graph['nodes'] if stage.get('hiddenGroup')}
    arrivals = defaultdict(list)
    ingredients = defaultdict(list)
    for quest in graph['quests']:
        for item in (quest.get('cooking') or {}).get('ingredients', []):
            ingredients[item['node']].append(item)
    for stage in graph['nodes']:
        for edge in stage['exits']:
            if 'arrivalX' in edge:
                arrivals[edge['to']].append((edge['arrivalX'], edge.get('arrivalY', 480), stage['id']))
    rows, routes, contact = [], [], {}
    unsafe, unsafe_ingredients = set(), []
    for region, node in hunt_points():
        core.enterStoryNode(state, node)
        assert state.story.node == node
        ids = {p['id'] for p in placements[node] if ordinary(p)}
        spawned = {e.spawnId: e for e in state.enemies.values() if e.spawnId in ids}
        assert set(spawned) == ids and all(core.canTargetEnemy(enemy) for enemy in spawned.values()), node
        if not spawned:
            routes.append(dict(region=region, node=node, enemies=len(state.enemies)))
            continue
        low_pressure = [row for row in placements[node] if row.get('contactCooldown')]
        if low_pressure:
            contact[node] = verify_intro_contact(lua, core, node, low_pressure)
        peak, camera = peak_view((enemy.x for enemy in spawned.values()), state.worldwidth)
        for x, y, other in arrivals[node]:
            for enemy in spawned.values():
                if abs(enemy.y - y) < 45 and enemy.patrolMin - 60 < x < enemy.patrolMax + 100:
                    unsafe.add((other, node))
        for item in ingredients[node]:
            for enemy in spawned.values():
                if abs(enemy.y - item['y']) < 45 and enemy.patrolMin - 60 < item['x'] < enemy.patrolMax + 60:
                    unsafe_ingredients.append((item['id'], node, enemy.spawnId))
        rows.append(dict(region=region, node=node, ordinary=len(spawned), peak=peak, camera=camera))
    targets = (set(contact) | {row['node'] for row in rows if row['node'] in hidden}
               | MINE_AND_SNOW_ARRIVALS | QUEST_FIELD_ARRIVALS)
    return dict(viewWidth=VIEW_WIDTH, ordinaryHunts=rows, eliteRoutes=routes,
                unsafePortalArrivals=sorted(unsafe), unsafeIngredientSites=unsafe_ingredients,
                introContact=contact, introPortalArrivals=verify_intro_arrivals(lua,core,graph,placements,targets),
                introWaypointArrivals=verify_intro_waypoints(lua,core,graph,placements,targets))


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--report-only', action='store_true')
    args = parser.parse_args()
    evidence = measure()
    outside = [row['node'] for row in evidence['ordinaryHunts'] if not 12 <= row['peak'] <= 20]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(len(evidence['ordinaryHunts']), 'ordinary hunts;', len(evidence['eliteRoutes']),
          'elite routes;', len(outside), 'outside peak density range')
    if not args.report_only:
        assert not outside, outside
        assert not evidence['unsafePortalArrivals'], evidence['unsafePortalArrivals']
        assert not evidence['unsafeIngredientSites'], evidence['unsafeIngredientSites']
