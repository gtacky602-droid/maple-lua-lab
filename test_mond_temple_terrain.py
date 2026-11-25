"""Traverse Mondstadt's six remaining temple approaches and optional rooms."""
from tools.domain_terrain_test import check_field, nodes, read, write, write_fixture

hub = 'mond-town'
routes = [
    (7149, 'mond-wp-14', 13, 'mondFrostRavine', 2230),
    (7157, 'mond-road', 13, 'mondFalconTemple', 610),
    (7186, 'mond-wp-18', 13, 'mondLionTemple', 610),
    (7201, 'mond-wp-7', 13, 'mondSummerCourt', 610),
    (7206, 'mond-wp-7', 13, 'mondWolfTemple', 610),
    (7210, 'mond-wp-17', 14, 'mondEagleCape', 2230),
]
write_fixture('mond-temples-terrain', 15, hub, [host for _, host, *_ in routes])
report = {}
for field, host, level, scenery, x in routes:
    stage = f'sites-hunt-{field}'
    report[stage] = check_field(stage, host, hub, level, scenery, x)
candidates = {node['id']: node['scenery'] for node in nodes.values()
              if node['region'] == 'モンド' and node['id'].startswith('sites-hunt-')}
measured = {scene['node']: scene['key'] for batch in ('mond-ruins','mond-temples')
            for scene in read(f'assets/{batch}-background-generation.json')['scenes']}
assert candidates == measured
report['coverage'] = {'huntFields': sum('-pocket-' not in id for id in candidates),
                      'sideRooms': sum('-pocket-' in id for id in candidates)}
write('evidence/mond-temples-terrain-lua.json', report)
print('Six fields traversed and both Mondstadt scenery batches matched the live stage graph.')
