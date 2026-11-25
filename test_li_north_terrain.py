"""Play through the new northern Liyue hunting grounds and their optional elite gates."""
from tools.domain_terrain_test import check_field, nodes, write, write_fixture

routes = [
    ('sites-hunt-7114', 'liyue-wp-39', 'liyueAocangRidge'),
    ('sites-hunt-7116', 'liyue-wp-42', 'liyueJueyunPool'),
    ('sites-hunt-7121', 'oceanid-approach', 'liyueNorthLakeshore'),
]
hub = 'liyue-harbor'
write_fixture('li-north-terrain', 40, hub, [host for _, host, _ in routes])
result = {stage: check_field(stage, host, hub, 38, scenery, 610)
          for stage, host, scenery in routes}
for stage, height in [('sites-hunt-7114', 390), ('sites-hunt-7121', 480)]:
    entry = nodes[stage]['exits'][1]
    back = nodes[entry['to']]['exits'][0]
    assert entry.get('y', 480) == back['arrivalY'] == height
    assert entry['x'] == back['arrivalX']
    result[stage]['eliteReturnHeight'] = height
write('evidence/li-north-terrain-lua.json', result)
print('Walked all three Liyue approaches in both directions and returned from both elite rooms.')
