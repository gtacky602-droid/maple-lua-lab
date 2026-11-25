"""Walk the Narukami approaches, level gates and the return from each elite room."""
from tools.domain_terrain_test import check_field, nodes, write, write_fixture

hub = 'inazuma-town'
routes = [
    (12778, 47990, 650, 'inaAraumiCistern', 'inaThunderVault'),
    (12781, 12733, 650, 'inaYougouStair', 'inaRuinWorkshop'),
    (12784, 12725, 2330, 'inaByakkoMeadow', 'inaThunderaxeCamp'),
]
write_fixture('inazuma-domain-terrain', 60, hub, [f'ina-wp-{host}' for _, host, *_ in routes])
result = {}
for field, waypoint, first_x, scenery, room_scenery in routes:
    stage, host = f'sites-hunt-{field}', f'ina-wp-{waypoint}'
    room = nodes[stage + '-pocket-1']
    assert room['level'] == 60 and room['scenery'] == room_scenery
    result[stage] = check_field(stage, host, hub, 59, scenery, first_x)
    result[stage]['pocket'] = room['id']
write('evidence/inazuma-domain-terrain-lua.json', result)
print('Walked three Narukami approaches and three elite rooms with both level gates.')
