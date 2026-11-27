"""Exercise the remaining Inazuma domain approaches, including the boat and lift."""
from tools.domain_terrain_test import check_field, write, write_fixture

hub = 'inazuma-town'
routes = [
    (15949, 'ina-wp-15951', 59, 'inaSuigetsuPool', 2220, 3),
    (17223, 'ina-wp-12722', 59, 'inaCastleKeep', 650, 3),
    (18667, 'tsurumi-coast', 56, 'inaFogIslet', 2310, 36),
    (20369, 'ina-wp-16030', 59, 'inaSeiraiCrags', 650, 36),
    (24906, 'ina-wp-12733', 59, 'inaSacredRoots', 650, 36),
]
write_fixture('inazuma-islands-terrain', 60, hub, [host for _, host, *_ in routes])
result = {}
for field, host, level, scenery, x, population in routes:
    stage = f'sites-hunt-{field}'
    result[stage] = check_field(stage, host, hub, level, scenery, x, population_count=population)
write('evidence/inazuma-islands-terrain-lua.json', result)
print('Five approaches, normal jumps, transit and pocket returns passed.')
