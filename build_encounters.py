"""Build the Lua lab worklist from imported entities and authored encounter details."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent
ART_LISTS = ('art_components', 'art_variants')
ART_KEYS = {'art_candidate', *ART_LISTS}
DETAIL_KEYS = {'action', 'variants', 'variantLabel', 'grouping', 'remaining', 'review_note', 'extra_evidence', *ART_KEYS}


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


def build():
    source = read_json('content/boss-catalog.json')
    original = read_json('content/stygian-encounters.json')
    details = read_json('content/encounter-details.json')['entries']
    galleries = {
        gallery: {item['id']: item for item in read_json(path)['items']}
        for gallery, path in [('bosses', 'content/boss-art-gallery.json'),
                              ('characters', 'content/character-art-gallery.json')]
    }
    entities = source['boss_entities']
    rows = list(imported_encounters(entities))
    for entry in original['encounters']:
        rows.append({
            'id': 'stygian-' + entry['id'], 'name': entry['name'], 'kind': 'stygian',
            'entity_ids': [], 'status': 'not_implemented', 'action': None, 'grouping': 'original_design',
            'evidence': [original['source']], 'remaining': ['完成ドット絵・台詞', '4難度・報酬', 'マルチ・記録'],
        })
    unknown = details.keys() - {row['id'] for row in rows}
    if unknown:
        raise ValueError(f'Encounter details refer to unknown IDs: {sorted(unknown)}')

    for row in rows:
        row_id = row['id']
        extra = details.get(row_id, {})
        if extra.keys() - DETAIL_KEYS:
            raise ValueError(f'{row_id}: unknown encounter fields {sorted(extra.keys() - DETAIL_KEYS)}')
        row['action'] = extra.get('action')
        if row['action']:
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

    return {
        'version': 1, 'snapshot_commit': source['snapshot_commit'], 'complete_roster_verified': False,
        'warning': '制作候補一覧。最新の全ボス網羅・戦闘単位の最終確認は未完。未実装を挑戦可能として表示しない。',
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
