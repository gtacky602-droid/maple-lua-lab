"""Build one local review proposal from the current field-editor project."""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from .model import ROOT, DesignError, Store

MATERIALS = ROOT / 'design/field-editor/teyvat-routes-v2'
PREFIX = 'WORLDROUTE v2 local review / '
QUEUE = (
    ('CROSS', 'all'), ('LIY', 'all'), ('INA', 'all'), ('SUM', 'all'), ('FON', 'all'),
    ('NAT', 'all'), ('NOD', 'all'), ('SNE', 'all'),
    ('CHY', 'classification'), ('CHY', 'all'), ('ENK', 'all'),
    ('TUN', 'classification'), ('TUN', 'all'), ('REM', 'all'),
    ('OCH', 'classification'), ('OCH', 'all'),
    ('NOV', 'classification'), ('NOV', 'all'), ('CHM', 'all'), ('ASM', 'all'),
    ('SKY', 'all'), ('FMO', 'all'),
)
WALK = {
    'road', 'bridge_road', 'terrace_road', 'volcanic_road', 'industrial_walkway',
    'ruin_walkway', 'station_corridor', 'mountain_pass',
}
NAT_BLOCK = {'teyvat:72437', 'teyvat:72445', 'teyvat:73161'}
REVIEW_NOTE = '入口・階層の未検証候補を含む。既存の手動接続を優先し、細部はローカルUIで修正する。'


def read(path):
    return json.loads(path.read_bytes())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def pair(a, b):
    return tuple(sorted((a, b))) if a and b else None


def filtered_plan(plan, data, nodes):
    official = {f['field_id']: f for f in plan['fields']}
    reserved = {}
    reserved_ids = {}
    for record_id, edge in data['field_edges'].items():
        info = {'existing_id': record_id, 'state': 'canonical'}
        reserved[pair(edge['from_field'], edge['to_field'])] = info
        reserved_ids[record_id] = info
    for p in data['proposals'].values():
        if p['status'] != 'proposed':
            continue
        for op in p['operations']:
            if op['collection'] != 'field_edges':
                continue
            record_id = op['id']
            current = data['field_edges'].get(record_id, {})
            changes = {**current, **op.get('changes', {})}
            info = {'existing_id': record_id, 'state': 'pending', 'proposal_id': p['proposal_id']}
            reserved[pair(changes.get('from_field'), changes.get('to_field'))] = info
            reserved_ids[record_id] = info

    keep, held = [], []
    cross = {e['edge_id']: e for e in plan['crossings']}
    for e in plan['edges']:
        a, b = e['from_field'], e['to_field']
        route_id = e['edge_id']
        detail = {'edge_id': route_id, 'from': a, 'to': b, 'scope': e['scope'],
                  'crossing': e.get('crossing_id'), 'traversal': e['traversal_type']}
        collision = reserved.get(pair(a, b)) or reserved_ids.get(route_id)
        if a.startswith('slot:') or b.startswith('slot:'):
            detail['reason'] = 'unbound_slot'
        elif a not in nodes or b not in nodes:
            detail['reason'] = 'missing_official_id'
        elif e.get('crossing_id') and e != cross.get(route_id):
            raise DesignError(f'Crossing differs from the explicit whitelist: {route_id}')
        elif not e.get('crossing_id') and any(official[i]['placement_region_id'] != e['scope'] for i in (a, b)):
            raise DesignError(f'Non-CROSS route leaves its design region: {route_id}')
        elif not e.get('crossing_id') and (any(not official[i]['corridor_ids'] for i in (a, b))
                                          or (a in NAT_BLOCK) != (b in NAT_BLOCK)):
            detail['reason'] = 'entry_on_hold'
        elif any(i in official and not official[i]['corridor_ids'] for i in (a, b)):
            detail['reason'] = 'entry_on_hold'
        elif e['traversal_type'] in WALK and (
                nodes[a]['map_id'] != nodes[b]['map_id']
                or nodes[a].get('point_group') != nodes[b].get('point_group')
                or any(official.get(i, {}).get('biome') == 'underwater' for i in (a, b))):
            detail['reason'] = 'walking_without_confirmed_layer_or_water_entry'
        elif collision:
            detail.update(reason='existing_connection', **collision)
        else:
            keep.append(e)
            continue
        if collision:
            detail.update(collision)
        held.append(detail)
    return {**plan, 'edges': keep}, held


