"""Build the Lua lab worklist from imported entities and authored encounter details."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent
ART_LISTS = ('art_components', 'art_variants')
ART_KEYS = {'art_candidate', *ART_LISTS}
DETAIL_KEYS = {'name', 'aliases', 'action', 'variants', 'variantLabel', 'grouping', 'remaining', 'review_note', 'extra_evidence', *ART_KEYS}


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def imported_encounters(entities):
    for entity in entities:
        entity_id = entity['id']
        if entity_id == '26050801':
            continue
        row = {
            'id': 'boss-' + entity_id, 'name': entity['name'],
            'kind': entity['kind_candidate'], 'entity_ids': [entity_id],
            'status': 'not_implemented', 'action': None,
            'grouping': 'single_entity_provisional', 'evidence': [entity['source_url']],
            'remaining': ['固有戦闘', 'ドット絵・動作', '報酬・難度', '通し検証'],
        }
        if entity_id == '26050701':
            row.update(id='bathysmal-herd', name='アビサルヴィシャップの群れ',
                       entity_ids=['26050701', '26050801'], grouping='paired_encounter')
            row['evidence'] += [
                'sources/boss-research/english-boss-candidates.json:26050701 investigation=37',
                'https://genshin-impact.fandom.com/wiki/Coral_Defenders',
            ]
        if entity_id == '24070301':
            for variant, label in [('coppelia', 'コッペリアの葬送'), ('coppelius', 'コペリウスの劫罰')]:
                yield {
                    **row, 'id': 'icewind-' + variant, 'name': '氷風組曲：' + label,
                    'grouping': 'selectable_variant', 'evidence': [
                        *row['evidence'], 'sources/boss-research/english-boss-candidates.json:24070301 investigation.description',
                    ],
                }
        else:
            yield row


def resolve_art(ref, galleries):
    gallery = ref.get('gallery', 'bosses')
    item = galleries[gallery][ref['item']]
    encoding = 'assets/' + item['file']
    metadata = read_json(encoding)
    source = 'assets/' + metadata['source']
    if not (ROOT / source).is_file():
        raise FileNotFoundError(source)
    result = {'gallery': gallery} if gallery != 'bosses' else {'source': source}
    result['encoding'] = encoding
    return {**result, **{k: v for k, v in ref.items() if k not in ('gallery', 'item')}}


def apply_roster_review(rows, review):
    totals = {}
    unmatched = []
    for kind in ('normal', 'weekly'):
        by_id = {row['id']: row for row in rows
                 if row['kind'] == kind and row.get('grouping') != 'original_design'}
        matched = set()
        names = set()
        for entry in review[kind]:
            name = entry['name']
            if not name or name in names or not entry['rows']:
                raise ValueError(f'{kind}: missing or duplicate roster name {name!r}')
            names.add(name)
            for row_id in entry['rows']:
                if row_id not in by_id or row_id in matched:
                    raise ValueError(f'{kind}: invalid or duplicate roster mapping for {row_id}')
                matched.add(row_id)
                row = by_id[row_id]
                if name not in row['name'] and name not in row.get('aliases', []):
                    row['aliases'] = [*row.get('aliases', []), name]
        totals[kind] = len(names)
        unmatched.extend(sorted(by_id.keys() - matched))
    return {
        'game_version': review['game_version'],
        'reviewed_on': review['reviewed_on'],
        'field_boss_families': totals['normal'],
        'weekly_challenges': totals['weekly'],
        'unmatched_rows': unmatched,
    }


def build():
    source = read_json('content/boss-catalog.json')
    original = read_json('content/stygian-encounters.json')
    details = read_json('content/encounter-details.json')['entries']
    review = read_json('content/encounter-roster-review.json')
    fields = {spec['id']:spec for spec in read_json('content/field-boss-spawns.json')['fieldBosses']}
    weeklies = {spec['id']:spec for spec in read_json('content/weekly-boss-spawns.json')['weeklyBosses']}
    nodes = {node['id']:node for node in read_json('content/story-graph.json')['nodes']}
    galleries = {
        gallery: {item['id']: item for item in read_json(path)['items']}
        for gallery, path in [('bosses', 'content/boss-art-gallery.json'),
                              ('characters', 'content/character-art-gallery.json')]
    }
    entities = source['boss_entities']
    rows = list(imported_encounters(entities))
    for kind, specs in [('normal', fields), ('weekly', weeklies)]:
        for spec in specs.values():
            if spec.get('original'):
                rows.append({
                    'id': spec['id'], 'name': spec['name'], 'kind': kind, 'entity_ids': [],
                    'status': 'not_implemented', 'action': None, 'grouping': 'original_design',
                    'evidence': [spec['design']],
                    'remaining': ['連続アニメーション', '難度別報酬' if kind == 'weekly' else '報酬の調整', 'マルチ検証'],
                })
    for entry in original['encounters']:
        rows.append({
            'id': 'stygian-' + entry['id'], 'name': entry['name'], 'kind': 'stygian',
            'entity_ids': [], 'status': 'not_implemented', 'action': None, 'grouping': 'original_design',
            'evidence': [entry.get('source', original['source'])], 'remaining': ['完成ドット絵・台詞', '4難度・報酬', 'マルチ・記録'],
        })
    unknown = (details.keys() | fields.keys() | weeklies.keys()) - {row['id'] for row in rows}
    if unknown:
        raise ValueError(f'Encounter details refer to unknown IDs: {sorted(unknown)}')

    for row in rows:
        row_id = row['id']
        extra = details.get(row_id, {})
        if extra.keys() - DETAIL_KEYS:
            raise ValueError(f'{row_id}: unknown encounter fields {sorted(extra.keys() - DETAIL_KEYS)}')
        row['action'] = extra.get('action')
        field = fields.get(row_id)
        if field:
            node = nodes[field['node']]
            row['fieldNode'] = node['id']
            row['fieldEntrance'] = f"{node['name']}（Lv{node['level']}）"
        weekly = weeklies.get(row_id)
        if weekly:
            node = nodes[weekly['node']]
            row['weeklyNode'] = node['id']
            row['weeklyEntrance'] = f"{node['name']}（Lv{node['level']}）"
        if row['action'] or field or weekly:
            row['status'] = 'partial'
        elif row['kind'] == 'stygian':
            row['remaining'].append('専用戦闘行動')
        if extra.get('variants') and not row['action']:
            raise ValueError(f'{row_id}: variants require a playable action')
        row['evidence'].extend(extra.get('extra_evidence', []))
        for key, value in extra.items():
            if key == 'extra_evidence':
                continue
            try:
                if key == 'art_candidate':
                    value = resolve_art(value, galleries)
                elif key in ART_LISTS:
                    value = [resolve_art(ref, galleries) for ref in value]
            except (KeyError, FileNotFoundError) as error:
                raise ValueError(f'{row_id}: invalid art reference for {key}: {error}') from error
            row[key] = value

    roster_review = apply_roster_review(rows, review)
    return {
        'version': 1, 'snapshot_commit': source['snapshot_commit'], 'complete_roster_verified': False,
        'warning': '未実装の戦闘は制作中。ゲーム内の冒険の証との照合は未実施。',
        'roster_review': roster_review,
        'counts': {
            'source_entities': len(entities), 'encounter_candidates': len(rows),
            'partial': sum(row['status'] == 'partial' for row in rows), 'complete': 0,
        },
        'encounters': rows,
    }


def write_encounters(result):
    output = ROOT / 'content/encounters.json'
    contents = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    with TemporaryDirectory(dir=output.parent) as folder:
        temporary = Path(folder) / output.name
        temporary.write_text(contents, encoding='utf8')
        temporary.replace(output)


if __name__ == '__main__':
    result = build()
    write_encounters(result)
    print(json.dumps(result['counts']))
