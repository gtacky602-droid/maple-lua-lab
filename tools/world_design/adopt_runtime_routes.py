"""Materialize an adopted Field Studio revision as provisional Lua field gates."""

import json
import re
from collections import defaultdict
from pathlib import Path

from build_world_atlas import reachable

ROOT = Path(__file__).resolve().parents[2]
DECODER = json.JSONDecoder()
WHITESPACE = re.compile(r'\s*')
GATE_CONDITIONS = ('requires', 'darkOnly', 'hideUntilAllowed', 'visitedOnly', 'roofTrialStage',
                   'windowStart', 'windowEnd', 'requiresArrival', 'loopOnce')


def read(path):
    return json.loads((ROOT / path).read_bytes())


def value_ranges(text, start):
    """Iterate the JSON members of an object without rewriting its other fields."""
    pos = start + 1
    while True:
        pos = WHITESPACE.match(text, pos).end()
        if text[pos] == '}':
            return
        key, end = DECODER.raw_decode(text, pos)
        value_start = WHITESPACE.match(text, WHITESPACE.match(text, end).end() + 1).end()
        _, value_end = DECODER.raw_decode(text, value_start)
        yield key, value_start, value_end
        pos = WHITESPACE.match(text, value_end).end()
        if text[pos] == '}':
            return
        pos += 1


def write_exits(path, text, updated):
    nodes_start = next(start for key, start, _ in value_ranges(text, 0) if key == 'nodes')
    pos = nodes_start + 1
    edits = []
    while True:
        pos = WHITESPACE.match(text, pos).end()
        if text[pos] == ']':
            break
        node, end = DECODER.raw_decode(text, pos)
        if node['id'] in updated:
            start, stop = next((start, stop) for key, start, stop in value_ranges(text, pos) if key == 'exits')
            linefeed = '\n' in text[start:stop]
            encoded = json.dumps(updated[node['id']], ensure_ascii=False,
                                 indent=2 if linefeed else None, separators=None if linefeed else (',', ':'))
            if linefeed:
                indentation = len(re.match(r' *', text[text.rfind('\n', 0, start) + 1:]).group())
                encoded = encoded.replace('\n', '\n' + ' ' * indentation)
            edits.append((start, stop, encoded))
        pos = end
        pos = WHITESPACE.match(text, pos).end()
        if text[pos] == ',':
            pos += 1
    parts, offset = [], 0
    for start, stop, encoded in edits:
        parts.extend((text[offset:start], encoded))
        offset = stop
    parts.append(text[offset:])
    path.write_text(''.join(parts), encoding='utf8', newline='\n')


def gate_position(node, prefer_right):
    width = node['width']
    preferred = width - 120 if prefer_right else 120
    swim = node.get('swim')
    y = swim['entryY'] if swim else 480
    ground = [part for part in node['platforms'] if part['y'] == y]
    candidates = []
    for x in range(94, width - 93, 28):
        if not swim and not any(p['x'] + 56 <= x <= p['x'] + p['w'] - 56 for p in ground):
            continue
        if any(w['y'] < y < w['y'] + w['h'] and w['x'] - 45 < x < w['x'] + w['w'] + 45
               for w in node.get('solids', [])):
            continue
        distance = min((abs(x - edge['x']) for edge in node['exits']
                        if abs(y - edge.get('y', 480)) < 60), default=width)
        if distance >= 28:
            candidates.append((min(170, distance), -abs(x - preferred), -x))
    if not candidates:
        raise ValueError(f'No reachable provisional gate position in {node["id"]}')
    return -max(candidates)[2], y


