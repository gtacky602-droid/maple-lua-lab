#!/usr/bin/env python3
"""Validate design contracts/timing only, not Lua, collision, AI, or networking.
Run: python docs/field-boss-v1/validate_sumeru_field.py
Standard library only; explicit exceptions also work under python -O.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path

EXPECTED = {
    'boss-20040701': ['FHD01', 'FHD02', 'FHD03'],
    'boss-24050101': ['FMT01', 'FMT02', 'FMT03'],
    'boss-26130101': ['FWN01', 'FWN02', 'FWN03'],
    'boss-22100501': ['FIB01', 'FIB02', 'FIB03'],
}

def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)

def validate(d: dict) -> dict:
    require(d['status'] == 'design_only_not_runtime', 'status')
    require(d['tick_rate_hz'] == 60 and d['unit_U_pixels'] == 88, 'units')
    require(d['interval_semantics'] == 'half_open', 'intervals')
    c = d['counts']
    require((c['encounters'], c['attack_cards']) == (4, 12), 'counts')
    require((c['cumulative_encounters'], c['cumulative_attack_cards']) == (23, 69), 'cumulative')
    require(c['catalog_reference_rows'] == 49 and c['all_catalog_rows_detailed'] is False, 'scope')
    for key, value in {'max_attack_patterns':3, 'max_concurrent_casts':1, 'hp_bars':1,
                       'multiplayer_hp_scaling':False, 'required_special_element':False,
                       'forced_revive_phase':False, 'hp_zero_priority':True,
                       'normal_damage_pipeline':True, 'hp_receiver_id_stable':True,
                       'runtime_or_visual_tested':False}.items():
        require(type(d['shared'][key]) is type(value) and d['shared'][key] == value, key)
    bosses = {b['id']: b for b in d['bosses']}
    attacks = {a['id']: a for a in d['attacks']}
    require(len(d['bosses']) == len(bosses) == 4, 'duplicate boss')
    require(len(d['attacks']) == len(attacks) == 12, 'duplicate attack')
    require(set(bosses) == set(EXPECTED), 'boss IDs')
    require(set(attacks) == {i for ids in EXPECTED.values() for i in ids}, 'attack IDs')
    for bid, ids in EXPECTED.items():
        b = bosses[bid]
        require(b['attacks'] == ids and b['signature'] in ids, 'ownership/signature')
        require(0 <= b['hurtbox_bottom_u'] <= 0.5, 'ground reach declaration')
        for mid in ids:
            require(attacks[mid]['owner'] == bid, 'owner')
        sig = attacks[b['signature']]
        require(sig['recovery'][1] - sig['recovery'][0] == 144, 'signature opening')
    n_windows = n_projectiles = n_air = n_burrow = 0
    for a in d['attacks']:
        total, lock = a['total'], a['lock']
        rs, re = a['recovery']
        require(all(type(v) is int for v in (total, lock, rs, re)), 'integer ticks')
        require(0 <= lock < rs < re == total, 'timing order')
        groups, starts = [], []
        last_end = -1
        for start, end, group in a['windows']:
            require(type(start) is int and type(end) is int, 'window ticks')
            require(lock <= start < end <= rs and start >= last_end, 'window order')
            require(isinstance(group, str) and bool(group), 'hit group')
            last_end = end
            groups.append(group)
            starts.append(start)
            n_windows += 1
        for spawn, ttl, group in a['projectiles']:
            require(type(spawn) is int and type(ttl) is int, 'projectile ticks')
            require(lock <= spawn and ttl > 0 and spawn + ttl <= rs, 'projectile lifetime')
            require(isinstance(group, str) and bool(group), 'projectile group')
            groups.append(group)
            starts.append(spawn)
            n_projectiles += 1
        require(groups and len(groups) == len(set(groups)), 'distinct hit groups')
        require(type(a['max_hits']) is int and a['max_hits'] == len(groups) <= 3, 'hit cap')
        for field in ('airborne', 'underground'):
            if field in a:
                start, end = a[field]
                require(type(start) is int and type(end) is int, 'movement ticks')
                require(lock <= start < end <= min(starts) and end-start <= 36, 'short unreachable interval')
                n_air += int(field == 'airborne')
                n_burrow += int(field == 'underground')
    grass, matrix, worm, baptist = [bosses[k] for k in EXPECTED]
    require(grass['required_cleansing'] is False, 'cleansing gate')
    require(matrix['required_component_break'] is False, 'component gate')
    cam = matrix['camouflage']
    require(0.45 <= cam['min_body_opacity'] <= 1 and cam['core_outline_opacity'] == 1, 'readable camouflage')
    require(cam['fully_hidden_ticks'] == 0 and cam['targetable'] is True, 'camouflage target')
    require(cam['extra_resistance'] is False and cam['reset_status'] is False, 'camouflage state')
    require(cam['reduced_transparency_opaque'] is True, 'accessibility')
    m = attacks['FMT03']
    require(m['visible_move'] == [72,108] and m['restored_at'] == 108, 'visible move')
    require(m['windows'][0][0] - m['restored_at'] >= 36, 'restored warning')
    require(worm['required_windbite_break'] is False and worm['min_ground_casts_between_burrows'] >= 2, 'worm gate/frequency')
    w = attacks['FWN03']
    require(w['reappears_at'] == w['underground'][1], 'reappearance')
    require(w['projectiles'][0][0] - w['reappears_at'] >= 30, 'emergence warning')
    require(baptist['required_shield_break'] is False and baptist['floor_rings_targetable'] is False, 'baptist gate')
    require(baptist['element_slots']['source'] == 'existing_variant' and baptist['element_slots']['fixed_per_encounter'] is True, 'variant')
    require(attacks['FIB01']['element_slot'] == 0 and attacks['FIB02']['element_slot'] == 1, 'element slots')
    require(attacks['FIB03']['element_slots'] == [0,1,2] and attacks['FIB03']['rings_required_to_break'] is False, 'rings')
    return {'encounters':4, 'patterns':12, 'active_windows':n_windows,
            'projectile_spawns':n_projectiles, 'airborne_intervals':n_air,
            'underground_intervals':n_burrow, 'signature_opening_ticks':144}

def mutation_checks(d: dict) -> int:
    cases = [
        (('status',), 'runtime'), (('tick_rate_hz',), 30),
        (('counts','cumulative_encounters'), 24),
        (('shared','multiplayer_hp_scaling'), True),
        (('shared','required_special_element'), True),
        (('shared','forced_revive_phase'), True),
        (('bosses',0,'signature'), 'FIB03'),
        (('bosses',0,'hurtbox_bottom_u'), 2.0),
        (('bosses',0,'required_cleansing'), True),
        (('bosses',1,'camouflage','min_body_opacity'), 0.1),
        (('bosses',1,'camouflage','targetable'), False),
        (('bosses',1,'camouflage','reset_status'), True),
        (('bosses',1,'camouflage','reduced_transparency_opaque'), False),
        (('bosses',2,'required_windbite_break'), True),
        (('bosses',3,'required_shield_break'), True),
        (('attacks',0,'id'), 'FHD02'),
        (('attacks',0,'owner'), 'boss-22100501'),
        (('attacks',0,'lock'), 200),
        (('attacks',0,'windows',0,1), 400),
        (('attacks',2,'projectiles',0,1), 500),
        (('attacks',1,'airborne',0), 54),
        (('attacks',8,'reappears_at'), 140),
        (('attacks',11,'element_slots'), [0,0,0]),
        (('attacks',11,'rings_required_to_break'), True),
    ]
    for path, value in cases:
        changed = copy.deepcopy(d)
        target = changed
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        try:
            validate(changed)
        except (ValueError, KeyError, TypeError, IndexError):
            continue
        raise RuntimeError(f'Undetected invalid fixture: {path}')
    return len(cases)

if __name__ == '__main__':
    path = Path(__file__).with_name('MANIFEST_SUMERU_FIELD.json')
    raw = path.read_bytes()
    data = json.loads(raw)
    result = validate(data)
    result.update(result='PASS', invalid_fixtures_rejected=mutation_checks(data),
                  manifest_git_blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),
                  manifest_bytes=len(raw), scope='design structure and timing only',
                  runtime_geometry_visual_ai_network='NOT RUN')
    print(json.dumps(result, ensure_ascii=False, indent=2))
