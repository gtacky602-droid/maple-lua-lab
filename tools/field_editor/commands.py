"""Tool operations and bounded Japanese command compiler. No remote LLM is implied."""
import re
from .model import DesignError, require, uid, resolve_variant

READ_TOOLS = ('get_field', 'list_fields', 'compare_fields', 'export_map', 'get_change_history', 'check_connections')
WRITE_TOOLS = ('update_field', 'add_enemy', 'remove_enemy', 'set_enemy_level', 'set_elite', 'connect_fields', 'delete_connection', 'register_monster_family', 'register_monster_variant', 'update_monster_variant')


def connection(a, b, **kwargs):
    return {'from_field': a, 'to_field': b, 'direction': 'both', 'kind': 'portal', 'conditions': {'requires_discovery': True}, 'exit_position': {'x': 0, 'y': 0}, 'entrance_position': {'x': 0, 'y': 0}, 'notes': '', **kwargs}


def spawn(field_id, monster_id, count=1, **kwargs):
    return {'field_id': field_id, 'monster_id': monster_id, 'count': count, 'level_override': None, 'special': False, 'respawn_seconds': None, 'area': {}, 'conditions': {}, **kwargs}


def operation(store, name, args):
    require(isinstance(args, dict), 'arguments must be an object')
    d = store.snapshot()
    if name == 'get_field': return store.field(args['field_id'])
    if name == 'list_fields': return store.list_fields(**{k: v for k, v in args.items() if k in ('region_id', 'query', 'min_level', 'max_level')})
    if name == 'compare_fields': return {'revision': d['revision'], 'fields': [store.field(i, d) for i in args['field_ids']]}
    if name == 'export_map': return store.export(args['map_id'], args.get('format', 'json'))
    if name == 'get_change_history': return [h for h in d['design_history'] if not args.get('field_id') or args['field_id'] in h['field_ids']]
    if name == 'check_connections': return store.report(args.get('start_field_id'))
    c, i, changes, action = None, None, {}, 'upsert'
    if name == 'update_field': c, i, changes = 'field_definitions', args['field_id'], args['changes']
    elif name == 'add_enemy': c, i, changes = 'field_spawns', args.get('spawn_id') or uid('spawn'), spawn(args['field_id'], args['monster_id'], args.get('count', 1), **{k: v for k, v in args.items() if k in ('level_override', 'special', 'respawn_seconds', 'area', 'conditions')})
    elif name == 'remove_enemy': c, i, action = 'field_spawns', args['spawn_id'], 'delete'
    elif name == 'set_enemy_level':
        c, i, changes = 'field_spawns', args['spawn_id'], {'level_override': args.get('level'), 'special': True}
    elif name == 'set_elite': c, i, changes = 'field_definitions', args['field_id'], {args.get('classification', 'elite'): args['name']}
    elif name == 'connect_fields': c, i, changes = 'field_edges', args.get('edge_id') or uid('edge'), connection(args['from_field'], args['to_field'], **{k: v for k, v in args.items() if k in ('direction', 'kind', 'conditions', 'exit_position', 'entrance_position', 'notes')})
    elif name == 'delete_connection': c, i, action = 'field_edges', args['edge_id'], 'delete'
    elif name in ('register_monster_family', 'register_monster_variant', 'update_monster_variant'):
        c = 'monster_families' if name == 'register_monster_family' else 'monster_variants'
        i = args.get('family_id' if c == 'monster_families' else 'monster_id') or uid('family' if c == 'monster_families' else 'monster')
        changes = args['changes']
    else: raise DesignError('Unknown operation: ' + name)
    return store.propose({'base_revision': args.get('base_revision'), 'reason': args.get('reason', name), 'source': args.get('source', name), 'actor': args.get('actor', 'ChatGPT'), 'operations': [{'collection': c, 'id': i, 'action': action, **({'changes': changes} if action == 'upsert' else {})}]})


def candidates(store, text, region_id=None):
    text = text.strip(' 「」『』。、')
    exact_ids = [i for i in store.nodes if re.search(r'(?<![A-Za-z0-9:_-])' + re.escape(i) + r'(?![A-Za-z0-9:_-])', text)]
    if exact_ids:
        return [store.field(i) for i in exact_ids]
    matches = []
    if not text: return matches
    for f in store.list_fields(region_id=region_id):
        if any(n and (n in text or text in n) for n in (f['name'], f['location_alias'])):
            matches.append(f)
    return matches


