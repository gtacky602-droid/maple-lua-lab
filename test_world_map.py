"""Check world coverage and create a normal Lv20 save for the browser route test."""
import json
from collections import Counter
from runtime import runtime, ROOT, native
from savegame import validate_save


def content(name):
    return json.loads((ROOT / 'content' / name).read_text(encoding='utf8'))


catalog = content('map-catalog.json')
coverage = content('coverage.json')
graph = content('story-graph.json')
ids = {stage['id'] for stage in graph['nodes']}
areas = {(area['map_id'], area['id']): area['name'] for area in catalog['areas']}
assert len({node['id'] for node in catalog['nodes']}) == len(catalog['nodes'])
assert all(node['region'] == areas[node['map_id'], node['area_id']] for node in catalog['nodes'])
counts = Counter((node['map_id'], node['kind']) for node in catalog['nodes'])
for item in catalog['maps']:
    assert item['counts'] == {kind + 's': counts[item['id'], kind] for kind in ('waypoint', 'statue')}
review = coverage['world_map_review']
assert Counter(group['kind'] for group in review['requested_groups']) == {
    'main': 8, 'high_level_branch': 9, 'hidden_world': 3,
}
assert all(group['stage_ids'] and set(group['stage_ids']) <= ids for group in review['requested_groups'])
assert counts[9, 'waypoint'] == 15
assert {stage for layer in review['other_map_layers'] if layer['id'] == 9
        for stage in layer['prototype_stage_ids']} == {'chasm-camp', *(
            n['id'] for n in graph['nodes'] if n.get('mapPoint','').startswith('map9:'))}
assert coverage['map_catalog']['playable_at_imported_nodes'] == 15
assert coverage['main_route_summary']['authored_stages'] == len(ids)
assert coverage['main_route_summary']['provisional_quests'] == len(graph['quests'])

lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
assert state.progression.level == 20
core.enterStoryNode(state, 'liyue-harbor')
work = ROOT / 'work'
work.mkdir(exist_ok=True)
save = validate_save(native(core.checkpoint(state)))
(work / 'chasm-fixture.json').write_text(json.dumps(save), encoding='utf8')
print('Official marker IDs, scope ledger and Lv20 fixture passed')
