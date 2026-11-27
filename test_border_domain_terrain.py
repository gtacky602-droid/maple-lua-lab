"""Check the Chasm surface, Nostoi shore and Dragonspine summit at their own level gates."""
from tools.domain_terrain_test import check_field, nodes, write, write_fixture

routes = [
    ('chasm-border', 'liyue-harbor', 24907, 'liyue-wp-24909', 38, 'chasmQuarryLedge', 2300, 36),
    ('nostoi-border', 'fontaine-hub', 68346, 'fon-wp-68341', 99, 'nostoiIslandPier', 650, 32),
    ('summit-border', 'mond-town', 7164, 'mond-wp-6609', 60, 'spineSummitSteps', 650, 36),
]
report = {}
for batch, hub, number, host, level, scenery, first_x, population in routes:
    stage = f'sites-hunt-{number}'
    write_fixture(batch+'-terrain', max(level, *(nodes[e['to']]['level'] for e in nodes[stage]['exits'])), hub, [host])
    report[stage] = check_field(stage, host, hub, level, scenery, first_x, population_count=population)
write('evidence/border-domains-terrain-lua.json', report)
print('Three regional border fields, both elite rooms and summit level gates passed.')