def build():
    snapshot = read('design/world/editor-snapshot.json')
    adoption = snapshot['history'][-1]
    if not adoption.get('route_adoption'):
        raise ValueError('The newest accepted editor revision must contain reviewed routes.')
    path = ROOT / 'content/story-graph.json'
    raw = path.read_text(encoding='utf8')
    graph = json.loads(raw)
    nodes = {node['id']: node for node in graph['nodes']}
    before_returnable = reachable(nodes) & reachable(nodes, reverse=True)
    stages = {node.get('mapPoint') or node.get('designField'): node for node in nodes.values()}
    fields = {field['id']: field for field in snapshot['data']['fields']}
    active_edges = {edge['id']: edge for edge in snapshot['data']['edges']}
    suspended = graph.get('suspendedRegions', {})
    incoming = defaultdict(list)
    for node in nodes.values():
        for exit in node['exits']:
            incoming[exit['to']].append({key: exit[key] for key in GATE_CONDITIONS if key in exit})
    operations = sorted(adoption['operations'], key=lambda op: op['type'] != 'edge_delete')
    newly_added = {op['data']['id'] for op in operations if op['type'] == 'edge_add'}
    if any(exit.get('studioRoute') in newly_added for node in nodes.values() for exit in node['exits']):
        raise ValueError('This revision is already present in the runtime graph.')
    audit, changed, counted = [], set(), defaultdict(int)

    def apply(operation):
        kind = operation['type']
        id = operation.get('id') or operation['data']['id']
        edge = operation['before'] if kind == 'edge_delete' else active_edges[id]
        if any(fields[field].get(key) is None for field in (edge['a'], edge['b']) for key in ('map', 'x', 'y')):
            raise ValueError(f'Unmapped route: {id}')
        first, second = (stages[field] for field in (edge['a'], edge['b']))
        if first['region'] in suspended or second['region'] in suspended:
            raise ValueError(f'Suspended route: {id}')
        forward = [exit for exit in first['exits'] if exit['to'] == second['id']]
        backward = [exit for exit in second['exits'] if exit['to'] == first['id']]
        if kind == 'edge_delete':
            if any(exit.keys() & set(GATE_CONDITIONS) for exit in forward + backward):
                raise ValueError(f'Quest-bound portal needs separate routing: {id}')
            if forward or backward:
                first['exits'] = [exit for exit in first['exits'] if exit['to'] != second['id']]
                second['exits'] = [exit for exit in second['exits'] if exit['to'] != first['id']]
                changed.update((first['id'], second['id']))
            result = 'removed_direct_gates' if forward or backward else 'removed_design_only'
        else:
            if edge['mode'] not in ('road', 'special_road'):
                raise ValueError(f'Choose a runtime traversal for {id}: {edge["mode"]}')
            made = 0
            east = fields[edge['a']]['x'] < fields[edge['b']]['x']
            positions = []
            for node, existing, right in ((first, forward, east), (second, backward, not east)):
                positions.append((existing[0]['x'], existing[0].get('y', 480)) if existing else gate_position(node, right))
            for source, target, existing, at, arrival in (
                (first, second, forward, positions[0], positions[1]),
                (second, first, backward, positions[1], positions[0]),
            ):
                if not existing:
                    conditions = incoming[target['id']]
                    restriction = {}
                    if conditions and all(conditions):
                        restriction = conditions[0]
                        if any(rule != restriction for rule in conditions):
                            raise ValueError(f'Multiple protected entrances require a route choice: {id}')
                    portal = {'to': target['id'], 'x': at[0], 'arrivalX': arrival[0], 'arrivalY': arrival[1]}
                    if at[1] != 480:
                        portal['y'] = at[1]
                    if restriction.get('darkOnly') and not source.get('localLight'):
                        restriction = {**restriction, 'visitedOnly': True}
                        del restriction['darkOnly']
                    portal.update(restriction)
                    source['exits'].append(portal)
                    existing = [portal]
                    made += 1
                for portal in existing:
                    portal.update(studioRoute=id, studioMode=edge['mode'])
                changed.add(source['id'])
            result = 'added_provisional_gates' if made else 'retained_existing_gates'
        counted[result] += 1
        audit.append({'id': id, 'operation': kind, 'stages': [first['id'], second['id']],
                      'mode': edge['mode'], 'result': result})
    for operation in operations:
        apply(operation)

    # Honor the editor deletion while materializing the still-active route on a
    # point that would otherwise lose all round-trip access in the lab.
    returnable = reachable(nodes) & reachable(nodes, reverse=True)
    for stage in sorted(before_returnable - returnable):
        field = nodes[stage].get('mapPoint') or nodes[stage].get('designField')
        alternatives = []
        for edge in active_edges.values():
            if field not in (edge['a'], edge['b']):
                continue
            other = edge['b'] if edge['a'] == field else edge['a']
            if other in stages and stages[other]['id'] in returnable:
                if stages[other]['region'] == nodes[stage]['region'] and edge['mode'] in ('road', 'special_road'):
                    alternatives.append(edge)
        if len(alternatives) != 1:
            raise ValueError(f'Choose a surviving design route for {stage}: {alternatives}')
        apply({'type': 'retained_route_connection', 'id': alternatives[0]['id']})
    assert before_returnable <= reachable(nodes) & reachable(nodes, reverse=True)
    write_exits(path, raw, {id: nodes[id]['exits'] for id in changed})
    report = {'editor_revision': adoption['revision'], 'reviewed_at': adoption['sites_reviewed_at'],
              'counts': dict(counted), 'routes': audit}
    date = adoption['sites_reviewed_at'][:10].replace('-', '')
    evidence = ROOT / 'evidence' / f'field-studio-{date}-runtime-routes.json'
    evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(dict(counted)))


if __name__ == '__main__':
    build()
