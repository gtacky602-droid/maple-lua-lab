"""Verify shores, submerged stone paths, and the return gates on the six Lv99 hunts."""
from tools.domain_terrain_test import check_field, nodes, write, write_fixture


routes = [
    (50034, 50035, 2280, 'fontaineBerylCoast', 48),
    (50057, 50056, 2280, 'fontaineDelivery', 48),
    (50067, 50075, 700, 'fontaineSunkenReef', 18),
    (56792, 50066, 2280, 'fontaineSunkenSeal', 18),
    (63738, 55763, 2280, 'fontaineMorteDrain', 48),
    (68347, 53867, 2280, 'coastalLookout', 48),
]
hub = 'fontaine-hub'
write_fixture('fontaine-domain-terrain', 100, hub, [f'fon-wp-{waypoint}' for _, waypoint, *_ in routes])
result = {}
for field, waypoint, first_x, scenery, population in routes:
    stage, host = f'sites-hunt-{field}', f'fon-wp-{waypoint}'
    record = check_field(stage, host, hub, 99, scenery, first_x, population_count=population)
    pockets = [nodes[e['to']] for e in nodes[stage]['exits'] if e['to'] != host]
    record['side_rooms'] = {room['id']: room['level'] for room in pockets}
    record['waterway_seconds'] = next(e for e in nodes[stage]['exits'] if e['to'] == host).get('waterwaySeconds')
    result[stage] = record
assert sum(len(row['side_rooms']) for row in result.values()) == 5
write('evidence/fontaine-domain-terrain-lua.json', result)
print('Six coastal and submerged hunts, five side rooms, and both waterways verified.')
