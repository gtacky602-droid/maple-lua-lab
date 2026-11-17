"""Import public HoYoLAB map markers used as the lab's navigation reference."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
import json
from math import isfinite
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
MAP_PAGE = 'https://act.hoyolab.com/ys/app/interactive-map/index.html'
API = 'https://sg-public-api-static.hoyolab.com/common/map_user/ys_obc'
LABELS = {2: 'statue', 3: 'waypoint'}


def load_response(name, path, map_id, response_dir):
    params = {'app_sn': 'ys_obc', 'lang': 'ja-jp'}
    if map_id is not None:
        params['map_id'] = map_id
    url = f'{API}/{path}?{urlencode(params)}'
    if response_dir:
        raw = (response_dir / f'{name}.json').read_bytes()
    else:
        request = Request(url, headers={'Referer': MAP_PAGE, 'User-Agent': 'Mozilla/5.0'})
        with urlopen(request, timeout=25) as response:
            raw = response.read()
    payload = json.loads(raw)
    if payload['retcode'] != 0:
        raise ValueError(f'{name}: HoYoLAB retcode {payload["retcode"]}')
    return payload['data'], {'url': url, 'sha256': sha256(raw).hexdigest()}


def read_map(map_id, areas, response_dir):
    info_name = 'global-info' if map_id == 2 else f'map{map_id}-info'
    points_name = 'global-raw-ja' if map_id == 2 else f'map{map_id}-points'
    info_data, info_source = load_response(info_name, 'v3/map/info', map_id, response_dir)
    markers, marker_source = load_response(points_name, 'v3/map/point/list', map_id, response_dir)
    info = info_data['info']
    if info['id'] != map_id:
        raise ValueError(f'Map {map_id}: inconsistent info')
    map_version = info['detail_v2']['map_version']
    nodes = []
    seen = set()
    for marker in markers['point_list']:
        kind = LABELS.get(marker['label_id'])
        if not kind or marker['display_state'] != 1:
            continue
        source_id = marker['id']
        area_id = marker['area_id']
        x, y = marker['x_pos'], marker['y_pos']
        if source_id in seen or area_id not in areas or not (isfinite(x) and isfinite(y)):
            raise ValueError(f'Map {map_id}, point {source_id}: duplicate or invalid data')
        seen.add(source_id)
        group = marker['point_group']
        node = {
            'id': f'teyvat:{source_id}' if map_id == 2 else f'map{map_id}:{source_id}',
            'source_id': source_id, 'map_id': map_id, 'kind': kind,
            'x': x, 'y': y, 'area_id': area_id, 'region': areas[area_id],
        }
        if group:
            node['point_group'] = {key: group[key] for key in ('group_id', 'floor_id')}
        nodes.append(node)
    nodes.sort(key=lambda node: node['source_id'])
    counts = {kind + 's': sum(node['kind'] == kind for node in nodes) for kind in LABELS.values()}
    return {
        'id': map_id, 'name': info['name'], 'map_version': map_version or None,
        'counts': counts, 'sources': {'info': info_source, 'markers': marker_source},
    }, nodes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--responses', type=Path, help='Directory containing captured JSON responses')
    args = parser.parse_args()
    response, area_source = load_response('area-labels', 'v1/map/get_area_pageLabel', 2, args.responses)
    area_rows = [{k: row[k] for k in ('id', 'name', 'map_id')} for row in response['list']]
    map_ids = sorted({row['map_id'] for row in area_rows} | {10})  # Previously released event world.
    areas = {
        mid: {row['id']: row['name'] for row in area_rows if row['map_id'] == mid}
        for mid in map_ids
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda mid: read_map(mid, areas[mid], args.responses), map_ids))
    maps = [meta for meta, _ in results]
    nodes = [node for _, entries in results for node in entries]
    if any(not meta['counts']['waypoints'] for meta in maps if meta['id'] != 10):
        raise ValueError('A map with an active area label returned no waypoints')

    # Keep map ID 2 coordinates comparable to the previous pinned snapshot.
    prior = json.loads((ROOT / 'sources/map-research/points.json').read_bytes())
    old = {point['id']: point for point in prior if point['labelId'] in LABELS}
    current = {node['source_id']: node for node in nodes if node['map_id'] == 2}
    common = old.keys() & current.keys()
    differences = sorted(source_id for source_id in common if (
        LABELS[old[source_id]['labelId']] != current[source_id]['kind']
        or abs(old[source_id]['x'] - current[source_id]['x']) > .0050001
        or abs(old[source_id]['y'] - current[source_id]['y']) > .0050001
    ))
    out = {
        'version': 2, 'source': MAP_PAGE,
        'captured_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'locale': 'ja-jp', 'scope': 'Active Japanese interactive-map areas and the former Golden Apple Archipelago listing.',
        'complete_world_verified': False,
        'areas': area_rows, 'area_source': area_source, 'maps': maps,
        'counts': {k: sum(meta['counts'][k] for meta in maps) for k in ('waypoints', 'statues')},
        'pinned_map2_comparison': {
            'shared_ids': len(common), 'added_ids': sorted(current.keys() - old.keys()),
            'missing_ids': sorted(old.keys() - current.keys()), 'differences_beyond_rounding': differences,
        },
        'nodes': nodes,
    }
    dest = ROOT / 'content/map-catalog.json'
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(out['counts'], 'from', len(maps), 'listed maps')


if __name__ == '__main__':
    main()
