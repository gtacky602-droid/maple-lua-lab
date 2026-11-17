"""Snapshot the official overlays for map layers linked to existing navigation points."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

from build_map_catalog import ROOT, load_response
from .model import floor_image_url

OUTPUT = ROOT / 'design/field-editor/floor-sources.json'
def read_floors(map_id, nodes, response_dir):
    response, source = load_response(f'floors-{map_id}', 'v2/map/point_group', map_id, response_dir)
    ids = {n['source_id']: n['id'] for n in nodes}
    groups = {n['point_group']['group_id'] for n in nodes if n.get('point_group')}
    floors = []
    for group in response['list']:
        if group['map_id'] != map_id:
            raise ValueError(f'Wrong source map for group {group["id"]}')
        if group['id'] not in groups and not any(set(f['entrance_ids']) & ids.keys() for f in group['floors']):
            continue
        for floor in group['floors']:
            overlay = floor.get('overlay') or {}
            url = overlay.get('url', '')
            if not url:
                continue
            if not floor_image_url(url):
                raise ValueError(f'Unexpected overlay URL for floor {floor["id"]}')
            x, y, right, bottom = (overlay[k] for k in ('l_x', 'l_y', 'r_x', 'r_y'))
            if not x < right or not y < bottom:
                raise ValueError(f'Invalid coordinates for floor {floor["id"]}')
            floors.append({
                'id': floor['id'], 'group_id': group['id'],
                'name': floor['floor_name'] or f'階層 {floor["id"]}',
                'url': url, 'bounds': [x, y, right, bottom],
                'entrances': [ids[i] for i in floor['entrance_ids'] if i in ids],
            })
    if len({f['id'] for f in floors}) != len(floors):
        raise ValueError(f'Duplicate floor ID on map {map_id}')
    return str(map_id), {'source': source, 'floors': sorted(floors, key=lambda f: f['id'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--responses', type=Path, help='Directory of raw floors-<id>.json API responses')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'content/map-catalog.json').read_bytes())
    nodes = {m['id']: [] for m in catalog['maps']}
    domain_path = ROOT / 'design/field-editor/domain-sources.json'
    domains = json.loads(domain_path.read_bytes())['nodes'] if domain_path.exists() else []
    for node in catalog['nodes'] + domains:
        nodes[node['map_id']].append(node)
    with ThreadPoolExecutor(max_workers=4) as workers:
        maps = dict(workers.map(lambda mid: read_floors(mid, nodes[mid], args.responses), nodes))
    if not any(m['floors'] for m in maps.values()):
        raise ValueError('No floor overlays returned; check upstream before replacing the snapshot')
    if args.output.exists():
        previous = json.loads(args.output.read_bytes())
        missing = [mid for mid, entry in previous.items() if entry['floors'] and not maps.get(mid, {}).get('floors')]
        if missing:
            raise ValueError('Previously available floors missing on map(s): ' + ', '.join(missing))
    payload = json.dumps(maps, ensure_ascii=False, indent=2) + '\n'
    args.output.write_text(payload, encoding='utf8')
    print({mid: len(m['floors']) for mid, m in maps.items()})


if __name__ == '__main__':
    main()
