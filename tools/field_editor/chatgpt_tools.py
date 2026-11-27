"""Allowlisted ChatGPT tools over the same Store used by the editor."""
from collections import Counter

from .model import NODE_KINDS, accepted, integer, require, resolve_variant

STRING = {'type': 'string', 'minLength': 1, 'maxLength': 160}
PAGE = {
    'offset': {'type': 'integer', 'minimum': 0},
    'limit': {'type': 'integer', 'minimum': 1, 'maximum': 100},
}
EDGE_KEYS = ('from_field', 'to_field', 'direction', 'kind', 'conditions')
PROPOSAL_COLLECTIONS = ('field_definitions', 'field_edges', 'field_spawns',
                        'monster_families', 'monster_variants')
PROPOSAL_LIMIT = 50


def object_schema(properties, required=()):
    return {'type': 'object', 'properties': properties, 'required': list(required),
            'additionalProperties': False}


PROPOSAL_OPERATION = object_schema({
    'collection': {'type': 'string', 'enum': list(PROPOSAL_COLLECTIONS)},
    'id': STRING,
    'action': {'type': 'string', 'enum': ['upsert', 'delete']},
    'changes': {'type': 'object',
                'description': 'Design values for upsert. Omit for delete. To create a custom waypoint, '
                               'use field_definitions with a new waypoint-* ID, name and waypoint_position. '
                               'For new field_edges provide both field IDs, direction, kind, conditions, '
                               'exit_position, entrance_position and notes.',
                'properties': {
                    'waypoint_position': object_schema({
                        'map_id': STRING, 'x': {'type': 'number'}, 'y': {'type': 'number'},
                    }, ('map_id', 'x', 'y')),
                }},
}, ('collection', 'id'))

TOOLS = {
    'get_revision': ('Get the current authoritative field-design revision and update time.', {}, ()),
    'list_regions': ('List the eight main regions and all additional maps. Use the returned map_id with list_fields.',
                     {}, ()),
    'list_fields': ('List field IDs, map coordinates and recommended levels. map_id selects map membership, '
                    'region_id selects design region. kind filters waypoints, statues or domains. Use offset and limit to page.',
                    {'map_id': STRING, 'region_id': STRING, 'kind': {'type': 'string', 'enum': list(NODE_KINDS)}, **PAGE}, ()),
    'get_field': ('Read one field by ID, including official coordinates, map memberships, current connections, '
                  'and placed enemies with resolved levels.', {'field_id': STRING}, ('field_id',)),
    'get_connection_graph': ('Read accepted edges and node IDs, including edges that cross the selected map boundary.',
                             {'map_id': STRING, **PAGE}, ()),
    'list_monsters': ('Read monster families and registered variants with inherited values. '
                      'Use region_id to filter variants and family_id to narrow by family.',
                      {'region_id': STRING, 'family_id': STRING, **PAGE}, ()),
    'get_change_history': ('Read newest approved transactions first. Use field_id to filter and offset to page.',
                           {'field_id': STRING, **PAGE}, ()),
    'check_design': ('Inspect accepted connectivity, level guidance and placement warnings. '
                     'Use start_field_id for reachability and map_id to focus the issue list. '
                     'By default a selected map starts at its first point.',
                     {'map_id': STRING, 'start_field_id': STRING, **PAGE}, ()),
    'create_proposal': ('Save a pending change proposal for the local editor to review. '
                        'Read the current revision and resolve country and field IDs first. Use list_fields coordinates or '
                        'coordinates provided by the user for custom waypoints. A batch may add waypoints and '
                        'connect them across maps. Local approval is required for every design change.',
                        {'base_revision': {'type': 'integer', 'minimum': 0},
                         'reason': {'type': 'string', 'minLength': 1, 'maxLength': 2000},
                         'operations': {'type': 'array', 'minItems': 1, 'maxItems': PROPOSAL_LIMIT,
                                        'items': PROPOSAL_OPERATION}},
                        ('base_revision', 'reason', 'operations')),
}


def tool_list(allow_proposals):
    return [
        {'name': name, 'description': desc, 'inputSchema': object_schema(properties, required),
         'annotations': {'readOnlyHint': name != 'create_proposal', 'destructiveHint': False,
                         'idempotentHint': name != 'create_proposal', 'openWorldHint': False}}
        for name, (desc, properties, required) in TOOLS.items()
        if allow_proposals or name != 'create_proposal'
    ]


def page(rows, args):
    offset, limit = args.get('offset', 0), args.get('limit', 100)
    return {'total': len(rows), 'offset': offset, 'items': rows[offset:offset + limit],
            'next_offset': offset + limit if offset + limit < len(rows) else None}