def generate(store, prefix, part):
    data = store.snapshot()
    plan, held = filtered_plan(read(MATERIALS / 'plan.json'), data, store.nodes)
    with TemporaryDirectory(prefix='maple-routes-') as tmp:
        src, subset, out = (Path(tmp) / name for name in ('live-snapshot.json', 'plan-subset.json', 'proposal.json'))
        write(src, data)
        write(subset, plan)
        args = [sys.executable, '-X', 'utf8', str(MATERIALS / 'make_editor_proposal.py'),
                '--project', str(src), '--plan', str(subset), '--region', prefix, '--part', part,
                '--include-review', '--review-note', REVIEW_NOTE, '--out', str(out), '--check-with-repo', str(ROOT)]
        if prefix != 'CROSS' and part == 'all':
            args.append('--include-challenges')
        result = subprocess.run(args, capture_output=True, encoding='utf-8', errors='replace', check=False)
        if result.returncode:
            raise DesignError(result.stderr.strip())
        proposal = read(out)

    for op in proposal['operations']:
        field_id = op['id'] if op['collection'] == 'field_definitions' else op['changes'].get('field_id')
        if data['field_definitions'].get(field_id, {}).get('region_id') in ('region-01', 'branch-01', 'branch-06'):
            raise DesignError(f'Protected Mondstadt record in regional proposal: {field_id}')
    pending = {(o['collection'], o['id']) for p in data['proposals'].values()
               if p['status'] == 'proposed' for o in p['operations']}
    pending_fields = {o.get('changes', {}).get('field_id')
                      or data['field_spawns'].get(o['id'], {}).get('field_id')
                      for p in data['proposals'].values() if p['status'] == 'proposed'
                      for o in p['operations'] if o['collection'] == 'field_spawns'}
    overlap = [(o['collection'], o['id']) for o in proposal['operations']
               if (o['collection'], o['id']) in pending
               or (o['collection'] == 'field_spawns' and o['changes'].get('field_id') in pending_fields)]
    if overlap:
        raise DesignError('Existing pending records overlap this proposal: ' + json.dumps(overlap))
    proposal['source'] = f'{PREFIX}{prefix}/{part} / ' + proposal['source']
    proposal['reason'] = f'全地域ルートv2 [{prefix}/{part}] ' + ('設計分類のレビュー' if part == 'classification' else '接続・敵配置のレビュー')
    return proposal, held


def next_step(data):
    approved = set()
    for p in data['proposals'].values():
        if not p['source'].startswith(PREFIX):
            continue
        key = p['source'][len(PREFIX):].split(' / ', 1)[0]
        if p['status'] == 'proposed':
            raise DesignError(f'未採用の地域案があります: {key} / {p["proposal_id"]} / base rev {p["base_revision"]}')
        if p['status'] == 'approved':
            approved.add(key)
    return next(((r, p) for r, p in QUEUE if f'{r}/{p}' not in approved), None)


def counts(request):
    return dict(Counter(op['collection'] for op in request['operations']))


def audit(store, target):
    raw = store.path.read_bytes()
    source_snapshot = store.snapshot()
    held = filtered_plan(read(MATERIALS / 'plan.json'), source_snapshot, store.nodes)[1]
    steps = []
    with TemporaryDirectory(prefix='maple-routes-audit-') as temp:
        copy = Path(temp) / 'project.json'
        write(copy, source_snapshot)
        sandbox = Store(copy)
        for region, part in QUEUE:
            try:
                request, _ = generate(sandbox, region, part)
                p = sandbox.propose(request)
                sandbox.approve(p['proposal_id'], p['base_revision'])
                steps.append({'region': region, 'part': part, 'base_revision': p['base_revision'],
                              'counts': counts(request)})
            except DesignError as exc:
                steps.append({'region': region, 'part': part, 'error': str(exc)})
        state = sandbox.snapshot()
        assert all(state['field_edges'].get(i) == e for i, e in source_snapshot['field_edges'].items())
        assert all(state['field_spawns'].get(i) == s for i, s in source_snapshot['field_spawns'].items())
        assert all(state['monster_variants'].get(i) == v for i, v in source_snapshot['monster_variants'].items())
        assert all(state['field_definitions'][i] == f for i, f in source_snapshot['field_definitions'].items()
                   if f['region_id'] in ('region-01', 'branch-01', 'branch-06'))
        staged_edges = [e for i, e in state['field_edges'].items() if i not in source_snapshot['field_edges']]
        staged_spawns = [s for i, s in state['field_spawns'].items() if i not in source_snapshot['field_spawns']]
        runtime = sandbox.export('all', 'runtime')
        assert not {e['edge_id'] for e in staged_edges} & runtime['field_edges'].keys()
        assert not {s['spawn_id'] for s in staged_spawns} & runtime['field_spawns'].keys()
        for e in staged_edges:
            assert e['direction'] == 'both'
            for key in ('entrance_position', 'exit_position'):
                assert e['_meta'][key]['state'] == 'unassigned'
        assert all(s['level_override'] is None for s in staged_spawns)
    assert store.path.read_bytes() == raw, 'Live project changed during audit; rerun for the new revision'
    report = {'live_revision': source_snapshot['revision'], 'steps': steps, 'held_edges': held,
              'edges_simulated': len(staged_edges), 'spawns_simulated': len(staged_spawns),
              'runtime_edge_and_spawn_additions': 0}
    write(target, report)
    print(json.dumps({k: v for k, v in report.items() if k != 'held_edges'}, ensure_ascii=False))
    return 1 if any('error' in step for step in steps) else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, type=Path, help='Absolute path to the running editor project.json')
    parser.add_argument('--audit', type=Path, help='Run all regions on a disposable copy and save the result')
    args = parser.parse_args()
    if not args.project.is_file():
        parser.error('Select the current editor project file')
    if args.audit and args.audit.resolve() == args.project.resolve():
        parser.error('The audit output cannot overwrite project.json')
    store = Store(args.project)
    if args.audit:
        return audit(store, args.audit)
    with store.lock:
        step = next_step(store.snapshot())
        if step is None:
            print('All eligible regional reviews have been adopted.')
            return 0
        revision_and_pending = store.fingerprint
        request, _ = generate(store, *step)
        store.sync()
        if store.fingerprint != revision_and_pending:
            raise DesignError('設計データまたは手動変更案が更新されました。もう一度実行してください。')
        proposal = store.propose(request)
    print(json.dumps({'region': step[0], 'part': step[1], 'base_revision': proposal['base_revision'],
                      'proposal_id': proposal['proposal_id'], 'counts': counts(request)}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (DesignError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
