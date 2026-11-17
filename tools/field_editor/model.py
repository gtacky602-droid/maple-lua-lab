"""Repository-backed design model. Every write is a reviewed, versioned transaction."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import io
import json
import math
import os
import re
import threading
import uuid

ROOT = Path(__file__).resolve().parents[2]
STATES = ('unassigned', 'proposed', 'approved', 'implemented', 'verified')
ACCEPTED = STATES[2:]
COLLECTIONS = ('field_definitions', 'field_edges', 'monster_families', 'monster_variants', 'field_spawns', 'graph_layouts', 'graph_exceptions')
IDS = dict(zip(COLLECTIONS, ('field_id', 'edge_id', 'family_id', 'monster_id', 'spawn_id', 'layout_id', 'exception_id')))
EDITABLE = {
    'field_definitions': {'name', 'location_alias', 'region_id', 'recommended_level', 'enemy_level_min', 'enemy_level_max', 'respawn_seconds', 'elite', 'local_legend', 'terrain', 'quests', 'notes', 'production_state', 'required_route'},
    'field_edges': {'from_field', 'to_field', 'direction', 'kind', 'conditions', 'exit_position', 'entrance_position', 'notes'},
    'monster_families': {'name', 'element', 'behavior', 'sprite', 'animation', 'defaults'},
    'monster_variants': {'family_id', 'region_id', 'name', 'base_level', 'hp', 'attack', 'defense', 'exp', 'drops', 'behavior', 'sprite', 'animation', 'classification', 'element'},
    'field_spawns': {'field_id', 'monster_id', 'count', 'level_override', 'special', 'respawn_seconds', 'area', 'conditions'},
    'graph_layouts': {'field_id', 'view_id', 'x', 'y'},
    'graph_exceptions': {'code', 'target_id', 'reason'},
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def uid(prefix):
    return prefix + '-' + uuid.uuid4().hex[:16]


class DesignError(ValueError):
    def __init__(self, message, status=400, **details):
        super().__init__(message)
        self.status, self.details = status, details


def require(condition, message):
    if not condition:
        raise DesignError(message)


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def decision(state='unassigned', source='未設定', actor='user'):
    return {'state': state, 'source': source, 'actor': actor, 'updated_at': now()}


def accepted(record, prop):
    return record.get('_meta', {}).get(prop, {}).get('state') in ACCEPTED


def resolve_variant(data, monster_id):
    v = data['monster_variants'][monster_id]
    family = data['monster_families'][v['family_id']]
    result = deepcopy(family.get('defaults') or {})
    for prop in ('element', 'behavior', 'sprite', 'animation'):
        result[prop] = family.get(prop)
    result.update({k: v for k, v in v.items() if v is not None})
    return result


class Store:
    def __init__(self, path=None, root=ROOT):
        self.root = Path(root)
        self.path = Path(path) if path else self.root / 'design/field-editor/project.json'
        self.lock = threading.RLock()
        self.catalog = json.loads((self.root / 'content/map-catalog.json').read_text(encoding='utf8'))
        self.nodes = {n['id']: deepcopy(n) for n in self.catalog['nodes']}
        self.maps = [json.loads(p.read_text(encoding='utf8')) for p in sorted((self.root / 'design/field-editor/maps').glob('*.json'))]
        self.sources = json.loads((self.root / 'design/field-editor/map-sources.json').read_text(encoding='utf8'))
        for m in self.maps:
            require(isinstance(m['map_id'], str) and m['region_id'], 'Invalid map definition')
            # New maps may provide verified nodes without editing program code or the game catalog.
            for n in m.get('map_nodes', []):
                require(n['id'] not in self.nodes or n == self.nodes[n['id']], 'Cannot replace an official node')
                require(finite(n['x']) and finite(n['y']) and n['kind'] in ('waypoint', 'statue'), 'Invalid map node')
                self.nodes[n['id']] = n
            require(all(i in self.nodes for i in m['node_ids']), 'Map references a missing official node')
            require(all(self.nodes[i]['map_id'] == m['official_map_id'] for i in m['node_ids']), 'Wrong official map for node')
            if m.get('map_source'):
                self.sources[str(m['official_map_id'])] = m['map_source']
        require(len({m['map_id'] for m in self.maps}) == len(self.maps), 'Duplicate map_id')
        self.regions = {m['region_id'] for m in self.maps}
        self.data = json.loads(self.path.read_text(encoding='utf8')) if self.path.exists() else self.initial()
        self.fingerprint = hashlib.sha256(self.path.read_bytes()).hexdigest() if self.path.exists() else None
        # Additive migration for newly supplied definitions; no existing design values are replaced.
        for i in self.nodes:
            self.data['field_definitions'].setdefault(i, self.new_field(i))
        self.validate(self.data)

    def initial(self):
        data = {'schema_version': 1, 'revision': 0, 'updated_at': now(), 'design_history': [], 'proposals': {}}
        data.update({c: {} for c in COLLECTIONS})
        data['field_definitions'] = {i: self.new_field(i) for i in self.nodes}
        art = json.loads((self.root / 'content/enemy-art-status.json').read_text(encoding='utf8'))
        labels = {'hilichurl': 'ヒルチャール', 'hydro-slime': '水スライム', 'pyro-slime': '炎スライム', 'ruin-guard': '遺跡守衛'}
        for a in art['assets']:
            if a['id'] not in labels:
                continue
            i = a['id']
            data['monster_families'][i] = {'family_id': i, 'name': labels[i], 'element': {'hydro-slime': '水', 'pyro-slime': '炎'}.get(i, '未確認'), 'behavior': None, 'sprite': a.get('art') or a.get('candidate', {}).get('art'), 'animation': None, 'defaults': {}, '_meta': {}}
            for prop in EDITABLE['monster_families']:
                data['monster_families'][i]['_meta'][prop] = decision('proposed', 'content/enemy-art-status.json (候補素材); 戦闘数値は未設定', 'Codex')
        return data

    def new_field(self, i):
        n = self.nodes[i]
        maps = [m for m in self.maps if i in m['node_ids']]
        own = next((m for m in maps if m['kind'] == 'high_level_branch'), maps[0] if maps else None)
        values = {'name': '', 'location_alias': '', 'region_id': own['region_id'] if own else '', 'recommended_level': None, 'enemy_level_min': None, 'enemy_level_max': None, 'respawn_seconds': None, 'elite': '', 'local_legend': '', 'terrain': '', 'quests': [], 'notes': '', 'production_state': '未着手', 'required_route': []}
        return {'field_id': i, **values, '_meta': {k: decision('unassigned', '地点IDのみ公式カタログから参照。個別Lv・名称・接続は未決定', 'Codex') for k in values}}

    def snapshot(self):
        with self.lock:
            self.sync()
            return deepcopy(self.data)

    def sync(self):
        """Honor edits made by Codex/Git while the editor is running."""
        if not self.path.exists():
            require(self.fingerprint is None, 'Project was removed externally; restart or restore the repository file')
            return
        raw = self.path.read_bytes()
        fingerprint = hashlib.sha256(raw).hexdigest()
        if fingerprint != self.fingerprint:
            candidate = json.loads(raw)
            for i in self.nodes: candidate['field_definitions'].setdefault(i, self.new_field(i))
            self.validate(candidate)
            self.data = candidate
            self.fingerprint = fingerprint

    def persist(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # A distinct lock file protects two editor processes as well as concurrent HTTP writes.
        with self.path.with_suffix('.lock').open('a+b') as lock:
            if os.name == 'nt':
                import msvcrt
                if lock.tell() == 0: lock.write(b'0'); lock.flush()
                lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                current = hashlib.sha256(self.path.read_bytes()).hexdigest() if self.path.exists() else None
                if current != self.fingerprint:
                    self.sync()
                    raise DesignError('別プロセスが正本を更新しました。最新の差分を確認してください。', 409)
                temp = self.path.with_suffix('.json.tmp')
                raw = (json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf8')
                with temp.open('wb') as f:
                    f.write(raw); f.flush(); os.fsync(f.fileno())
                os.replace(temp, self.path)
                self.fingerprint = hashlib.sha256(raw).hexdigest()
                self.data = data
            finally:
                if os.name == 'nt':
                    lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
                else: fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

    def validate(self, d):
        require(type(d['schema_version']) is int and d['schema_version'] == 1, 'Unsupported schema version')
        require(type(d['revision']) is int and d['revision'] >= 0, 'Invalid project revision')
        for c in COLLECTIONS:
            require(isinstance(d[c], dict), c + ' must be an object')
            for i, r in d[c].items():
                require(isinstance(r, dict) and r.get(IDS[c]) == i, 'Invalid fixed ID: ' + i)
                require(set(r) <= EDITABLE[c] | {IDS[c], '_meta'}, 'Unknown properties: ' + c)
                require(EDITABLE[c] <= set(r), 'Missing record properties: ' + ', '.join(sorted(EDITABLE[c] - set(r))))
                require(isinstance(r.get('_meta'), dict), 'Missing item decision metadata')
                require(EDITABLE[c] <= set(r['_meta']), 'Missing per-item decision metadata')
                for prop, meta in r['_meta'].items():
                    require(prop in EDITABLE[c] and isinstance(meta, dict) and meta['state'] in STATES and isinstance(meta['source'], str) and bool(meta['source']) and meta.get('actor') in ('user', 'Codex', 'ChatGPT') and isinstance(meta.get('updated_at'), str), 'Invalid decision metadata')
                for k, value in r.items():
                    if k in ('recommended_level', 'enemy_level_min', 'enemy_level_max', 'base_level', 'level_override') and value is not None:
                        require(integer(value, 1, 200), 'Lv must be an integer from 1 to 200')
                    if k in ('hp', 'attack', 'defense', 'exp', 'respawn_seconds') and value is not None:
                        require(finite(value) and 0 <= value <= 1e12, 'Invalid nonnegative number: ' + k)
                    if k in ('name', 'notes', 'terrain', 'location_alias', 'elite', 'local_legend', 'element') and value is not None:
                        require(isinstance(value, str) and len(value) <= 10000, 'Invalid text: ' + k)
        for i, f in d['field_definitions'].items():
            require(i in self.nodes and f['region_id'] in self.regions, 'Unknown field or region')
            require(f['production_state'] in ('未着手', '設計中', '制作中', '完成'), 'Invalid production state')
            require(isinstance(f['quests'], list) and all(isinstance(x, str) for x in f['quests']), 'quests must be IDs')
            require(isinstance(f['required_route'], list) and all(x in d['field_definitions'] for x in f['required_route']), 'Unknown required route field')
            if f['enemy_level_min'] is not None and f['enemy_level_max'] is not None:
                require(f['enemy_level_min'] <= f['enemy_level_max'], 'Enemy minimum exceeds maximum')
        for e in d['field_edges'].values():
            require(e['from_field'] in d['field_definitions'] and e['to_field'] in d['field_definitions'], 'Connection endpoint does not exist')
            require(e['from_field'] != e['to_field'], 'Connection endpoints must differ')
            require(e['direction'] in ('both', 'one_way'), 'Invalid direction')
            require(e['kind'] in ('portal', 'level', 'quest', 'hidden', 'boat', 'temporary'), 'Invalid connection kind')
            require(isinstance(e['conditions'], dict) and set(e['conditions']) <= {'min_level', 'quest_id', 'expression', 'requires_discovery'}, 'Invalid conditions')
            co = e['conditions']
            require(co.get('requires_discovery') is True, 'Fast travel must require discovery')
            if 'min_level' in co:
                require(integer(co['min_level'], 1, 200), 'Invalid minimum level')
            if e['kind'] == 'level': require('min_level' in co, 'Level connection needs min_level')
            if e['kind'] == 'quest': require(bool(co.get('quest_id')), 'Quest connection needs quest_id')
            if e['kind'] == 'temporary': require(bool(co.get('expression')), 'Temporary connection needs a condition')
            for k in ('exit_position', 'entrance_position'):
                require(isinstance(e[k], dict) and set(e[k]) == {'x', 'y'} and all(finite(x) for x in e[k].values()), 'Invalid entrance/exit position')
        for v in d['monster_variants'].values():
            require(v['family_id'] in d['monster_families'] and v['region_id'] in self.regions, 'Unknown monster family or region')
            require(v['classification'] in ('normal', 'elite', 'local_legend', 'boss', 'weekly_boss'), 'Invalid enemy classification')
            require(isinstance(v['name'], str) and bool(v['name'].strip()), 'Monster needs a name')
            require(v['drops'] is None or isinstance(v['drops'], list), 'drops must be a table or null (inherit)')
        for f in d['monster_families'].values():
            require(isinstance(f['name'], str) and bool(f['name'].strip()), 'Family needs a name')
            require(isinstance(f['defaults'], dict) and set(f['defaults']) <= {'hp', 'attack', 'defense', 'exp', 'base_level', 'drops'}, 'Invalid family defaults')
            for key, val in f['defaults'].items():
                if key == 'base_level': require(integer(val, 1, 200), 'Invalid family level')
                elif key == 'drops': require(isinstance(val, list), 'Invalid family drops')
                else: require(finite(val) and 0 <= val <= 1e12, 'Invalid family stat')
        for s in d['field_spawns'].values():
            require(s['field_id'] in d['field_definitions'] and s['monster_id'] in d['monster_variants'], 'Unknown field or monster')
            require(integer(s['count'], 1, 10000), 'Spawn count must be 1–10000')
            require(type(s['special']) is bool, 'special must be boolean')
            require(s['level_override'] is None or s['special'], 'Only special individuals may override Lv')
            require(isinstance(s['area'], dict) and isinstance(s['conditions'], dict), 'Invalid spawn area/conditions')
        for p in d['graph_layouts'].values():
            require(p['field_id'] in d['field_definitions'] and isinstance(p['view_id'], str), 'Invalid graph layout')
            require(finite(p['x']) and finite(p['y']) and abs(p['x']) < 1e7 and abs(p['y']) < 1e7, 'Invalid graph coordinates')
        for ex in d['graph_exceptions'].values():
            require(ex['code'] in ('unreachable', 'dead_end', 'no_return', 'level_jump', 'quest_route'), 'Invalid graph exception')
            require(ex['target_id'] in d['field_definitions'] or ex['target_id'] in d['field_edges'], 'Invalid exception target')
            require(isinstance(ex['reason'], str) and bool(ex['reason'].strip()), 'Exception requires reason')

    def simulate(self, data, operations, state, actor, source):
        require(isinstance(operations, list) and 0 < len(operations) <= 2000, 'Provide 1–2000 operations')
        candidate = deepcopy(data)
        changes = []
        touched = set()
        for op in operations:
            require(isinstance(op, dict) and set(op) <= {'collection', 'id', 'action', 'changes', 'states'}, 'Invalid operation envelope')
            c, i = op.get('collection'), op.get('id')
            require(c in COLLECTIONS and isinstance(i, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9:_-]{0,159}', i) and i not in ('constructor', 'prototype'), 'Invalid collection or ID (use ASCII letters, digits, colon, hyphen or underscore)')
            require((c, i) not in touched, 'Combine changes to one record into a single operation')
            touched.add((c, i))
            action = op.get('action', 'upsert')
            require(action in ('upsert', 'delete'), 'Invalid operation action')
            before = deepcopy(candidate[c].get(i))
            if action == 'delete':
                require(c != 'field_definitions', 'Official field IDs cannot be deleted')
                require(before is not None, 'Record does not exist')
                del candidate[c][i]
                changes.append({'collection': c, 'id': i, 'item': '*', 'before': before, 'after': None})
                continue
            patch = op.get('changes', {})
            states = op.get('states', {})
            require(isinstance(patch, dict) and isinstance(states, dict) and bool(patch or states), 'Empty operation')
            require(set(patch) <= EDITABLE[c] and set(states) <= EDITABLE[c], 'Cannot modify fixed/official/unknown properties')
            r = candidate[c].setdefault(i, {IDS[c]: i, '_meta': {}})
            for k in sorted(set(patch) | set(states)):
                desired = states.get(k, 'approved' if state == 'proposed' else state)
                require(desired in STATES, 'Invalid decision state')
                old = deepcopy(before.get(k)) if before else None
                old_meta = deepcopy(before.get('_meta', {}).get(k)) if before else None
                value = deepcopy(patch.get(k, r.get(k)))
                if old == value and old_meta and old_meta['state'] == desired:
                    continue  # Preserve the provenance of unchanged decisions.
                if state != 'proposed' and desired in ('implemented', 'verified'):
                    require(old == value and old_meta and old_meta['state'] in ACCEPTED, 'Approve a value before marking it implemented/verified')
                    if desired == 'verified': require(old_meta['state'] in ('implemented', 'verified'), 'Implement before verification')
                r[k] = value
                # Requested lifecycle transitions are only executed in approve(), never by import.
                r['_meta'][k] = decision('proposed' if state == 'proposed' else desired, source, actor)
                if old != value or not old_meta or old_meta['state'] != desired:
                    changes.append({'collection': c, 'id': i, 'item': k, 'before': old, 'after': value, 'before_decision': old_meta, 'after_decision': deepcopy(r['_meta'][k])})
        self.validate(candidate)
        return candidate, changes

    def propose(self, request):
        with self.lock:
            self.sync()
            require(isinstance(request, dict), 'Request must be an object')
            base = request.get('base_revision')
            if type(base) is not int or base != self.data['revision']:
                raise DesignError('正本が更新されています。最新データで差分を再作成してください。', 409, current_revision=self.data['revision'])
            reason, actor = request.get('reason', ''), request.get('actor', 'ChatGPT')
            require(isinstance(reason, str) and 0 < len(reason.strip()) <= 2000, '変更理由を指定してください')
            require(actor in ('user', 'Codex', 'ChatGPT'), 'Invalid actor')
            source = request.get('source') or reason
            require(isinstance(source, str) and len(source) <= 10000, 'Invalid source')
            candidate, diff = self.simulate(self.data, request.get('operations'), 'proposed', actor, source)
            require(diff, 'No changes')
            p = {'proposal_id': uid('proposal'), 'base_revision': base, 'reason': reason, 'actor': actor, 'source': source, 'operations': deepcopy(request['operations']), 'diff': diff, 'status': 'proposed', 'created_at': now()}
            p['impact'] = self.impact(p['operations'], candidate)
            d = self.snapshot(); d['proposals'][p['proposal_id']] = p
            self.persist(d)
            return deepcopy(p)

    def impact(self, operations, candidate):
        fields = set()
        preserved = set()
        def summary(data, s):
            if s is None: return None
            v = resolve_variant(data, s['monster_id'])
            return {'field_id': s['field_id'], 'monster_id': s['monster_id'], 'name': v['name'], 'level': s['level_override'] if s['level_override'] is not None else v.get('base_level'), 'count': s['count'], **{k: v.get(k) for k in ('hp', 'attack', 'defense', 'exp', 'drops', 'behavior', 'sprite', 'animation', 'element', 'classification')}}
        spawn_changes = []
        for sid in self.data['field_spawns'].keys() | candidate['field_spawns'].keys():
            before_spawn, after_spawn = self.data['field_spawns'].get(sid), candidate['field_spawns'].get(sid)
            before, after = summary(self.data, before_spawn), summary(candidate, after_spawn)
            if before != after:
                spawn_changes.append({'spawn_id': sid, 'before': before, 'after': after})
                fields.update(s['field_id'] for s in (before_spawn, after_spawn) if s)
            if before_spawn and after_spawn and before_spawn['level_override'] is not None:
                bv, av = resolve_variant(self.data, before_spawn['monster_id']), resolve_variant(candidate, after_spawn['monster_id'])
                if bv.get('base_level') != av.get('base_level'):
                    preserved.add(after_spawn['field_id'])
        for op in operations:
            if op['collection'] == 'field_definitions': fields.add(op['id'])
            if op['collection'] in ('field_edges', 'field_spawns'):
                r = {**self.data[op['collection']].get(op['id'], {}), **op.get('changes', {})}
                fields.update(r[k] for k in ('field_id', 'from_field', 'to_field') if k in r)
        return {'affected_fields': sorted(fields), 'affected_count': len(fields), 'preserved_override_fields': sorted(preserved), 'spawn_changes': spawn_changes}

    def approve(self, proposal_id, revision, overwrite=False):
        with self.lock:
            self.sync()
            require(type(revision) is int and type(overwrite) is bool, 'Invalid approval revision or confirmation')
            p = self.data['proposals'].get(proposal_id)
            require(p is not None and p['status'] == 'proposed', 'Proposal is not pending')
            if revision != self.data['revision'] or p['base_revision'] != revision:
                raise DesignError('差分作成後に正本が変わりました。再プレビューが必要です。', 409)
            protected = [x for x in p['diff'] if (x.get('before_decision') or {}).get('state') in ACCEPTED or (x['item'] == '*' and any(m['state'] in ACCEPTED for m in x['before'].get('_meta', {}).values()))]
            if protected and overwrite is not True:
                raise DesignError('確定済み項目が含まれます。「確定値の変更を確認」にチェックしてください。', 409, protected=protected)
            ops = deepcopy(p['operations'])
            # State transitions are optional, explicit UI choices; proposals themselves stay proposed.
            candidate, diff = self.simulate(self.data, ops, 'approved', p['actor'], p['source'])
            history = {'change_id': uid('change'), 'revision': revision + 1, 'field_ids': p['impact']['affected_fields'], 'changes': diff, 'reason': p['reason'], 'actor': p['actor'], 'approved_by': 'user', 'approval_state': 'approved', 'timestamp': now(), 'proposal_id': proposal_id}
            candidate['revision'] += 1; candidate['updated_at'] = history['timestamp']
            candidate['design_history'].append(history)
            candidate['proposals'][proposal_id]['status'] = 'approved'
            self.persist(candidate)
            return deepcopy(history)

    def rollback_proposal(self, change_id):
        with self.lock:
            self.sync()
            h = next((h for h in self.data['design_history'] if h['change_id'] == change_id), None)
            require(h is not None, 'Change not found')
            records = {}
            for x in h['changes']:
                key = x['collection'], x['id']
                r = self.data[x['collection']].get(x['id'])
                if x['item'] == '*':
                    require(r is None, 'Rollback conflicts with a later record')
                    records[key] = {'collection': key[0], 'id': key[1], 'changes': {k: v for k, v in x['before'].items() if k in EDITABLE[key[0]]}}
                else:
                    require(r is not None and r.get(x['item']) == x['after'], 'Rollback conflicts with a later edit')
                    op = records.setdefault(key, {'collection': key[0], 'id': key[1], 'changes': {}, 'states': {}})
                    if x['before_decision'] is None:
                        op['action'] = 'delete'; op.pop('changes', None)
                    elif op.get('action') != 'delete':
                        op['changes'][x['item']] = x['before']
                        op['states'][x['item']] = x['before_decision']['state'] if x['before_decision']['state'] not in ACCEPTED else 'approved'
            return self.propose({'base_revision': self.data['revision'], 'reason': '巻き戻し: ' + change_id, 'actor': 'user', 'source': 'Undo of ' + change_id, 'operations': list(records.values())})

    def field(self, i, data=None):
        d = data if data is not None else self.snapshot()
        require(i in d['field_definitions'], 'Field not found')
        f = deepcopy(d['field_definitions'][i]); f['map_node'] = self.nodes[i]
        f['official_location_name_ja'] = self.nodes[i].get('name_ja', '名称未確認')
        f['official_layer'] = 'group:' + str(self.nodes[i]['point_group']['group_id']) + '/floor:' + str(self.nodes[i]['point_group']['floor_id']) if self.nodes[i].get('point_group') else self.nodes[i].get('layer', 'unknown')
        f['spawns'] = []
        for s in d['field_spawns'].values():
            if s['field_id'] != i: continue
            v = resolve_variant(d, s['monster_id'])
            f['spawns'].append({**deepcopy(s), 'monster': v, 'effective_level': s['level_override'] if s['level_override'] is not None else v.get('base_level'), 'level_source': 'special_override' if s['level_override'] is not None else 'monster_variant'})
        f['edges'] = [deepcopy(e) for e in d['field_edges'].values() if i in (e['from_field'], e['to_field'])]
        return f

    def list_fields(self, region_id=None, query='', min_level=None, max_level=None):
        with self.lock:
            d = self.snapshot()
            fs = [self.field(i, d) for i in d['field_definitions']]
            return [f for f in fs if (not region_id or f['region_id'] == region_id) and (not query or query in f['field_id'] + f['name'] + f['location_alias'] + f['map_node']['region']) and (min_level is None or f['recommended_level'] is not None and f['recommended_level'] >= min_level) and (max_level is None or f['recommended_level'] is not None and f['recommended_level'] <= max_level)]

    def export(self, map_id, format='json'):
        with self.lock:
            self.sync()
            if map_id == 'all' and format == 'runtime':
                return self.runtime_export(set(self.nodes))
            m = next((m for m in self.maps if m['map_id'] == map_id), None)
            require(m is not None, 'Map not found')
            ids = set(m['node_ids'])
            fields = [self.field(i, self.data) for i in m['node_ids']]
            if format == 'markdown':
                lines = ['# ' + m['name'] + ' 設計相談', '', f'正本: design/field-editor/project.json / revision {self.data["revision"]}', f'地図: {map_id} / region: {m["region_id"]} / 公式map: {m["official_map_id"]}', '公式名称が未確認の地点は推測で確定しない。変更JSONは提案としてインポートし、地図で承認する。', '', '## 地域Lv基準', json.dumps(m['level_guide'], ensure_ascii=False), '', '## 地点・確定事項・未決定事項']
                for f in fields:
                    lines += ['', '### ' + f['field_id'] + ' ' + (f['name'] or 'フィールド名未設定'), '公式地点名: 名称未確認 / 設計上の別名: ' + (f['location_alias'] or '未設定'), f'座標: ({f["map_node"]["x"]}, {f["map_node"]["y"]}) / 階層: {f["map_node"].get("point_group", "未確認")}', '確定: ' + ' / '.join(k + '=' + json.dumps(f[k], ensure_ascii=False) for k, v in f['_meta'].items() if v['state'] in ACCEPTED), '未決定: ' + ', '.join(k for k, v in f['_meta'].items() if v['state'] not in ACCEPTED), '敵: ' + ', '.join(f'{s["monster"]["name"]} Lv{s["effective_level"]} ×{s["count"]} [{s["spawn_id"]}]' for s in f['spawns']), '接続: ' + ', '.join(e['edge_id'] + ' ' + e['from_field'] + (' ↔ ' if e['direction'] == 'both' else ' → ') + e['to_field'] for e in f['edges']), 'メモ: ' + f['notes']]
                lines += ['', '## 直近の変更'] + [json.dumps(h, ensure_ascii=False) for h in self.data['design_history'][-10:] if ids.intersection(h['field_ids'])]
                return '\n'.join(lines)
            if format == 'csv':
                b = io.StringIO(); w = csv.writer(b); w.writerow(['field_id', 'official_map_id', 'point_id', 'field_name', 'monster_id', 'monster_name', 'level', 'count', 'classification', 'spawn_state', 'recommended_level', 'elite_notes', 'local_legend_notes'])
                safe = lambda x: "'" + x if isinstance(x, str) and x.startswith(('=', '+', '-', '@', '\t', '\r')) else x
                for f in fields:
                    for s in f['spawns'] or [{}]:
                        w.writerow([safe(x) for x in [f['field_id'], f['map_node']['map_id'], f['map_node']['source_id'], f['name'], s.get('monster_id', ''), s.get('monster', {}).get('name', ''), s.get('effective_level'), s.get('count'), s.get('monster', {}).get('classification', ''), s.get('_meta', {}).get('count', {}).get('state', 'unassigned'), f['recommended_level'], f['elite'], f['local_legend']]])
                return '\ufeff' + b.getvalue()
            edges = {i: e for i, e in self.data['field_edges'].items() if e['from_field'] in ids or e['to_field'] in ids}
            if format == 'edges': return {'revision': self.data['revision'], 'field_edges': edges}
            if format == 'runtime': return self.runtime_export(ids)
            return {'schema_version': 1, 'revision': self.data['revision'], 'exported_at': now(), 'catalog_provenance': {k: self.catalog[k] for k in ('version', 'source', 'captured_at')}, 'official_map_source': self.sources.get(str(m['official_map_id'])), 'map_definition': m, 'map_nodes': {i: self.nodes[i] for i in ids}, 'map_node_details': {f['field_id']: {'name_ja': f['official_location_name_ja'], 'layer': f['official_layer']} for f in fields}, 'field_definitions': {i: self.data['field_definitions'][i] for i in ids}, 'field_edges': edges, 'field_spawns': {i: s for i, s in self.data['field_spawns'].items() if s['field_id'] in ids}, 'monster_families': self.data['monster_families'], 'monster_variants': self.data['monster_variants'], 'graph_layouts': {i: l for i, l in self.data['graph_layouts'].items() if l['field_id'] in ids}, 'design_history': [h for h in self.data['design_history'] if ids.intersection(h['field_ids'])], 'proposals': [p for p in self.data['proposals'].values() if p['status'] == 'proposed' and ids.intersection(p['impact']['affected_fields'])]}

    def runtime_export(self, ids):
        d = self.data
        def clean(r, collection): return {k: deepcopy(v) for k, v in r.items() if k == IDS[collection] or accepted(r, k)}
        families = {i: clean(f, 'monster_families') for i, f in d['monster_families'].items()}
        variants = {}
        for i, v in d['monster_variants'].items():
            if not all(accepted(v, k) for k in ('name', 'family_id', 'region_id', 'classification')): continue
            resolved = resolve_variant(d, i)
            level_ok = accepted(v, 'base_level') if v.get('base_level') is not None else accepted(d['monster_families'][v['family_id']], 'defaults')
            if not level_ok or resolved.get('base_level') is None: continue
            cv = clean(v, 'monster_variants')
            # Only approved inherited properties are resolved into the runtime output.
            for k in ('base_level', 'hp', 'attack', 'defense', 'exp', 'drops', 'behavior', 'sprite', 'animation', 'element'):
                if v.get(k) is None:
                    family = d['monster_families'][v['family_id']]
                    source_prop = 'defaults' if k in (family.get('defaults') or {}) else k
                    cv.pop(k, None)
                    if accepted(family, source_prop): cv[k] = deepcopy(resolved.get(k))
            variants[i] = cv
        fields = {i: clean(d['field_definitions'][i], 'field_definitions') for i in ids}
        edges = {i: clean(e, 'field_edges') for i, e in d['field_edges'].items() if e['from_field'] in ids and e['to_field'] in ids and all(accepted(e, k) for k in EDITABLE['field_edges'] - {'notes'})}
        spawns = {i: clean(s, 'field_spawns') for i, s in d['field_spawns'].items() if s['field_id'] in ids and s['monster_id'] in variants and all(accepted(s, k) for k in EDITABLE['field_spawns'])}
        return {'schema_version': 1, 'revision': d['revision'], 'production_import': 'manual_review_required', 'map_nodes': {i: self.nodes[i] for i in ids}, 'field_definitions': fields, 'field_edges': edges, 'monster_families': families, 'monster_variants': variants, 'field_spawns': spawns, 'fast_travel_policy': 'destination_must_be_discovered', 'excluded_unapproved': True}

    def report(self, start=None, level_jump=15):
        d = self.snapshot(); fs = d['field_definitions']; start = start or next(iter(fs))
        require(start in fs, 'Unknown starting field')
        adj = {i: set() for i in fs}; rev = {i: set() for i in fs}; issues = []
        def issue(code, target, message):
            ex = next((e for e in d['graph_exceptions'].values() if e['code'] == code and e['target_id'] == target and accepted(e, 'reason')), None)
            issues.append({'code': code, 'target_id': target, 'message': message, 'exception': ex})
        for i, e in d['field_edges'].items():
            if not all(accepted(e, k) for k in ('from_field', 'to_field', 'direction', 'kind', 'conditions')): continue
            a, b = e['from_field'], e['to_field']; adj[a].add(b); rev[b].add(a)
            if e['direction'] == 'both': adj[b].add(a); rev[a].add(b)
            la, lb = fs[a]['recommended_level'], fs[b]['recommended_level']
            if la is not None and lb is not None and abs(lb - la) > level_jump: issue('level_jump', i, f'Lv{la} → Lv{lb}: {a} → {b}')
        def reachable(graph):
            seen = {start}; todo = [start]
            while todo:
                for b in graph[todo.pop()] - seen: seen.add(b); todo.append(b)
            return seen
        reach, returns = reachable(adj), reachable(rev)
        for i, f in fs.items():
            if i not in reach: issue('unreachable', i, '開始地点から未接続（条件充足を仮定）')
            if not adj[i]: issue('dead_end', i, '外向きの承認済み接続なし')
            if i in reach and i not in returns: issue('no_return', i, '開始地点へ戻る経路なし')
            required = [i] + f['required_route']
            if any(t not in reach for t in f['required_route']) or any(b not in adj[a] for a, b in zip(required, required[1:])):
                issue('quest_route', i, '必須経路に未到達または隣接接続が途切れた地点あり')
            m = next((m for m in self.maps if m['region_id'] == f['region_id']), None)
            guide = m['level_guide'] if m else {}
            low, high = guide.get('enemy_min'), guide.get('deepest') or guide.get('enemy_max')
            for s in self.field(i, d)['spawns']:
                lv = s['effective_level']
                if lv is not None and low is not None and not low <= lv <= high:
                    issue('level_jump', i, f'敵Lv{lv}が地域基準Lv{low}〜{high}から外れる（基準状態: {guide.get("state")}）')
        return {'revision': d['revision'], 'start_field': start, 'conditions': 'Static potential reachability; quest/temporary conditions need a gameplay state for actual traversal.', 'reachable_count': len(reach), 'total_fields': len(fs), 'issues': issues, 'region_guides': [{'region_id': m['region_id'], 'name': m['name'], **m['level_guide']} for m in self.maps], 'fast_travel': '未発見の目的地を拒否する契約。ゲーム本体への反映は未実施'}


def can_travel(edge, level, completed_quests, discovered_fields, temporary_conditions, fast_travel=False):
    """Runtime adapter contract; this function does not modify game state."""
    c = edge['conditions']
    require(type(fast_travel) is bool, 'fast_travel must be boolean')
    return ((not fast_travel or edge['to_field'] in discovered_fields) and level >= c.get('min_level', 1) and (not c.get('quest_id') or c['quest_id'] in completed_quests) and (not c.get('expression') or c['expression'] in temporary_conditions))
