#!/usr/bin/env python3
"""Static DESIGN validator. Does not execute game Lua, movement, AI or networking.

Run: python docs/field-boss-v1/validate_oceanid_inazuma.py
Only the Python standard library is required. Mutation checks test this validator.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
from typing import Any

EXPECTED = {
    'boss-20050101': ['FO01', 'FO02', 'FO03'],
    'boss-25090101': ['FMK01', 'FMK02', 'FMK03'],
    'boss-24021101': ['FPA01', 'FPA02', 'FPA03'],
    'boss-20070101': ['FTM01', 'FTM02', 'FTM03'],
}


def require(condition: bool, label: str) -> None:
    if not condition:
        raise ValueError(label)


def validate(data: dict[str, Any]) -> dict[str, Any]:
    require(data['status'] == 'design_only_not_runtime', 'scope')
    require(data['tick_rate_hz'] == 60 and data['unit_U_pixels'] == 88, 'units')
    require(data['interval_semantics'] == 'half_open', 'interval type')
    counts = data['counts']
    require(counts['bosses'] == 4 and counts['attack_cards'] == 12, 'counts')
    require(counts['cumulative_bosses'] == 11 and counts['cumulative_attack_cards'] == 33, 'cumulative')
    require(counts['catalog_reference_rows'] == 49 and counts['all_catalog_rows_detailed'] is False, 'coverage boundary')
    shared = data['shared']
    require(shared['max_attack_patterns'] == 3 and shared['max_concurrent_casts'] == 1, 'complexity')
    require(shared['hp_bars'] == 1 and shared['hp_zero_priority'] is True, 'HP')
    require(shared['normal_damage_pipeline'] is True, 'damage')
    for flag in ('multiplayer_hp_scaling', 'required_special_element', 'difficulty_selector', 'forced_revive_phase', 'runtime_or_visual_tested'):
        require(shared[flag] is False, flag)
    require(shared['max_ground_melee_unreachable_ticks'] == 36, 'air budget')
    bosses, attacks = data['bosses'], data['attacks']
    require(len(bosses) == 4 and len(attacks) == 12, 'actual counts')
    by_boss = {b['encounter_id']: b for b in bosses}
    by_id = {a['id']: a for a in attacks}
    require(len(by_boss) == 4 and set(by_boss) == set(EXPECTED), 'boss IDs')
    require(len(by_id) == 12, 'unique attack IDs')
    assigned = []
    for bid, ids in EXPECTED.items():
        b = by_boss[bid]
        require(b['attack_ids'] == ids and b['signature'] in ids, 'attack ownership')
        require(0 <= b['neutral_hurtbox_bottom_u'] <= 0.5, 'neutral target height')
        for mid in ids:
            require(mid in by_id and by_id[mid]['encounter_id'] == bid, 'reference')
        assigned.extend(ids)
    require(set(assigned) == set(by_id), 'unassigned attack')
    p = by_boss['boss-20050101']['damage_proxy']
    for field, value in {
        'logical_receivers': 1, 'max_active_mimics': 1, 'shared_boss_hp': True,
        'independent_mimic_hp': False, 'receiver_persistent_across_forms': True,
        'reset_hp_on_form_change': False, 'form_change_max_ticks': 18,
        'targetless_transition_ticks': 0, 'damage_pipeline_calls_per_event': 1,
        'extra_kill_rewards': False, 'minimum_waves_to_win': 0,
    }.items():
        require(p[field] == value and type(p[field]) is type(value), 'proxy ' + field)
    require(p['dedup_key'] == ['actorId', 'castId', 'hitEventId', 'receiverId'], 'proxy event identity')
    for bid, flags in {
        'boss-25090101': ('hp_threshold_lock', 'phantom_extra_hits', 'ranged_auto_guard'),
        'boss-24021101': ('required_sentinel_clear', 'component_extra_hp'),
        'boss-20070101': ('required_fury_meter', 'automatic_teleport_after_dash'),
    }.items():
        for flag in flags:
            require(by_boss[bid][flag] is False, flag)
    windows = shots = air_windows = 0
    opening_seconds = {}
    for a in attacks:
        total, lock, (r0, r1) = a['total_ticks'], a['lock_tick'], a['recovery']
        require(all(type(t) is int for t in [total, lock, r0, r1]), 'integer ticks')
        require(0 <= lock < r0 < r1 == total, 'base timing')
        last_end = lock
        for start, end in a['active_windows']:
            require(type(start) is int and type(end) is int, 'active integer')
            require(last_end <= start < end <= r0, 'active bounds/order')
            last_end = end
            windows += 1
        events = len(a['active_windows'])
        for projectile in a['projectiles']:
            ttl, spawns = projectile['ttl_ticks'], projectile['spawn_ticks']
            require(type(ttl) is int and ttl > 0, 'positive TTL')
            require(spawns == sorted(set(spawns)) and bool(spawns), 'spawns')
            for spawn in spawns:
                require(type(spawn) is int and lock <= spawn < spawn + ttl <= r0, 'projectile bounds')
                shots += 1
                events += 1
        require(events == a['hit_cap'] and 1 <= events <= 3, 'hit cap')
        air_end = lock
        for start, end in a['temporary_ground_melee_out_of_range']:
            require(type(start) is int and type(end) is int, 'air integer')
            require(air_end <= start < end <= r0 and end-start <= 36, 'air bounds')
            air_end = end
            air_windows += 1
        require(a['hp_attackable_during_recovery'] is True, 'opening attackable')
        require(a['new_invulnerability_flag'] is False and a['detached_damage_hazards'] is False, 'hazards')
    for b in bosses:
        a = by_id[b['signature']]
        opening_seconds[b['name']] = (a['recovery'][1]-a['recovery'][0])/60
        require(opening_seconds[b['name']] >= 2, 'signature opening')
    return {'bosses': 4, 'attacks': 12, 'direct_windows': windows,
            'projectile_spawns': shots, 'short_air_windows': air_windows,
            'signature_recovery_seconds': opening_seconds}


def mutation_checks(data: dict[str, Any]) -> int:
    tests = [
        (('counts', 'attack_cards'), 13),
        (('attacks', 0, 'id'), 'FO02'),
        (('attacks', 0, 'encounter_id'), 'boss-25090101'),
        (('bosses', 0, 'signature'), 'UNKNOWN'),
        (('attacks', 0, 'lock_tick'), 140),
        (('attacks', 0, 'active_windows'), [[90, 140]]),
        (('attacks', 1, 'projectiles', 0, 'ttl_ticks'), 999),
        (('attacks', 2, 'temporary_ground_melee_out_of_range'), [[78, 150]]),
        (('bosses', 0, 'damage_proxy', 'max_active_mimics'), 2),
        (('bosses', 0, 'damage_proxy', 'dedup_key'), ['actorId', 'castId', 'receiverId']),
        (('bosses', 0, 'damage_proxy', 'reset_hp_on_form_change'), True),
        (('bosses', 0, 'damage_proxy', 'extra_kill_rewards'), True),
        (('shared', 'multiplayer_hp_scaling'), True),
        (('attacks', 3, 'new_invulnerability_flag'), True),
        (('bosses', 3, 'neutral_hurtbox_bottom_u'), 1.3),
        (('attacks', 2, 'recovery'), [150, 210]),
    ]
    for path, bad in tests:
        candidate = copy.deepcopy(data)
        cursor = candidate
        for key in path[:-1]:
            cursor = cursor[key]
        cursor[path[-1]] = bad
        try:
            validate(candidate)
        except ValueError:
            continue
        raise RuntimeError('Validator failed to reject mutation: ' + repr(path))
    return len(tests)


if __name__ == '__main__':
    path = Path(__file__).with_name('MANIFEST_OCEANID_INAZUMA.json')
    raw = path.read_bytes()
    parsed = json.loads(raw)
    result = validate(parsed)
    result.update(result='PASS', invalid_fixtures_rejected=mutation_checks(parsed), bytes=len(raw),
                  git_blob_sha=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),
                  geometry_simulation='NOT RUN', lua_runtime='NOT RUN', visual_ai_network='NOT RUN')
    print(json.dumps(result, ensure_ascii=False, indent=2))