def call_tool(store, name, args, allow_proposals):
    require(name in TOOLS and (allow_proposals or name != 'create_proposal'), 'Tool unavailable')
    _, properties, required = TOOLS[name]
    require(isinstance(args, dict) and set(required) <= args.keys() <= properties.keys(),
            'Invalid tool arguments')
    for key, value in args.items():
        if properties[key] is STRING:
            require(isinstance(value, str) and 0 < len(value) <= 160, f'Invalid {key}')
    require(integer(args.get('offset', 0), 0, 10**9), 'Invalid offset')
    require(integer(args.get('limit', 100), 1, 100), 'Invalid limit')

    if name == 'create_proposal':
        operations = args['operations']
        require(isinstance(operations, list) and 0 < len(operations) <= PROPOSAL_LIMIT,
                'Provide 1–50 operations')
        for op in operations:
            require(isinstance(op, dict) and set(op) <= {'collection', 'id', 'action', 'changes'}
                    and op.get('collection') in PROPOSAL_COLLECTIONS,
                    'Use design operations without lifecycle states')
            require(op.get('action') != 'delete' or 'changes' not in op, 'Omit changes for a delete')
        with store.lock:
            store.sync()
            proposal = None
            if type(args['base_revision']) is int and args['base_revision'] == store.data['revision']:
                proposal = next((
                    p for p in store.data['proposals'].values()
                    if p['base_revision'] == args['base_revision'] and p['status'] == 'proposed'
                    and p['actor'] == 'ChatGPT' and p['source'] == 'ChatGPT MCP'
                    and p['reason'] == args['reason'] and p['operations'] == operations
                ), None)
            if proposal is None:
                proposal = store.propose({**args, 'actor': 'ChatGPT', 'source': 'ChatGPT MCP'})
        return {**{k: proposal[k] for k in ('proposal_id', 'base_revision', 'status', 'reason')},
                'affected_field_ids': proposal['impact']['affected_fields']}

    # Keep the revision, graph report and all returned records on the same snapshot.
    # report() obtains its own snapshot, so use its revision for report responses.
    data = store.snapshot()
    revision = {'revision': data['revision']}
    fields = data['field_definitions']
    map_id, region_id = args.get('map_id'), args.get('region_id')
    maps = {m['map_id']: m for m in store.design_maps(data)}
    require(map_id is None or map_id in maps, 'Unknown map_id')
    require(region_id is None or region_id in store.regions, 'Unknown region_id')
    map_nodes = set(maps[map_id]['node_ids']) if map_id else None

    field_id = args.get('field_id')
    require(field_id is None or field_id in fields, 'Unknown field_id')
    if name == 'get_revision':
        return {**revision, 'updated_at': data['updated_at']}
    if name == 'list_regions':
        return {**revision, 'regions': [
            {**{k: m[k] for k in ('map_id', 'region_id', 'name', 'official_map_id', 'kind', 'level_guide')},
             'field_count': len(m['node_ids'])} for m in maps.values()
        ]}
    if name == 'list_fields':
        kind = args.get('kind')
        require('kind' not in args or kind in NODE_KINDS, 'Unknown field kind')
        ids = maps[map_id]['node_ids'] if map_id else fields
        rows = [
            {**{k: fields[i][k] for k in ('field_id', 'name', 'location_alias', 'region_id', 'recommended_level')},
             'official_name_ja': node.get('name_ja'),
             'official_map_id': node['map_id'],
             **{k: node[k] for k in ('x', 'y', 'kind')},
             **({'custom': True} if node.get('custom') else {})}
            for i in ids for node in [store.map_node(i, data)] if (kind is None or node['kind'] == kind) and (region_id is None or fields[i]['region_id'] == region_id)
        ]
        return {**revision, 'design_map_id': map_id, **page(rows, args)}
    if name == 'get_field':
        return {**revision, 'field': store.field(field_id, data),
                'design_map_ids': [m['map_id'] for m in maps.values() if field_id in m['node_ids']]}
    if name == 'list_monsters':
        families = data['monster_families']
        family = args.get('family_id')
        require(family is None or family in families, 'Unknown family_id')
        rows = [
            {'variant': v, 'resolved': resolve_variant(data, i)}
            for i, v in data['monster_variants'].items()
            if (region_id is None or v['region_id'] == region_id)
            and (family is None or v['family_id'] == family)
        ]
        return {**revision, 'families': [families[family]] if family else list(families.values()),
                **page(rows, args)}
    if name == 'get_change_history':
        rows = [h for h in reversed(data['design_history'])
                if field_id is None or field_id in h['field_ids']]
        return {**revision, **page(rows, args)}

    if name == 'get_connection_graph':
        edges = [e for e in data['field_edges'].values()
                 if all(accepted(e, k) for k in EDGE_KEYS)
                 and (map_nodes is None or e['from_field'] in map_nodes or e['to_field'] in map_nodes)]
        ids = set(fields) if map_nodes is None else map_nodes | {
            e[k] for e in edges for k in ('from_field', 'to_field')
        }
        return {**revision, 'design_map_id': map_id, 'node_ids': sorted(ids), **page(edges, args)}

    with store.lock:
        default_start = next(iter(maps[map_id]['node_ids']), None) if map_id else None
        report = store.report(args.get('start_field_id', default_start))
        data = store.data
        field_ids = set(data['field_definitions']) if map_nodes is None else map_nodes
        # Reuse the existing graph and level report, adding placement-level checks.
        edge_ids = {e['edge_id'] for e in data['field_edges'].values()
                    if e['from_field'] in field_ids or e['to_field'] in field_ids}
        issues = [i for i in report.pop('issues') if i['target_id'] in field_ids | edge_ids]
        for spawn in data['field_spawns'].values():
            field = spawn['field_id']
            if field not in field_ids:
                continue
            settings = data['field_definitions'][field]
            variant = resolve_variant(data, spawn['monster_id'])
            level = spawn['level_override'] if spawn['level_override'] is not None else variant.get('base_level')
            low, high = settings['enemy_level_min'], settings['enemy_level_max']
            issue = {'field_id': field, 'spawn_id': spawn['spawn_id'], 'effective_level': level}
            if level is None:
                issues.append({**issue, 'code': 'missing_enemy_level'})
            elif (low is not None and level < low) or (high is not None and level > high):
                issues.append({**issue, 'code': 'outside_field_enemy_level_range'})
            if variant['region_id'] != settings['region_id']:
                issues.append({**issue, 'code': 'variant_region_mismatch'})
        return {**report, 'design_map_id': map_id, 'issue_counts': dict(Counter(i['code'] for i in issues)),
                'issues': page(issues, args)}
