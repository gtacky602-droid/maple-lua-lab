"""Update the coverage ledger from the authored story graph and map catalog."""
import json
from collections import Counter
from pathlib import Path

CONTENT = Path(__file__).resolve().parent / 'content'


def read(name):
    return json.loads((CONTENT / name).read_text(encoding='utf8'))


def rebuild():
    coverage = read('coverage.json')
    graph = read('story-graph.json')
    encounters = read('encounters.json')
    counts = encounters['counts']
    coverage['encounter_worklist'].update(
        source_entities=counts['source_entities'],candidates=counts['encounter_candidates'],
        partial=counts['partial'],complete=counts['complete'],
        complete_roster_verified=encounters['complete_roster_verified'])
    stygian = read('stygian-encounters.json')
    for status in ('partial','not_implemented'):
        coverage['stygian_summary'][status]=[row['id'] for row in stygian['encounters'] if row['status']==status]
    maps = read('map-catalog.json')
    marker_ids = {marker['id'] for marker in maps['nodes']}
    stage_by_marker = {}
    marker_by_stage = {}
    for stage in graph['nodes']:
        marker_id = stage.get('mapPoint')
        if marker_id is None:
            continue
        if marker_id not in marker_ids or marker_id in stage_by_marker:
            raise ValueError(f'{stage["id"]}: unknown or duplicate map marker {marker_id}')
        stage_by_marker[marker_id] = stage
        marker_by_stage[stage['id']] = marker_id
    links = {
        marker_id: {'stage_id': stage['id'], 'name': stage['name'],
                    'gates': [marker_by_stage[edge['to']] for edge in stage['exits']
                              if edge['to'] in marker_by_stage]}
        for marker_id, stage in sorted(stage_by_marker.items())
    }
    counts_by_region = Counter((node['region'], node['kind']) for node in maps['nodes'])
    aliases = {
        'ナド・クライ特別地域（名称未確定）': 'ナド・クライ特別地域（仮）',
        'ノヴォキッチェヴ（構造未確定）': 'ノヴォキッチェヴ（仮構造）',
    }
    stages_by_region = {}
    for stage in graph['nodes']:
        stages_by_region.setdefault(stage['region'], []).append(stage['id'])

    reviewed_groups = []
    for plan in coverage['regions']:
        name = plan['name']
        stages = stages_by_region.get(aliases.get(name, name), [])
        quests = [q['id'] for q in graph['quests'] if q['hub'] in stages]
        plan['prototype_stage_count'] = len(stages)
        plan['prototype_quest_count'] = len(quests)
        if plan['kind'] == 'main':
            plan['waypoints_status'] = 'verified official interactive-map area IDs'
            plan['official_map2_markers'] = {
                'waypoints': counts_by_region[name, 'waypoint'], 'statues': counts_by_region[name, 'statue'],
            }
        reviewed_groups.append({'id': plan['id'], 'name': name, 'kind': plan['kind'],
                                'stage_ids': stages, 'quest_ids': quests})

    coverage['map_catalog'] = {
        'status': 'official_interactive_map_markers_imported',
        'file': 'content/map-catalog.json', 'counts': maps['counts'],
        'complete_world_verified': False, 'region_assignment': 'official area IDs',
        'playable_at_imported_nodes': len(links),
        'all_imported_markers_linked': len(links) == len(maps['nodes']), 'stage_links': links,
    }
    world_design = json.loads((CONTENT.parent / 'design/world/manifest.json').read_text(encoding='utf8'))
    authored_bindings = {node['designField']: node['id'] for node in graph['nodes'] if 'designField' in node}
    total_fields = world_design['verified_counts']['fields']
    linked_fields = len(links) + len(authored_bindings)
    coverage['sites_fields'] = {
        'imported': total_fields, 'linked_to_runtime': linked_fields,
        'official_marker_bindings': len(links), 'provisional_design_bindings': dict(sorted(authored_bindings.items())),
        'awaiting_stage': total_fields - linked_fields, 'route_review': 'design/world/atlas-route-plan.json',
    }
    legends_path = 'design/world/encounters.json'
    legend_rows = json.loads((CONTENT.parent / legends_path).read_text(encoding='utf8'))['legends']
    field_specs = json.loads((CONTENT/'field-boss-spawns.json').read_text(encoding='utf-8-sig'))['fieldBosses']
    by_stage = {node['id']:node for node in graph['nodes']}
    field_stages = {id: row['stage_id'] for id, row in links.items()} | authored_bindings
    anchors = {row['encounter_id']: row['field_anchor_id'] for row in legend_rows}
    legend_bindings = {}
    for spec in field_specs:
        if spec['id'] in anchors:
            entry = field_stages[anchors[spec['id']]]
            assert spec['manualRechallenge']
            entrance_route = [entry, *spec.get('entryThrough', []), spec['node']]
            for start, end in zip(entrance_route, entrance_route[1:]):
                assert any(e['to']==end for e in by_stage[start]['exits']), (spec['id'], start, end)
                assert any(e['to']==start for e in by_stage[end]['exits']), (spec['id'], end, start)
            legend_bindings[spec['id']]=spec['node']
    coverage['optional_legend_coverage'] = {
        'basis': [legends_path, 'content/field-boss-spawns.json', 'content/story-graph.json'],
        'design_candidates': len(anchors), 'playable_prototypes': len(legend_bindings),
        'stage_by_legend': legend_bindings,
    }
    manifest_path = 'docs/quest-v1/MANIFEST.json'
    manifest = json.loads((CONTENT.parent / manifest_path).read_text(encoding='utf8'))
    design_ids = {entry['id'] for entry in manifest['growth']}
    for region in manifest['regions']:
        for prefix, key in [('M', 'main'), ('S', 'side'), ('D', 'daily')]:
            design_ids.update(f"Q-{region['code']}-{prefix}{number:02d}"
                              for number in range(1, len(region[key])+1))
    for prefix, key in [('B', 'branches'), ('H', 'hidden_worlds')]:
        for group in manifest[key]:
            group_number = group['id'].split('-')[-1]
            design_ids.update(f"Q-{prefix}{group_number}-{number:02d}"
                              for number in range(1, len(group['quests'])+1))
    if len(design_ids) != manifest['counts']['total']:
        raise ValueError('Quest design ID count does not match the index')
    design_to_runtime = {}
    daily_path = 'content/daily-quests.json'
    daily_quests = json.loads((CONTENT.parent / daily_path).read_text(encoding='utf8'))['quests']
    for quest in graph['quests'] + daily_quests:
        design_id = quest.get('designId')
        if not design_id:
            continue
        if design_id not in design_ids:
            raise ValueError(f'Unknown quest design ID: {design_id}')
        if design_id in design_to_runtime:
            raise ValueError(f'Duplicate quest design mapping: {design_id}')
        design_to_runtime[design_id] = quest['id']
    design_count = len(design_ids)
    coverage['quest_design_links'] = {
        'basis': [manifest_path, 'content/story-graph.json', daily_path],
        'design_entries': design_count,
        'linked': len(design_to_runtime),
        'without_explicit_mapping': design_count - len(design_to_runtime),
        'runtime_id_by_design_id': dict(sorted(design_to_runtime.items())),
        'scope': 'Explicit links to runtime quests only; no claim of completed or tested content.',
    }

    coverage['updated'] = maps['captured_at'][:10]
    coverage['main_route_summary'].update(authored_stages=len(graph['nodes']), provisional_quests=len(graph['quests']),
                                          daily_candidates=len(daily_quests))
    for milestone in coverage['milestones']:
        if milestone['id'] in {'world', 'quests'}:
            milestone['status'] = 'partial'

    coverage['world_map_review'] = {
        'basis': ['sources/20261113-master.md sections 4–6', 'sources/20261116-amendment.md sections 1, 7',
                  'content/map-catalog.json', 'content/story-graph.json'],
        'requested_groups': reviewed_groups,
        'requested_groups_with_proxy_stage': sum(bool(group['stage_ids']) for group in reviewed_groups),
        'other_map_layers': [
            {'id': meta['id'], 'name': meta['name'], 'markers': meta['counts'],
             'prototype_stage_ids': stages_by_region.get(meta['name'], [])}
            for meta in maps['maps'] if meta['id'] != 2
        ],
        'natlan_voyage_stage_ids': ['natlan-port', 'natlan-voyage', 'ochkanatlan-dock', 'nod-port', 'natlan-voyage-return'],
    }
    stage_ids = {node['id'] for node in graph['nodes']}
    assert set(coverage['world_map_review']['natlan_voyage_stage_ids']) <= stage_ids
    (CONTENT / 'coverage.json').write_text(json.dumps(coverage, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    print(f'{len(graph["nodes"])} authored stages, {len(graph["quests"])} prototype quests, {len(maps["nodes"])} official map markers')


if __name__ == '__main__':
    rebuild()
