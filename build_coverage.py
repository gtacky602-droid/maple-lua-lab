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
    maps = read('map-catalog.json')
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
        'playable_at_imported_nodes': 0,
    }
    coverage['updated'] = maps['captured_at'][:10]
    coverage['main_route_summary'].update(authored_stages=len(graph['nodes']), provisional_quests=len(graph['quests']))
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
        'natlan_voyage_stage_ids': ['natlan-port', 'natlan-voyage', 'ochkanatlan-dock', 'nod-port'],
    }
    stage_ids = {node['id'] for node in graph['nodes']}
    assert set(coverage['world_map_review']['natlan_voyage_stage_ids']) <= stage_ids
    (CONTENT / 'coverage.json').write_text(json.dumps(coverage, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    print(f'{len(graph["nodes"])} authored stages, {len(graph["quests"])} prototype quests, {len(maps["nodes"])} official map markers')


if __name__ == '__main__':
    rebuild()
