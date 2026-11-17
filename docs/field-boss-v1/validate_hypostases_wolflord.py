#!/usr/bin/env python3
"""Validate design structure/timing, not game collision, AI or networking.
Run with standard Python: python docs/field-boss-v1/validate_hypostases_wolflord.py
Mutation tests verify this checker only. No third-party packages or network.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path

EXPECTED = {
    'boss-20040501': ['FHC01', 'FHC02', 'FHC03'],
    'boss-20040601': ['FHP01', 'FHP02', 'FHP03'],
    'boss-20040401': ['FHH01', 'FHH02', 'FHH03'],
    'boss-22060101': ['FWL01', 'FWL02', 'FWL03'],
}


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def integer(x: object) -> bool:
    return type(x) is int


def validate(data: dict) -> dict:
    require(data['status'] == 'design_only_not_runtime', 'status')
    require(data['tick_rate_hz'] == 60 and data['unit_U_pixels'] == 88, 'units')
    require(data['interval_semantics'] == 'half_open', 'intervals')
    counts, shared = data['counts'], data['shared']
    require((counts['bosses'], counts['attack_cards']) == (4, 12), 'batch counts')
    require((counts['cumulative_bosses'], counts['cumulative_attack_cards']) == (15, 45), 'cumulative counts')
    require(counts['catalog_reference_rows'] == 49 and counts['all_catalog_rows_detailed'] is False, 'catalog scope')
    for key, expected in {
        'max_attack_patterns': 3, 'max_concurrent_casts': 1, 'hp_bars': 1,
        'multiplayer_hp_scaling': False, 'required_special_element': False,
        'forced_revive_phase': False, 'hp_zero_priority': True,
        'normal_damage_pipeline': True, 'hp_receiver_id_stable': True,
        'visible_hurtbox_tracks_pose': True, 'runtime_or_visual_tested': False,
    }.items():
        require(type(shared[key]) is type(expected) and shared[key] == expected, key)
    bosses, attacks = data['bosses'], data['attacks']
    require(len(bosses) == 4 and len(attacks) == 12, 'actual counts')
    by_boss = {b['encounter_id']: b for b in bosses}
    by_attack = {a['id']: a for a in attacks}
    require(len(by_boss) == 4 and set(by_boss) == set(EXPECTED), 'boss IDs')
    require(len(by_attack) == 12, 'duplicate attack ID')
    assigned = []
    for boss_id, ids in EXPECTED.items():
        b = by_boss[boss_id]
        require(b['attack_ids'] == ids and b['signature'] in ids, 'owner/signature')
        require(b['hp_attackable_during_combat'] is True, 'HP access')
        require(0 <= b['ground_hurtbox_bottom_u'] <= 0.5, 'ground receiver')
        for attack_id in ids:
            require(by_attack[attack_id]['encounter_id'] == boss_id, 'attack owner')
        assigned.extend(ids)
    require(sorted(assigned) == sorted(by_attack), 'unassigned attack')
    for boss_id, key in [
        ('boss-20040501', 'required_frostfruit_trial'),
        ('boss-20040601', 'required_ignition_trial'),
        ('boss-20040401', 'healing_droplets'),
        ('boss-22060101', 'required_skull_shield_trial'),
        ('boss-22060101', 'party_corrosion'),
    ]:
        require(by_boss[boss_id][key] is False, key)
    direct_count = shot_count = air_count = 0
    for a in attacks:
        total, lock = a['total_ticks'], a['lock_tick']
        rs, re = a['recovery']
        require(all(integer(x) for x in (total, lock, rs, re)), 'integer ticks')
        require(0 <= lock < rs < re == total, 'timeline bounds')
        groups = a['groups']
        require(groups and all(integer(cap) and cap == 1 for cap in groups.values()), 'group caps')
        require(integer(a['hit_cap']) and a['hit_cap'] == sum(groups.values()) <= 3, 'cast cap')
        used = set()
        starts = []
        previous_end = -1
        for w in a['active']:
            start, end, group = w['start'], w['end'], w['group']
            require(integer(start) and integer(end), 'direct integer ticks')
            require(lock <= start < end <= rs and start >= previous_end, 'active bounds/order')
            require(group in groups, 'direct group reference')
            previous_end = end
            used.add(group)
            starts.append(start)
            direct_count += 1
        for p in a['projectiles']:
            require(integer(p['ttl_ticks']) and p['ttl_ticks'] > 0, 'projectile lifetime')
            require(len(p['spawn_ticks']) == len(p['groups']) > 0, 'projectile groups')
            require(p['spawn_ticks'] == sorted(set(p['spawn_ticks'])), 'projectile order')
            for spawn, group in zip(p['spawn_ticks'], p['groups']):
                require(integer(spawn) and lock <= spawn and spawn + p['ttl_ticks'] <= rs, 'projectile end')
                require(group in groups, 'projectile group reference')
                used.add(group)
                starts.append(spawn)
                shot_count += 1
        require(starts and used == set(groups), 'unused group or no damage')
        for start, end in a['airborne']:
            require(integer(start) and integer(end), 'air integer ticks')
            require(lock <= start < end <= min(starts) and end - start <= 36, 'airborne bounds')
            air_count += 1
        if 'travel_u_max' in a:
            require(0 < a['travel_u_max'] <= 3, 'travel budget')
    ray = by_attack['FHH02']
    require(ray['groups'] == {'ray_wave': 1} and ray['hit_cap'] == 1, 'ray one-hit group')
    require(ray['active'][0]['group'] == ray['projectiles'][0]['groups'][0], 'ray shared group')
    signature_recovery = {}
    for boss_id, b in by_boss.items():
        a = by_attack[b['signature']]
        duration = a['recovery'][1] - a['recovery'][0]
        require(duration >= 120, 'signature recovery budget')
        signature_recovery[boss_id] = duration
    require((direct_count, shot_count, air_count) == (14, 6, 3), 'event counts')
    return {'bosses': 4, 'attacks': 12, 'direct_windows': direct_count,
            'projectile_spawns': shot_count, 'airborne_windows': air_count,
            'signature_recovery_ticks': signature_recovery}


def mutate(data: dict, path: tuple, value: object) -> dict:
    result = copy.deepcopy(data)
    node = result
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return result


def self_test(data: dict) -> int:
    cases = [
        (('attacks', 1, 'id'), 'FHC01'),
        (('attacks', 0, 'encounter_id'), 'boss-20040401'),
        (('bosses', 0, 'signature'), 'MISSING'),
        (('bosses', 0, 'attack_ids'), ['FHC01', 'FHC02', 'MISSING']),
        (('shared', 'hp_bars'), 2),
        (('shared', 'multiplayer_hp_scaling'), True),
        (('shared', 'forced_revive_phase'), True),
        (('shared', 'visible_hurtbox_tracks_pose'), False),
        (('status',), 'runtime_complete'),
        (('attacks', 0, 'lock_tick'), 109),
        (('attacks', 0, 'active', 0, 'end'), 300),
        (('attacks', 2, 'active', 1, 'start'), 110),
        (('attacks', 4, 'projectiles', 0, 'ttl_ticks'), 200),
        (('attacks', 7, 'projectiles', 0, 'groups'), ['UNKNOWN']),
        (('attacks', 7, 'hit_cap'), 2),
        (('attacks', 5, 'airborne', 0, 1), 115),
        (('bosses', 0, 'ground_hurtbox_bottom_u'), 0.9),
        (('bosses', 3, 'party_corrosion'), True),
        (('bosses', 2, 'healing_droplets'), True),
        (('counts', 'cumulative_attack_cards'), 44),
    ]
    for path, value in cases:
        try:
            validate(mutate(data, path, value))
        except (ValueError, KeyError, TypeError, IndexError):
            continue
        raise RuntimeError(f'Mutation was not rejected: {path!r}')
    return len(cases)


def main() -> None:
    path = Path(__file__).with_name('MANIFEST_HYPOSTASES_WOLFLORD.json')
    raw = path.read_bytes()
    data = json.loads(raw)
    result = validate(data)
    result.update(result='PASS', rejected_mutations=self_test(data),
                  manifest_bytes=len(raw),
                  manifest_git_blob=hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(),
                  scope='Design structure/timing only; runtime, geometry, AI, visuals NOT RUN')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
