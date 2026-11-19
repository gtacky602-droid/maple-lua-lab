"""Build the Lua atlas positions from the reviewed design and authored runtime graph."""

from collections import defaultdict, deque
import json
from math import cos, pi, sin
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 900, 500
STYLE = {
    'region-01': ('grove', 565, 212), 'region-02': ('stone', 454, 352),
    'region-03': ('isles', 742, 414), 'region-04': ('desert', 286, 346),
    'region-05': ('water', 332, 221), 'region-06': ('ember', 142, 309),
    'region-07': ('moon', 389, 117), 'region-08': ('snow', 544, 79),
    'branch-01': ('snow',), 'branch-02': ('stone',), 'branch-03': ('cavern',),
    'branch-04': ('desert',), 'branch-05': ('water',), 'branch-06': ('grove',),
    'branch-07': ('ember',), 'branch-08': ('moon',), 'branch-09': ('snow',),
    'hidden-01': ('isles',), 'hidden-02': ('grove',), 'hidden-03': ('moon',),
    'official-area-6': ('cavern',), 'official-area-12': ('water',),
    'official-area-14': ('ember',), 'official-area-15': ('moon',),
}
REGION_ALIASES = {
    'モンド': 'region-01', 'ナド・クライ特別地域（仮）': 'branch-08',
    'ノヴォキッチェヴ（仮構造）': 'branch-09', '翼の峰': 'region-08',
}
VOYAGE_REGIONS = {'liyue-ferry': 'region-02', 'natlan-voyage': 'region-06'}
WALK_MODES = {'road', 'trail', 'stairs', 'slope', 'town_street', 'ruin_walkway', 'bridge_road'}


