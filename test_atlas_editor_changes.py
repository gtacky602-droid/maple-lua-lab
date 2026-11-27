"""A changed editor revision must invalidate the corresponding earlier route decisions."""

from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import build_world_atlas as atlas


def test_updated_source_routes():
    snapshot_path = 'design/world/editor-snapshot.json'
    snapshot = deepcopy(atlas.load(snapshot_path))
    edges = {edge['id']: edge for edge in snapshot['data']['edges']}
    removed = edges.pop('WORLD2-E-map7_21577--map7_21593')
    mode_edit = edges['MONROUTE-E-3-12']
    original_mode = mode_edit['mode']
    mode_edit['mode'] = 'special_gate'
    note_edit = edges['WORLD2-E-teyvat_104--teyvat_13652']
    original_note = note_edit['note']
    note_edit['note'] = '設計室で確認した船着き場を使う。'
    added = {
        'id': 'SITE-EDGE:teyvat:104:teyvat:57', 'a': 'teyvat:104', 'b': 'teyvat:57',
        'mode': 'road', 'note': '接続の取込テスト', 'source': 'sites-draft', 'status': 'proposed',
    }
    edges[added['id']] = added
    excluded = dict(added, id='SITE-EDGE:slot:NSP-01:teyvat:57', a='slot:NSP-01')
    edges[excluded['id']] = excluded
    snapshot['data']['edges'] = list(edges.values())
    snapshot['editor_revision'] += 1
    snapshot['history'].append({'revision': snapshot['editor_revision'], 'operations': [
        {'type': 'edge_delete', 'id': removed['id'], 'before': removed},
        {'type': 'edge_edit', 'id': mode_edit['id'], 'changes': {
            'mode': {'before': original_mode, 'after': mode_edit['mode']}}},
        {'type': 'edge_edit', 'id': note_edit['id'], 'changes': {
            'note': {'before': original_note, 'after': note_edit['note']}}},
        {'type': 'edge_add', 'id': added['id'], 'data': added},
        {'type': 'edge_add', 'id': excluded['id'], 'data': excluded},
    ]})

    with TemporaryDirectory(prefix='maple-atlas-editor-') as output:
        output = Path(output)
        baseline, updated = output / 'baseline.json', output / 'updated.json'
        baseline_map, updated_map = output / 'baseline-map.json', output / 'updated-map.json'
        atlas.build(baseline, baseline_map)
        unmodified_load = atlas.load
        with patch.object(atlas, 'load', side_effect=lambda file: snapshot if file == snapshot_path else unmodified_load(file)):
            atlas.build(updated, updated_map)
        original_plan = json.loads(baseline.read_bytes())
        changed_plan = json.loads(updated.read_bytes())
        assert updated_map.read_bytes() == baseline_map.read_bytes()

    def by_pair(plan):
        return {frozenset(row['fields']): row for row in plan['sites_only_route_review']}

    original_routes, routes = by_pair(original_plan), by_pair(changed_plan)
    assert changed_plan['editor_revision'] == snapshot['editor_revision']
    old_pair = frozenset([removed['a'], removed['b']])
    assert old_pair in original_routes and old_pair not in routes
    assert changed_plan['removed_editor_routes'] == original_plan.get('removed_editor_routes', []) + [
        {'id': removed['id'], 'fields': [removed['a'], removed['b']], 'mode': removed['mode']}]
    for edge in (mode_edit, added):
        row = routes[frozenset([edge['a'], edge['b']])]
        assert row['mode'] == edge['mode'] and row['terrain_note'] == edge['note']
        assert row['finding'] == 'needs_runtime_layout_review' and 'runtime_paths' not in row
    note_pair = frozenset([note_edit['a'], note_edit['b']])
    assert routes[note_pair]['runtime_paths'] == original_routes[note_pair]['runtime_paths']
    assert routes[note_pair]['terrain_note'] == note_edit['note']
    assert routes[frozenset([excluded['a'], excluded['b']])]['finding'] == 'suspended_region'


if __name__ == '__main__':
    test_updated_source_routes()
    print('Added, amended, and deleted field connections reflected in the route review')
