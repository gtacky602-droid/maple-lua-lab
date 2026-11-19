"""Validate the source, design and runtime references in the world-design register."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORLD = ROOT / 'design/world'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def indexed(rows, key='id'):
    result = {row[key]: row for row in rows}
    if len(result) != len(rows):
        raise ValueError(f'Duplicate {key}')
    return result


def validate(frozen_inputs):
    manifest = read(WORLD / 'manifest.json')
    snapshot = read(WORLD / 'editor-snapshot.json')
    base = snapshot['data']
    regions = indexed(read(WORLD / 'regions.json')['regions'])
    master = read(WORLD / 'monster-catalog.json')
    species = indexed(base['monsters'] + master['additions'])
    fields = indexed(base['fields'])
    edges = indexed(base['edges'])
    records = [read(file) for file in sorted((WORLD / 'placements').glob('*.json'))]
    placements = indexed([row for file in records for row in file['fields']], 'field_id')
    observed = read(WORLD / 'research/index.json')
    points = indexed([p for name in observed['point_files']
                      for p in read(WORLD / 'research' / name)['points']], 'uid')
    labels = {label['id'] for label in observed['labels']}
    sources = {row['id'] for row in observed['sources'] if 'id' in row}
    assignments = read(WORLD / 'research/field-links.json')
    references = indexed([r for name in assignments['files']
                          for r in read(WORLD / 'research' / name)['records']], 'point_uid')
    encounters = read(WORLD / 'encounters.json')
    quests = indexed(read(WORLD / 'quest-bindings.json')['bindings'], 'design_quest_id')
    official = indexed(read(ROOT / 'content/map-catalog.json')['nodes'])
    project = read(ROOT / 'design/field-editor/project.json')
    comparison = read(WORLD / 'reconciliation.json')
    overlaps = set(placements) & set(official)
    actual = read(ROOT / 'content/story-graph.json')
    runtime_quests = indexed(actual['quests'])
    runtime_stages = indexed(actual['nodes'])
    runtime_spawns = read(ROOT / 'content/enemy-spawns.json')['nodes']
    runtime_field_bosses = indexed(read(ROOT / 'content/field-boss-spawns.json')['fieldBosses'])
    exceptions = {row['field_id']: row for row in comparison['noncombat_field_level_exceptions']}
    overrides = snapshot.get('placement_overrides', {})
    checks = {}

    def require(name, expression):
        checks[name] = bool(expression)

    require('editor field IDs and placement IDs agree', fields.keys() == placements.keys())
    require('official coordinates and marker kinds are unchanged',
            all((fields[id]['x'], fields[id]['y'], fields[id]['map'], fields[id]['kind'])
                == (official[id]['x'], official[id]['y'], official[id]['map_id'], official[id]['kind'])
                for id in official))
    require('field-editor project IDs still resolve', set(project['field_definitions']) <= fields.keys())
    require('regional partition matches every file and published count',
            set(regions) == {file['region'] for file in records}
            and all(row['design_region_id'] == file['region'] for file in records for row in file['fields'])
            and Counter(row['design_region_id'] for row in placements.values())
            == Counter({id: r['planned_field_count'] for id, r in regions.items()}))
    require('field connections resolve to unchanged field identities',
            all(e['a'] in fields and e['b'] in fields and e['a'] != e['b'] for e in edges.values()))
    require('design additions use new IDs and corrections resolve', all(
        row['region'] in regions and 1 <= row['lv'] <= 200 for row in species.values())
        and all(row['monster_id'] in species for row in master['corrections']))
    require('legacy placement records resolve independently of v8', all(
        s['field'] in fields and s['monster'] in species for s in indexed(base['spawns']).values()))
    require('official enemy observations resolve labels and citation records', all(
        p['label_id'] in labels and p['source_id'] in sources and p['uid'] == f"{p['map']}:{p['id']}"
        and not {'level', 'count', 'field_id'} & p.keys() for p in points.values()))
    require('marker assignment records are labeled as inferred', references.keys() == points.keys() and all(
        r['field_id'] is None or r['field_id'] in fields for r in references.values())
        and not any(r['route_verified'] for r in references.values()))

    spawn_groups = ('regular_spawns', 'optional_pockets', 'ambient_presence')
    roster = indexed([s for field in placements.values() for group in spawn_groups for s in field[group]])
    require('edited rows resolve to editable v8 IDs', set(overrides) <= {
        s['id'] for field in placements.values() for group in spawn_groups[:2] for s in field[group]})
    require('origin species and point links resolve', all(s['monster_id'] in species and
            set(s.get('source_point_uids', []) + s.get('regional_reference_point_uids', [])) <= points.keys()
            for s in roster.values()))
    require('known different floors are not treated as local placements', all(
        p['map_anchor']['point_group'] is None or points[uid]['point_group'] is None
        or p['map_anchor']['point_group'] == points[uid]['point_group']
        for p in placements.values() for group in spawn_groups for s in p[group]
        for uid in s.get('source_point_uids', [])))
    require('design Levels, density and no-hostile modes are coherent', all(
        1 <= overrides.get(s['id'], s)['level'] <= 200 and overrides.get(s['id'], s)['count'] >= 1
        for s in roster.values())
        and all(regions[p['design_region_id']]['low'] <= overrides.get(s['id'], s)['level']
                <= regions[p['design_region_id']]['high']
                for p in placements.values() for s in p['regular_spawns'])
        and all(sum(overrides.get(s['id'], s)['count'] for s in p['regular_spawns'])
                <= p['stage_layout']['max_simultaneous_hostile'] for p in placements.values())
        and all(not p['regular_spawns'] for p in placements.values()
                if p['mode'] in {'safe', 'underwater_observation', 'scenic_observation', 'optional_arena_only'}))
    require('out-of-band field recommendation is documented and non-combat', all(
        p['field_id'] in exceptions and not p['regular_spawns']
        for p in placements.values() if not regions[p['design_region_id']]['low'] <= p['level']
        <= regions[p['design_region_id']]['high']))
    require('noncombat wildlife is excluded from quest and daily kills', all(
        s['combat_role'] == 'ambient' and not s['counts_for_daily_kill'] and not s['counts_for_main_quest']
        for p in placements.values() for s in p['ambient_presence']))
    require('water hunts and underwater legends are current Sites designs',
            {p['field_id'] for p in placements.values() if p['mode'] == 'underwater_hunt'}
            == {'teyvat:50074', 'teyvat:50076'} and all(
                p['stage_layout']['water_battle_required'] and not any(s['counts_for_daily_kill'] for s in p['regular_spawns'])
                for p in placements.values() if p['mode'] == 'underwater_hunt')
            and sum(e['arena_mode'] == 'optional_underwater_combat' for e in encounters['legends']) == 9)
    require('legend and boss species and distinct encounter IDs resolve',
            not ({x['monster_id'] for x in encounters['legends']} & {x['monster_id'] for x in encounters['normal_bosses']})
            and all(e['monster_id'] in species and e['field_anchor_id'] in fields
                    for e in indexed(encounters['legends'] + encounters['normal_bosses'], 'encounter_id').values()))
    require('legend/boss point matches resolve; pending candidates stay unconfirmed', all(
        set(e['official_point_uids']) <= points.keys() for e in encounters['legends']) and all(
        e['official_point_uid'] is None or e['official_point_uid'] in points for e in encounters['normal_bosses'])
        and all(not e.get('is_official_local_legend', True) for e in encounters['originals'])
        and all(not e['is_local_legend'] for e in encounters['specials']))
    require('weekly and Stygian remain in their dedicated files',
            bool(read(ROOT / 'content/weekly-boss-spawns.json')['weeklyBosses'])
            and bool(read(ROOT / 'content/stygian-encounters.json')['encounters']))
    require('all quest references resolve and S05 is protected', all(
        set(q['design_field_refs']) <= fields.keys() for q in quests.values())
        and '敵0' in str(quests['Q-FON-S05']['regional_advice']))
    require('compared Web stage links use exact map-point IDs', all(
        row['field_id'] in fields and (not frozen_inputs
        or runtime_stages[row['web_stage_id']]['mapPoint'] == row['field_id'])
        for row in comparison['mapped_web_stages']))
    if frozen_inputs:
        require('frozen game and editor inputs match the pre-integration hashes', all(
            hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest
            for path, digest in manifest['existing_github_inputs'].items()))
        require('historical quest and field boss bindings kept or explicitly compared', all(
            past['quest_id'] in runtime_quests or any(d['web_id'] == past['quest_id']
                for d in comparison['quest_binding_differences_since_v8'])
            for q in quests.values() for past in q['existing_runtime_bindings']) and all(
            r['id'] in runtime_field_bosses for e in encounters['normal_bosses'] for r in e['runtime_templates']))
        require('runtime stage, quest, spawn, and boss counts are preserved', all(
            manifest['verified_counts'][key] == len(rows) for key, rows in {
                'runtime_stages': runtime_stages, 'runtime_quests': runtime_quests,
                'runtime_spawn_nodes': runtime_spawns, 'runtime_field_bosses': runtime_field_bosses}.items()))
    counts = {'field_ids': len(fields), 'regions': len(regions), 'official_coordinate_matches': len(overlaps),
              'monster_ids': len(species), 'design_routes': len(edges), 'placement_rows': len(roster),
              'official_enemy_markers': len(points), 'quest_designs': len(quests)}
    return {'passed': all(checks.values()), 'checks': checks, 'counts': counts}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frozen-inputs', action='store_true',
                        help='Also verify the exact runtime snapshot used for the initial integration.')
    report = validate(parser.parse_args().frozen_inputs)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(not report['passed'])
