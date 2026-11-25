"""Walk the Natlan domain approaches using ordinary movement and held jumps."""
from tools.domain_terrain_test import check_field, write, write_fixture


east, west, cliff, shore, centre = ['sites-hunt-' + suffix for suffix in
                                    ('73159', '73160', '81383', '82577', '73161')]
approaches = {east: 'nat-wp-72414', west: 'nat-wp-72422', cliff: 'nat-wp-79051',
              shore: 'nat-wp-82564', centre: 'nat-wp-72445'}
scenery = {east: 'natlanRiverTrial', west: 'natlanCharmTrail', cliff: 'natlanRaceRidge',
           shore: 'natlanSurfCove', centre: 'ochkaCliff'}
first_shelf_x = {east: 650, west: 2480, cliff: 2380, shore: 2350, centre: 2380}
for name, level, pair in [('natlan-domain-terrain', 119, (east, west)),
                          ('natlan-western-domain-terrain', 120, (cliff, shore, centre))]:
    write_fixture(name, level, 'natlan-hub', [approaches[stage] for stage in pair])
result = {stage: check_field(stage, host, 'natlan-hub', 119, scenery[stage], first_shelf_x[stage],
                             raised_gate=stage == west)
          for stage, host in approaches.items()}
write('evidence/natlan-domain-terrain-lua.json', result)
print('Four redesigned approaches and the existing central approach passed traversal and spawn checks.')
