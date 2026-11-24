"""Check catalog bindings and route structure, then create a Lv20 browser save."""
import json
from collections import Counter, defaultdict
from runtime import runtime, ROOT, native
from savegame import validate_save


def content(name):
    return json.loads((ROOT / 'content' / name).read_text(encoding='utf8'))


catalog = content('map-catalog.json')
coverage = content('coverage.json')
graph = content('story-graph.json')
stages = {stage['id']: stage for stage in graph['nodes']}
ids = set(stages)
points = {node['id']: node for node in catalog['nodes']}
areas = {(area['map_id'], area['id']): area['name'] for area in catalog['areas']}
assert len(points) == len(catalog['nodes'])
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
        for stage in layer['prototype_stage_ids']} == {'chasm-camp', 'ruin-serpent-field-pit', *(
            n['id'] for n in graph['nodes'] if n.get('mapPoint','').startswith('map9:'))}
map_coverage = coverage['map_catalog']
links = map_coverage['stage_links']
bound_stages = {node['id'] for node in stages.values() if 'mapPoint' in node}
assert map_coverage['all_imported_markers_linked']
assert map_coverage['playable_at_imported_nodes'] == len(links) == len(bound_stages) == len(points)
assert set(links) == set(points) and {row['stage_id'] for row in links.values()} == bound_stages

for marker, point in points.items():
    stage = stages[links[marker]['stage_id']]
    pin = stage['waypoint']
    assert stage['mapPoint'] == marker, marker
    assert (pin['kind'], pin.get('floor')) == (point['kind'], point.get('point_group')), marker
    x, y = pin['x'], pin['y']
    if water := stage.get('swim'):
        assert 20 <= x <= stage['width'] - 20 and water['top'] <= y <= water['bottom'], marker
    else:
        assert any(p['y'] == y and p['x'] <= x <= p['x'] + p['w'] for p in stage['platforms']), marker


def reachable(start, edges):
    visited, pending = {start}, [start]
    while pending:
        next_stages = edges[pending.pop()] - visited
        visited.update(next_stages)
        pending.extend(next_stages)
    return visited


# Route structure only. The runtime tests exercise the conditions on each regional route.
forward, reverse = defaultdict(set), defaultdict(set)
for origin, stage in stages.items():
    exits = {gate['to'] for gate in stage['exits'] if not gate.get('visitedOnly')}
    if voyage := stage.get('voyage'):
        exits.add(voyage['destination'])
    for target in exits:
        assert target in stages, (origin, target)
        forward[origin].add(target)
        reverse[target].add(origin)
start = 'mond-town'
outbound, inbound = reachable(start, forward), reachable(start, reverse)
assert not (bound_stages - outbound), sorted(bound_stages - outbound)
assert not (bound_stages - inbound), sorted(bound_stages - inbound)
assert coverage['main_route_summary']['authored_stages'] == len(ids)
assert coverage['main_route_summary']['provisional_quests'] == len(graph['quests'])

# These transfers are performed by the weekly encounter, not by a portal.
# The map audit includes them as conditional connections.
battle_transfers = {}
for match in content('weekly-boss-spawns.json')['weeklyBosses']:
    if not match.get('innerNode'):
        continue
    outer, inner = match['node'], match['innerNode']
    assert match.get('atlasTransfer') and outer in ids and inner in ids
    assert inner not in forward[outer] and outer not in forward[inner]
    battle_transfers[inner] = outer
    for a, b in ((outer, inner), (inner, outer)):
        forward[a].add(b)
        reverse[b].add(a)
all_outbound, all_inbound = reachable(start, forward), reachable(start, reverse)
assert all_outbound == ids, sorted(ids - all_outbound)
assert all_inbound == ids, sorted(ids - all_inbound)

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
evidence = {
    'start': start, 'catalog_markers': len(points), 'unique_stage_bindings': len(bound_stages),
    'reachable_in_route_graph': len(bound_stages & outbound),
    'can_return_in_route_graph': len(bound_stages & inbound),
    'authored_stages_with_outbound_and_return_routes': len(all_outbound & all_inbound),
    'battle_interior_to_entrance': battle_transfers,
    'verified_marker_fields': ['kind', 'floor', 'position_on_platform_or_in_swim_bounds'],
    'route_model': 'Stage exits, voyage arrivals and two conditional battle transfers. The 873 marker counts use only exits and voyages. No warp or visited-only gates. Gate conditions are checked separately.',
    'markers_per_map': {item['id']: item['counts'] for item in catalog['maps']},
}
(ROOT / 'evidence' / 'world-map-connectivity.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf8')
print(f'{len(points)} marker bindings, {len(all_outbound & all_inbound)} connected stages, and Lv20 fixture passed.')
