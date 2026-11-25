"""Walk the remaining Sumeru forest sites and the four Tunigi elite detours."""
from tools.domain_terrain_test import check_field, nodes, read, write, write_fixture

hub = 'sumeru-hub'
for batch in ('sum-frontier', 'tun-domains'):
    scenes = read(f'assets/{batch}-background-generation.json')['scenes']
    fields = [s for s in scenes if 'atlasParent' not in nodes[s['node']]]
    hosts = [nodes[s['node']]['exits'][0]['to'] for s in fields]
    write_fixture(batch + '-terrain', 80, hub, hosts)
    results = {}
    for scene, host in zip(fields, hosts, strict=True):
        stage = scene['node']
        anchor = nodes[stage]['exits'][0]
        jump_x = 650 if anchor['x'] < 1000 else 2300
        results[stage] = check_field(stage, host, hub, 79, scene['key'], jump_x)
        for edge in nodes[stage]['exits'][1:]:
            room = nodes[edge['to']]
            assert room['atlasParent'] == stage and room['level'] == 80
            assert room['scenery'] == next(s['key'] for s in scenes if s['node']==room['id'])
            results[stage]['eliteRoom'] = {'id': room['id'], 'returnY': room['exits'][0]['arrivalY']}
    write('evidence/' + batch + '-terrain-lua.json', results)
    print(batch, len(results), 'approaches with level gates, spawn margins and round trips verified.')
