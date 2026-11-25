"""Verify six Lv79 desert hunts and the five adjoining Lv80 rooms."""
from tools.domain_terrain_test import check_field, nodes, write, write_fixture


# Field id, approach waypoint, first jump x, field scenery, side-room scenery.
routes = [
    (36703, 36683, 2380, 'sumRedSandWell', 'sumRedSandRoost'),
    (36704, 36691, 2380, 'sumeruDesertTombApproach', 'sumRoyalDen'),
    (36705, 36697, 2380, 'sumDuneVault', 'sumDuneCounterweight'),
    (41694, 36680, 2380, 'sumSandMarket', 'sumSandBalances'),
    (41817, 41836, 2380, 'sumSandWindcut', 'sumSandSentry'),
    (41818, 41839, 650, 'sumSandEastBasin', None),
]
hub = 'sumeru-hub'
write_fixture('sumeru-domain-terrain', 80, hub, [f'sum-wp-{host}' for _, host, *_ in routes])
result = {}
for field, waypoint, first_x, scenery, side_scenery in routes:
    stage, host = f'sites-hunt-{field}', f'sum-wp-{waypoint}'
    side_rooms = [edge['to'] for edge in nodes[stage]['exits'] if edge['to'] != host]
    assert len(side_rooms) == (1 if side_scenery else 0)
    record = check_field(stage, host, hub, 79, scenery, first_x)
    if side_rooms:
        side = nodes[side_rooms[0]]
        assert side['scenery'] == side_scenery and side['level'] == 80
        record['pocket'] = {'id': side['id'], 'level_required': 80, 'scenery': side_scenery}
    result[stage] = record
write('evidence/sumeru-domain-terrain-lua.json', result)
print('Six desert approaches, five side rooms and their level gates passed.')