def compile_japanese(store, text, region_id=None, selected_field_id=None, target_field_id=None):
    """Return explicit operations or candidates. Never invent a waypoint name or enemy."""
    require(isinstance(text, str) and 0 < len(text.strip()) <= 3000, '変更指示を入力してください')
    d = store.snapshot()
    explicit_regions = [m for m in store.maps if m['name'] in text]
    explicit_regions = [m for m in explicit_regions if not any(m['name'] != other['name'] and m['name'] in other['name'] for other in explicit_regions)]
    if len(explicit_regions) == 1: region_id = explicit_regions[0]['region_id']
    def monster_matches(v):
        family_name = d['monster_families'][v['family_id']]['name']
        return any(n and n in text for n in (v['name'], v['monster_id'], family_name))
    # Region-wide monster Lv changes operate on variants; overrides remain intact.
    lv = re.search(r'(?:Lv|LV|lv|レベル)\s*(?:は|を|に|:|：|=)?\s*(\d+)', text)
    if ('統一' in text or '基準' in text) and lv:
        vs = [v for v in d['monster_variants'].values() if (not region_id or v['region_id'] == region_id) and monster_matches(v)]
        if not vs: return {'status': 'needs_monster', 'message': '該当地域の登録済みVariantを指定してください。', 'monster_candidates': list(d['monster_variants'].values())}
        ops = [{'collection': 'monster_variants', 'id': v['monster_id'], 'changes': {'base_level': int(lv.group(1))}} for v in vs]
        return {'status': 'ready', 'operations': ops}
    if '比較' in text:
        regions = {m['region_id'] for m in explicit_regions} or {region_id}
        return {'status': 'read', 'result': operation(store, 'compare_fields', {'field_ids': [f['field_id'] for f in store.list_fields() if not region_id or f['region_id'] in regions]})}
    if '樹形図' in text or 'グラフ' in text:
        return {'status': 'graph', 'message': '承認済み接続と提案を別の線で表示します。'}
    is_connect = any(w in text for w in ('つない', '繋い', '接続', '一方通行'))
    if is_connect:
        parts = re.split(r'から|と|へ', text)
        a = [store.field(selected_field_id)] if selected_field_id else candidates(store, parts[0], region_id)
        b = [store.field(target_field_id)] if target_field_id else candidates(store, parts[1] if len(parts) > 1 else '', None)
        if len(a) != 1 or len(b) != 1:
            return {'status': 'needs_confirmation', 'message': '接続の両端が一意ではありません。地図の候補またはIDを指定してください。', 'from_candidates': a, 'to_candidates': b, 'candidates': a + b}
        edge = connection(a[0]['field_id'], b[0]['field_id'], direction='one_way' if '一方通行' in text else 'both')
        existing = [e for e in d['field_edges'].values() if {e['from_field'], e['to_field']} == {edge['from_field'], edge['to_field']}]
        if len(existing) > 1:
            return {'status': 'needs_confirmation', 'message': '同じ地点間に複数の経路があります。編集するedge_idを指定してください。', 'edge_candidates': existing}
        if existing:
            return {'status': 'ready', 'operations': [{'collection': 'field_edges', 'id': existing[0]['edge_id'], 'changes': {k: edge[k] for k in ('from_field', 'to_field', 'direction')}}]}
        return {'status': 'ready', 'operations': [{'collection': 'field_edges', 'id': uid('edge'), 'changes': edge}]}
    fs = [store.field(selected_field_id)] if selected_field_id else candidates(store, text, region_id)
    if len(fs) != 1:
        return {'status': 'needs_confirmation', 'message': '地点を一意に特定できません。公式名称未確認の地点は推測せず、地図またはIDで選択してください。', 'candidates': fs or store.list_fields(region_id=region_id)}
    f = fs[0]
    if '精鋭' in text or '地方伝説' in text:
        vs = [v for v in d['monster_variants'].values() if monster_matches(v) and v['classification'] in ('elite', 'local_legend')]
        if len(vs) != 1: return {'status': 'needs_monster', 'message': '精鋭または地方伝説のVariantを一意に指定してください。', 'monster_candidates': vs}
        v = vs[0]; prop = 'local_legend' if v['classification'] == 'local_legend' else 'elite'
        return {'status': 'ready', 'operations': [{'collection': 'field_definitions', 'id': f['field_id'], 'changes': {prop: v['name']}}]}
    if any(w in text for w in ('配置', '追加', '体')):
        vs = [v for v in d['monster_variants'].values() if monster_matches(v) and (not region_id or v['region_id'] == region_id)]
        if len(vs) != 1: return {'status': 'needs_monster', 'message': '登録済みの地域別Variantを一意に指定してください。', 'monster_candidates': vs or list(d['monster_variants'].values())}
        v = vs[0]; count = re.search(r'(\d+)\s*体', text); s = spawn(f['field_id'], v['monster_id'], int(count.group(1)) if count else 1)
        if lv and int(lv.group(1)) != resolve_variant(d, v['monster_id']).get('base_level'):
            if not any(w in text for w in ('特殊', '特別', '上書き')):
                return {'status': 'needs_confirmation', 'message': '指示LvとVariantの基準Lvが違います。基準Lvを変更するか「特殊個体」と明示してください。', 'candidates': [f]}
            s.update(level_override=int(lv.group(1)), special=True)
        return {'status': 'ready', 'operations': [{'collection': 'field_spawns', 'id': uid('spawn'), 'changes': s}]}
    if lv:
        return {'status': 'ready', 'operations': [{'collection': 'field_definitions', 'id': f['field_id'], 'changes': {'recommended_level': int(lv.group(1))}}]}
    return {'status': 'unsupported', 'message': 'この文はオフライン変換の対象外です。IDを指定したLv・敵配置・接続指示、または変更JSONを使ってください。自由対話型LLMは未接続です。'}
