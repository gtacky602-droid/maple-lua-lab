"""Walk the four Lv79 rainforest hunts, including both directions of every Lv80 detour."""
from tools.domain_terrain_test import check_field, nodes, write, write_fixture

hub = 'sumeru-hub'
routes = [
    (28751, 28749, 650, 'sumFungalGrove', 'sumSporeHollow'),
    (28754, 28729, 2380, 'sumFieldStation', 'sumServiceBay'),
    (28755, 28721, 2380, 'sumMossGate', 'sumSentinelCourt'),
    (28757, 28717, 2380, 'sumFernRavine', 'sumCanopyHangar'),
]
write_fixture('sumeru-forest-terrain', 80, hub, [f'sum-wp-{host}' for _, host, *_ in routes])
result = {}
for field, waypoint, x, scenery, room_scenery in routes:
    stage, host = f'sites-hunt-{field}', f'sum-wp-{waypoint}'
    room = nodes[stage + '-pocket-1']
    assert room['scenery'] == room_scenery and room['level'] == 80
    result[stage] = check_field(stage, host, hub, 79, scenery, x)
    result[stage]['pocket'] = room['id']
write('evidence/sumeru-forest-terrain-lua.json', result)
print('Four rainforest hunts, all jumps, entry gates, arrivals and return paths passed.')
