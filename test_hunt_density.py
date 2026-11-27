"""Check how many ordinary enemies fit in a scrolling Lua hunt at entry."""

from argparse import ArgumentParser
from bisect import bisect_left
from collections import defaultdict
import json
from pathlib import Path

from runtime import ROOT, runtime
from story_scope import suspended_stage_returns

VIEW_WIDTH = 960


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
                or placement.get('respawnSeconds', 6) >= 12 or placement.get('questPhase', 0))


def verify_intro_contact(lua, core, node, rows):
    state = core.new(12)
    core.action(state, 'story_start')
    core.enterStoryNode(state, node)
    by_id = {e.spawnId: e for e in state.enemies.values()}
    for row in rows:
        enemy = by_id[row['id']]
        assert enemy.contactDamage == row['contactDamage'] and enemy.contactCooldown == row['contactCooldown']
    sample = by_id[rows[0]['id']]
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
    player.x = sample.x
    for _ in range(40):
        core.step(state, 1/60, idle)
    assert full_hp - player.hp == sample.contactDamage, node
    assert sample.contactCooldown - .05 <= sample.cd <= sample.contactCooldown, node
    return dict(configured=len(rows), distantHit=False, closeDamage=full_hp-player.hp,
                cooldownSeconds=sample.contactCooldown)


def measure():
    lua, core = runtime()
    state = core.new(12)
    core.action(state, 'story_start')
    placements = read('content/enemy-spawns.json')['nodes']
    arrivals = defaultdict(list)
    for stage in read('content/story-graph.json')['nodes']:
        for edge in stage['exits']:
            if 'arrivalX' in edge:
                arrivals[edge['to']].append((edge['arrivalX'], edge.get('arrivalY', 480), stage['id']))
    rows, routes, contact = [], [], {}
    unsafe = set()
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
        rows.append(dict(region=region, node=node, ordinary=len(spawned), peak=peak, camera=camera))
    return dict(viewWidth=VIEW_WIDTH, ordinaryHunts=rows, eliteRoutes=routes,
                unsafePortalArrivals=sorted(unsafe), introContact=contact)


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
