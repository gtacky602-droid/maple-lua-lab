"""Import the official Japanese 秘境 pins into the field editor's own catalogue."""
import argparse
from math import isfinite
from pathlib import Path
import json

from build_map_catalog import ROOT, load_response

OUTPUT = ROOT / 'design/field-editor/domain-sources.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'content/map-catalog.json').read_bytes())
    sources, records = {}, []
    area_names = {(a['map_id'], a['id']): a['name'] for a in catalog['areas']}
    for m in catalog['maps']:
        if not m['map_version']:
            continue
        map_id = m['id']
        data, source = load_response('domains', 'v3/map/point/list', map_id, None)
        labels = {x['id'] for x in data['label_list'] if x['name'] == '秘境'}
        points = sorted((p for p in data['point_list'] if p['display_state'] == 1 and p['label_id'] in labels),
                        key=lambda p: p['id'])
        sources[str(map_id)] = {**source, 'label_ids': sorted(labels), 'count': len(points)}
        for p in points:
            x, y, area_id = p['x_pos'], p['y_pos'], p['area_id']
            if not isfinite(x) or not isfinite(y) or (map_id, area_id) not in area_names:
                raise ValueError(f'Invalid domain {map_id}/{p["id"]}')
            prefix = 'teyvat' if map_id == 2 else f'map{map_id}'
            node = {'id': f'{prefix}:{p["id"]}', 'source_id': p['id'], 'map_id': map_id,
                    'kind': 'domain', 'x': x, 'y': y, 'area_id': area_id,
                    'region': area_names[(map_id, area_id)]}
            if p['point_group']:
                node['point_group'] = {k: p['point_group'][k] for k in ('group_id', 'floor_id')}
            records.append(node)
    if not records or len({n['id'] for n in records}) != len(records):
        raise ValueError('Invalid domain snapshot: empty or duplicate IDs')
    if args.output.exists():
        previous = json.loads(args.output.read_bytes())
        missing = {n['id'] for n in previous['nodes']} - {n['id'] for n in records}
        if missing:
            raise ValueError(f'Domain IDs missing from the latest response: {sorted(missing)}')
    args.output.write_text(json.dumps({'sources': sources, 'nodes': records}, ensure_ascii=False, indent=2) + '\n',
                           encoding='utf8')
    print(f'{len(records)} domains')


if __name__ == '__main__':
    main()
