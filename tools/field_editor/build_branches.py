"""Refresh selected high-level map views from the official quick-location bounds."""
import json

from build_map_catalog import ROOT, load_response

MAP_DIR = ROOT / 'design/field-editor'
BRANCHES = {
    'branch-02': (2, ('242', '243'), (119, 120, 122)),
    'branch-04': (4, ('208',), (71, 72)),
    'branch-07': (11, ('293',), (152, 154, 155)),
    'branch-09': (16, ('385',), (235,)),
}


def anchors(rows):
    for row in rows:
        yield row['id'], row
        yield from anchors(row['children'])


def inside(point, bounds):
    return (bounds['l_x'] <= point['x'] <= bounds['r_x']
            and bounds['l_y'] <= point['y'] <= bounds['r_y'])


def main():
    catalog = json.loads((ROOT / 'content/map-catalog.json').read_bytes())
    all_floors = json.loads((MAP_DIR / 'floor-sources.json').read_bytes())['2']['floors']
    response, source = load_response('anchors', 'v1/map/map_anchor/list', 2, None)
    bounds = dict(anchors(response['list']))
    updates = {}
    for branch, (area, viewport_ids, group_ids) in BRANCHES.items():
        viewports = [bounds[i] for i in viewport_ids]
        if any(v['map_id'] != '2' or not (v['l_x'] < v['r_x'] and v['l_y'] < v['r_y']) for v in viewports):
            raise ValueError(f'Invalid official viewport for {branch}')
        entrances = {i for f in all_floors if f['group_id'] in group_ids for i in f['entrances']}
        points = [n['id'] for n in catalog['nodes'] if n['map_id'] == 2 and n['area_id'] == area
                  and (any(inside(n, v) for v in viewports) or n['id'] in entrances
                       or n.get('point_group', {}).get('group_id') in group_ids)]
        if not points:
            raise ValueError(f'No published points matched {branch}')
        path = MAP_DIR / 'maps' / (branch + '.json')
        entry = json.loads(path.read_bytes())
        entry.update(official_map_id=2, node_ids=points, membership_state='proposed',
                     membership_source=(f'HoYoLAB 表示範囲 {", ".join(viewport_ids)} '
                                        f'・階層グループ {", ".join(map(str, group_ids))}。'
                                        f'表示範囲による所属案。{source["url"]}'))
        updates[path] = entry
    for path, entry in updates.items():
        path.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(entry['name'], len(entry['node_ids']))


if __name__ == '__main__':
    main()
