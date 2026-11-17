#!/usr/bin/env python3
"""Static DESIGN validation, not Lua execution or a dodge/AI/network playtest.

Run from any directory: python validate_liyue_field.py
Uses only the standard library. Mutation tests test this validator, not the game.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path

EXPECTED = {
    'boss-26020201': ['FP01', 'FP02', 'FP03'],
    'boss-20040301': ['FG01', 'FG02', 'FG03'],
    'boss-26050101': ['FV01', 'FV02', 'FV03'],
}


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise ValueError(reason)


def integer(value: object) -> bool:
    return type(value) is int


def interval(value: object, lo: int, hi: int, label: str) -> None:
    require(isinstance(value, list) and len(value) == 2, label + ': pair required')
    require(all(integer(x) for x in value), label + ': integer ticks required')
    require(lo <= value[0] < value[1] <= hi, label + ': invalid half-open interval')


def validate(d: dict) -> dict:
    require(d['status'] == 'design_only_not_runtime', 'scope')
    require(d['tick_rate_hz'] == 60 and d['interval_semantics'] == 'half_open', 'clock')
    require(d['unit_U_pixels'] == 88, 'unit')
    require(len(d['bosses']) == d['counts']['bosses'] == 3, 'boss count')
    require(len(d['attacks']) == d['counts']['attack_cards'] == 9, 'attack count')
    require(d['counts']['cumulative_bosses'] == 7 and d['counts']['cumulative_attack_cards'] == 21, 'cumulative design count')
    require(d['counts']['all_catalog_rows_detailed'] is False, 'completion claim')
    shared = d['shared']
    require(shared['hp_bars'] == 1 and shared['max_concurrent_casts'] == 1 and shared['max_attack_patterns'] == 3, 'scope budget')
    for key in ('multiplayer_hp_scaling', 'required_special_element', 'forced_revive_phase', 'runtime_or_visual_tested'):
        require(shared[key] is False, key)
    require(shared['hp_zero_priority'] is True and shared['normal_damage_pipeline'] is True, 'damage policy')
    by_id = {a['id']: a for a in d['attacks']}
    require(len(by_id) == 9, 'duplicate ID')
    require({b['encounter_id'] for b in d['bosses']} == set(EXPECTED), 'boss roster')
    assigned = []
    for b in d['bosses']:
        ids = b['attack_ids']
        require(ids == EXPECTED[b['encounter_id']], 'attack ownership list')
        require(b['signature'] in ids, 'signature reference')
        require(b['hp_attackable_during_combat'] is True, 'HP gate')
        require(0 <= b['hurtbox_bottom_u'] <= 0.5, 'ground target definition')
        for mid in ids:
            require(by_id[mid]['encounter_id'] == b['encounter_id'], 'wrong owner')
        assigned.extend(ids)
        if 'optional_core' in b:
            require(b['optional_core']['required_for_victory'] is False, 'core made mandatory')
            require(b['optional_core']['stagger_ticks'] == 240 and b['optional_core']['rearm_after_stagger_ticks'] == 1200, 'core timers')
    require(sorted(assigned) == sorted(by_id), 'orphan move')
    windows = shots = branches = 0
    for a in d['attacks']:
        total, lock, rec = a['total_ticks'], a['lock_tick'], a['recovery']
        require(integer(total) and integer(lock) and 0 <= lock < total, 'total/lock')
        interval(rec, lock, total, a['id'] + ' recovery')
        require(rec[1] == total, 'recovery end')
        end = lock
        for win in a['active_windows']:
            interval(win, end, rec[0], a['id'] + ' active')
            end = win[1]
            windows += 1
        for p in a['projectiles']:
            require(integer(p['ttl_ticks']) and p['ttl_ticks'] > 0, 'TTL')
            require(p['spawn_ticks'] == sorted(set(p['spawn_ticks'])), 'duplicate/unsorted shot')
            for t in p['spawn_ticks']:
                require(integer(t) and lock <= t and t + p['ttl_ticks'] <= rec[0], 'projectile outlives active period')
                shots += 1
        require(a['active_windows'] or a['projectiles'], 'empty attack')
        require(integer(a['hit_cap']) and 1 <= a['hit_cap'] <= 3, 'hit cap')
        require(a['hp_attackable_during_recovery'] is True and a['detached_damage_hazards'] is False, 'recovery/hazard')
        if 'optional_interrupt' in a:
            o = a['optional_interrupt']
            interval(o['accept_window'], 0, a['active_windows'][0][0], 'optional acceptance')
            require(o['object_expiry_tick'] == a['active_windows'][-1][1], 'pillar expiry')
            require(o['distinct_casts'] == 3 and o['required_for_victory'] is False and o['object_is_solid'] is False, 'optional pillar')
            require(o['cancel_pending_hazards'] is True and o['success_resolved_separately_from_base_total'] is True, 'success cleanup')
            s = o['success_offsets']
            interval(s['exposure'], 0, s['end_tick'], 'pillar exposure')
            interval(s['non_damage_reform'], s['exposure'][1], s['end_tick'], 'pillar reform')
            require(s['exposure'] == [0,150] and s['non_damage_reform'] == [150,174] and s['end_tick'] == 174, 'success offsets')
            branches += 1
        if 'shield_bonus' in a:
            s = a['shield_bonus']
            require(s['requires_actual_absorbed_damage_positive'] is True and s['requires_this_attack_group'] is True, 'shield trigger')
            require(s['trigger_window'] == a['active_windows'][0], 'shield trigger interval')
            require(s['max_applications_per_cast_all_players'] == 1 and s['extra_hp_damage'] == 0 and s['required_for_victory'] is False, 'shield policy')
            interval(s['extended_recovery'], rec[0], s['extended_total_ticks'], 'shield recovery')
            require(s['extended_recovery'][0] == rec[0] and s['extended_recovery'][1] == s['extended_total_ticks'], 'shield end')
            require(s['extended_total_ticks'] - total == s['bonus_ticks'] == 60, 'shield bonus')
            branches += 1
    require(by_id['FP01']['hit_cap'] == 1 and by_id['FP01']['shared_hit_group'] == 'slam_and_wave_per_actor', 'slam/wave deduplication')
    require(branches == d['counts']['conditional_branches'] == 2, 'branch count')
    return {'bosses':3, 'attacks':9, 'active_windows':windows, 'projectile_spawns':shots, 'conditional_branches':branches}


def mutation_tests(data: dict) -> int:
    cases = [
        lambda d: d['attacks'][1].update(id='FP01'),
        lambda d: d['attacks'][0].update(encounter_id='boss-20040301'),
        lambda d: d['bosses'][0].update(hurtbox_bottom_u=0.9),
        lambda d: d['attacks'][0].update(recovery=[80,300]),
        lambda d: d['attacks'][1]['projectiles'][0].update(ttl_ticks=300),
        lambda d: d['attacks'][5]['optional_interrupt'].update(required_for_victory=True),
        lambda d: d['attacks'][5]['optional_interrupt'].update(accept_window=[36,151]),
        lambda d: d['attacks'][5]['optional_interrupt'].update(cancel_pending_hazards=False),
        lambda d: d['attacks'][8]['shield_bonus'].update(max_applications_per_cast_all_players=4),
        lambda d: d['attacks'][8]['shield_bonus'].update(extended_total_ticks=347),
        lambda d: d['attacks'][0].update(hit_cap=2),
        lambda d: d['shared'].update(runtime_or_visual_tested=True),
    ]
    for index, mutate in enumerate(cases):
        modified = copy.deepcopy(data)
        mutate(modified)
        try:
            validate(modified)
        except ValueError:
            continue
        raise RuntimeError(f'Invalid fixture {index} was incorrectly accepted')
    return len(cases)


if __name__ == '__main__':
    path = Path(__file__).with_name('MANIFEST_LIYUE_FIELD.json')
    raw = path.read_bytes()
    d = json.loads(raw)
    result = validate(d)
    result.update(result='PASS', mutation_cases_rejected=mutation_tests(d),
                  bytes=len(raw), git_blob_sha=hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(),
                  scope='Static design constraints only; not runtime/geometry/balance/AI/network verification')
    print(json.dumps(result, ensure_ascii=False, indent=2))