def load(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def region_rows():
    rows = load('design/world/regions.json')['regions']
    return {row['id']: row for row in rows}


def embed_anchors(fields, stages):
    """Fit real map coordinates if present. Leave positions of virtual fields explicit."""
    known = {row['field_id']: row['map_anchor'] for row in fields
             if row['map_anchor']['x'] is not None and row['map_anchor']['y'] is not None}
    anchors = {}
    if known:
        xs = [row['x'] for row in known.values()]
        ys = [row['y'] for row in known.values()]
        factor = min(735 / max(1, max(xs) - min(xs)), 385 / max(1, max(ys) - min(ys)))
        midx, midy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        anchors = {id: [round(WIDTH/2 + (point['x'] - midx)*factor, 1),
                        round(HEIGHT/2 + (point['y'] - midy)*factor, 1)]
                   for id, point in known.items()}
    adj = defaultdict(list)
    for node in stages.values():
        for edge in node['exits']:
            if edge['to'] in stages:
                adj[node['id']].append(edge['to'])
                adj[edge['to']].append(node['id'])
    return anchors, adj


def positions(fields, stages):
    anchors, adj = embed_anchors(fields, stages)
    placed = {node['id']: anchors[field] for node in stages.values()
              if (field := node.get('mapPoint') or node.get('designField')) in anchors}
    placed.update({node['id']: node['atlasPosition'] for node in stages.values() if 'atlasPosition' in node})
    if not placed and stages:
        origin = next((node['id'] for node in stages.values() if node['hub']), next(iter(stages)))
        placed[origin] = [170, 235]
    queue = deque(placed)
    while queue:
        source = queue.popleft()
        x, y = placed[source]
        pending = sorted(set(adj[source]) - placed.keys())
        for i, id in enumerate(pending):
            angle = (((sum(ord(c) for c in id) % 360) + i*137) / 180)*pi
            distance = 38 if stages[id].get('atlasParent') == source else 57
            placed[id] = [round(max(48, min(852, x+distance*cos(angle))), 1),
                          round(max(48, min(452, y+distance*sin(angle))), 1)]
            queue.append(id)
    # Some auxiliary instances join via cutscenes, fast travel or another region.
    for i, id in enumerate(sorted(stages.keys()-placed.keys())):
        placed[id] = [75+(i%13)*60, 430-(i//13)*42]
    return anchors, placed


def reachable(nodes, reverse=False):
    edges = defaultdict(set)
    for node in nodes.values():
        targets = {e['to'] for e in node['exits'] if not e.get('visitedOnly')}
        if voyage := node.get('voyage'):
            targets.add(voyage['destination'])
        for target in targets:
            a, b = (target, node['id']) if reverse else (node['id'], target)
            edges[a].add(b)
    visited = {'mond-town'}
    queue = deque(visited)
    while queue:
        next_stages = edges[queue.popleft()] - visited
        visited.update(next_stages)
        queue.extend(next_stages)
    return visited


def local_path(nodes, start, end, allowed_regions, stage_regions):
    """Find a local, ungated detour and keep the peak requirement near the endpoints."""
    for buffer in (0, 2):
        level = max(nodes[start]['level'], nodes[end]['level']) + buffer
        queue = deque([(start, [start])])
        seen = {start}
        while queue:
            id, path = queue.popleft()
            if id == end:
                return path
            if len(path) >= 10:
                continue
            for edge in nodes[id]['exits']:
                target = edge['to']
                if target in seen or stage_regions[target] not in allowed_regions:
                    continue
                if any(key in edge for key in ('requires', 'visitedOnly', 'windowStart', 'requiresArrival',
                                               'darkOnly', 'roofTrialStage')):
                    continue
                node = nodes[target]
                if node['level'] > level or node.get('hiddenGroup') or node.get('revealAfter') or node.get('voyage'):
                    continue
                queue.append((target, path+[target]))
                seen.add(target)
    return None


def approach(field, region, stages, positions, anchored, source_edges, source_fields):
    """Suggest a returnable entrance without treating nearby coordinates as a road."""
    id = field['field_id']
    marker = field['map_anchor']
    stage_by_field = {n['mapPoint']: n for n in stages.values() if 'mapPoint' in n}
    if id not in anchored:
        target = min(stages.values(), key=lambda n: (not n['hub'], abs(n['level']-(field['level'] or region['low']))))
        method = 'local_route'
    else:
        specified = [edge for edge in source_edges[id] if edge['mode'] == 'field_approach'
                     and edge['target'] in stage_by_field]
        if specified:
            target = stage_by_field[specified[0]['target']]
            method = 'approach_from_source'
        else:
            x, y = anchored[id]
            def fit(node):
                candidate = source_fields.get(node.get('mapPoint'), {})
                same_map = candidate.get('map') == marker['map_id']
                same_floor = marker['point_group'] and marker['point_group'] == candidate.get('point_group')
                nx, ny = positions[node['id']]
                return (not same_map, not same_floor, bool(node.get('swim')),
                        (nx-x)**2 + (ny-y)**2, abs(node['level']-(field['level'] or region['low'])))
            target = min(stages.values(), key=fit)
            method = 'needs_entrance_review'
    if source_fields[id].get('role') == 'hold' or id == 'teyvat:98500':
        method = 'needs_entrance_review'
    if target.get('swim'):
        method='needs_water_transition' if method != 'needs_entrance_review' else method
    return {'field':id,'anchor':target['id'],'method':method,
            'minimum_to_approach':target['level'],'recommended':field['level'],
            'terminus':True,'runtime_gate':False}


def build():
    graph = load('content/story-graph.json')
    regions = region_rows()
    coverage = load('content/coverage.json')
    official_links = coverage['map_catalog']['stage_links']
    fields_by_region = {id: load(f'design/world/placements/{id}.json')['fields'] for id in regions}
    all_fields = {f['field_id']: f for fields in fields_by_region.values() for f in fields}
    imported = load('design/world/editor-snapshot.json')['data']
    source_fields = {row['id']: row for row in imported['fields']}
    source_edges = defaultdict(list)
    for edge in imported['edges']:
        source_edges[edge['a']].append({**edge,'target':edge['b']})
        source_edges[edge['b']].append({**edge,'target':edge['a']})
    nodes = {node['id']: node for node in graph['nodes']}
    designed_links = {node['designField']: {'stage_id': node['id']} for node in nodes.values() if 'designField' in node}
    assert len(designed_links) == sum('designField' in node for node in nodes.values())
    assert set(designed_links) <= all_fields.keys() and not (official_links.keys() & designed_links.keys())
    assert not any(node.get('mapPoint') for node in nodes.values() if 'designField' in node)
    field_links = official_links | designed_links
    returnable = reachable(nodes) & reachable(nodes, reverse=True)
    region_for_name = {row['name']: id for id, row in regions.items()} | REGION_ALIASES
    stages_by_region = defaultdict(dict)
    mapped_stage = {}
    for node in graph['nodes']:
        field = all_fields.get(node.get('mapPoint') or node.get('designField'))
        if parent := node.get('atlasParent'):
            source = nodes[parent]
            field = all_fields[source.get('designField') or source['mapPoint']]
        region = field['design_region_id'] if field else VOYAGE_REGIONS.get(node['id'], region_for_name.get(node['region']))
        if region:
            stages_by_region[region][node['id']] = node
            mapped_stage[node['id']] = region

    entries, proposals = [], []
    for id, row in regions.items():
        theme, *overview = STYLE[id]
        fields, stages = fields_by_region[id], stages_by_region[id]
        anchored, located = positions(fields, stages)
        points = []
        for node_id, node in stages.items():
            field = all_fields.get(node.get('mapPoint') or node.get('designField'))
            floor = field['map_anchor']['point_group'] if field else None
            layer = 'water' if node.get('swim') else 'below' if floor or node.get('waypoint', {}).get('floor') else 'surface'
            points.append({'id': node_id, 'x': located[node_id][0], 'y': located[node_id][1],
                           'layer': node.get('atlasLayer', layer),
                           **({'provisional': True} if node.get('designField') or node.get('atlasParent') else {}),
                           **({'entrancePending': True} if node.get('atlasEntrancePending') else {}),
                           **({'recommended': field['level'], 'field': field['field_id']} if field else {})})
        # Imported design points missing a runtime assignment are available in the review layer.
        draft = []
        virtual = [field for field in fields if field['field_id'] not in anchored]
        candidates = {key:value for key,value in stages.items() if key in returnable}
        for field in fields:
            field_id = field['field_id']
            if field_id in field_links:
                continue
            proposal = approach(field,row,candidates,located,anchored,source_edges,source_fields)
            if field_id in anchored:
                x, y = anchored[field_id]
            else:
                i = virtual.index(field)
                x, y = 190 + (i%8)*71, 260 + (i//8)*55
            anchor = proposal['anchor']
            draft.append({'id':field_id,'name':field['name'],'level':field['level'],'x':x,'y':y,
                          'anchor':anchor,'anchorX':located[anchor][0],'anchorY':located[anchor][1],
                          'review':proposal['method']})
            proposals.append(proposal)
        entries.append({'id':id, 'name':row['name'], 'kind':row['kind'], 'low':row['low'], 'high':row['high'],
                        'theme':theme, 'overview':overview, 'points':points, 'draft':draft})

    expected = {id for id in all_fields if id not in field_links}
    assert len(all_fields) == 979 and len(official_links) == 873
    assert {p['id'] for r in entries for p in r['draft']} == expected
    assert {p['field'] for r in entries for p in r['points'] if 'field' in p} == set(field_links)
    assert len(mapped_stage) == len(graph['nodes'])
    assert {p['anchor'] for p in proposals} <= returnable
    assert all(stage['stage_id'] in returnable for stage in designed_links.values())
    ledger = load('design/world/reconciliation.json')
    review = []
    lab_routes = load('sources/map-research/sites-slot-trails.json')['routes'] if designed_links else []
    implemented = {frozenset(route['fields']) for route in lab_routes}
    geographic = load('sources/map-research/sites-geographic-fields.json')['routes']
    for route in geographic:
        field, anchor = route['field'], route['anchor_field']
        stage, host = route['stage'], route['approach']
        assert field_links[field]['stage_id'] == stage and field_links[anchor]['stage_id'] == host
        assert any(exit['to']==stage for exit in nodes[host]['exits'])
        assert any(exit['to']==host for exit in nodes[stage]['exits'])
        implemented.add(frozenset((field, anchor)))
    layer_review = load('sources/map-research/sites-layer-trails.json')
    source_by_pair = {frozenset((edge['a'],edge['b'])): edge for edge in imported['edges']}
    authored_paths = {}
    corridor_review = load('sources/map-research/sites-main-corridors.json')
    pending_reasons = {frozenset(pair): kind for kind, pairs in corridor_review['pending'].items() for pair in pairs}
    new_routes = layer_review['routes'] + corridor_review['routes']
    for route in new_routes:
        pair = frozenset(route['fields'])
        stages = route['stages']
        assert [field_links[field]['stage_id'] for field in route['fields']] == [stages[0], stages[-1]]
        assert source_by_pair[pair]['id'] == route['source_edge']
        for start, end in zip(stages, stages[1:]):
            assert any(edge['to']==end for edge in nodes[start]['exits'])
            assert any(edge['to']==start for edge in nodes[end]['exits'])
        assert pair not in authored_paths
        authored_paths[pair] = stages
    retained = {frozenset(route['fields']): route for route in layer_review['retained_detours']}
    for site in layer_review['exterior_approaches']:
        field, anchor = site['field'], site['anchor_field']
        stage, host = site['stage'], site['approach']
        assert source_fields[field]['role'] == 'hold' and site['source_entrance'] == 'unverified'
        assert field_links[field]['stage_id'] == stage and field_links[anchor]['stage_id'] == host
        assert nodes[stage]['atlasEntrancePending'] and nodes[stage]['peaceful']
        assert [e['to'] for e in nodes[stage]['exits']] == [host]
        assert any(e['to']==stage for e in nodes[host]['exits'])
    for a,b in ledger['sites_only_route_pairs']:
        source = source_by_pair[frozenset((a,b))]
        data = [all_fields[id] for id in (a,b)]
        floors = [f['map_anchor']['point_group'] for f in data]
        level_a, level_b = (f['level'] for f in data)
        floor_change = floors[0] != floors[1]
        level_gap = level_a is not None and level_b is not None and abs(level_a-level_b)>8
        pair = frozenset((a,b))
        paths = {}
        note = source.get('note','')
        if pair in authored_paths:
            finding = 'implemented_as_lab_route'
            forward = authored_paths[pair]
            if forward[0] != field_links[a]['stage_id']:
                forward = forward[::-1]
            paths = {'forward': forward, 'return': forward[::-1]}
        elif pair in implemented:
            finding='implemented_as_lab_route'
        elif a not in field_links or b not in field_links:
            finding='needs_stage_binding'
        elif pair in retained:
            finding = 'use_existing_regional_detour'
            forward = retained[pair]['stages']
            if forward[0] != field_links[a]['stage_id']:
                forward = forward[::-1]
            assert (forward[0],forward[-1]) == (field_links[a]['stage_id'],field_links[b]['stage_id'])
            assert all(any(edge['to']==end for edge in nodes[start]['exits']) and
                       any(edge['to']==start for edge in nodes[end]['exits']) for start,end in zip(forward,forward[1:]))
            paths = {'forward':forward, 'return':forward[::-1]}
            note = retained[pair]['reason']
        else:
            start, end = (field_links[field]['stage_id'] for field in (a,b))
            allowed_regions = {mapped_stage[start],mapped_stage[end]}
            forward = local_path(nodes,start,end,allowed_regions,mapped_stage)
            back = local_path(nodes,end,start,allowed_regions,mapped_stage)
            if forward and back:
                paths = {'forward':forward, 'return':back}
                finding = 'use_existing_geo_route'
                if source['mode'] in WALK_MODES and (floor_change or level_gap):
                    finding = 'use_existing_local_detour' if floor_change else 'use_existing_level_route'
            else:
                finding = 'unverified_travel_choice'
        review.append({'fields':[a,b],'mode':source['mode'],'finding':finding,
                       'terrain_note':note, **({'runtime_paths':paths} if paths else {}),
                       **({'review_focus':pending_reasons[pair]} if pair in pending_reasons and not paths else {})})
    walkthrough_levels = []
    for field, data in field_links.items():
        spec, stage = all_fields[field], nodes[data['stage_id']]
        if stage['level'] == spec['level']:
            continue
        walkthrough_levels.append({'field':field,'stage':stage['id'],'access':stage['level'],
            'recommended':spec['level'],'safe':spec['mode']=='safe'})
    cases = [
        {'fields':['teyvat:95799','teyvat:95803'],'decision':'use_existing_water_and_lift_via_port',
         'stages':['mond-wp-95799','mond-wp-95797','mond-wp-95798','mond-wp-95803']},
        {'fields':['teyvat:95795','teyvat:98500'],'decision':'use_provisional_exterior_via_statue',
         'stages':['mond-wp-95795','mond-wp-95782','sites-lookout-98500'],
         'reason':'The existing hillside route leads to the exterior lookout. The original entrance remains unverified.'},
    ]
    plan = {'live_bound_fields':len(field_links),'imported_fields':len(all_fields),
            'official_fields':len(official_links),'provisional_layout_fields':len(designed_links),
            'draft_field_approaches':proposals,'sites_only_route_review':review,
            'level_differences':walkthrough_levels,'manual_cases':cases,
            'unverified_entrance_exteriors':layer_review['exterior_approaches'],
            'scope':'Exterior lookouts are playable prototypes. The source entrances remain unverified. Level recommendations do not override quest gates.'}
    (ROOT/'design/world/atlas-route-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    output = ROOT / 'content/world-atlas.json'
    lines = ',\n'.join('    '+json.dumps(row,ensure_ascii=False,separators=(',',':')) for row in entries)
    size = json.dumps([WIDTH, HEIGHT], separators=(',', ':'))
    output.write_text('{"size":'+size+',"regions":[\n'+lines+'\n]}\n',encoding='utf8')
    print(f'{len(entries)} atlas regions, {len(mapped_stage)} live stages, {len(expected)} design-only fields')


if __name__ == '__main__':
    build()
