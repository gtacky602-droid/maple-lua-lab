#!/usr/bin/env python3
"""Static design validation only: no Lua, collision, AI, rendering or network test.
Run: python docs/field-boss-v1/validate_fontaine_field.py
Standard library only. Explicit exceptions remain enabled under python -O.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def interval(value: list, limit: int) -> tuple[int, int]:
    require(isinstance(value, list) and len(value) == 2, 'interval shape')
    a, b = value
    require(type(a) is int and type(b) is int, 'integer ticks required')
    require(0 <= a < b <= limit, 'interval bounds')
    return a, b


def validate(d: dict) -> dict:
    require(d['status'] == 'design_only_not_runtime', 'scope')
    require(d['tick_rate_hz'] == 60 and d['interval_semantics'] == 'half_open', 'timebase')
    counts = d['counts']
    require(counts == dict(encounters=4, attack_cards=12, optional_interrupts=2,
        gravity_fields=1, cumulative_encounters=27, cumulative_attack_cards=81,
        catalog_reference_rows=49, all_catalog_rows_detailed=False), 'counts')
    common = d['shared']
    for k in ('multiplayer_hp_scaling', 'required_special_element',
              'forced_revive_phase', 'runtime_or_visual_tested'):
        require(common[k] is False, k)
    for k in ('hp_zero_priority', 'normal_damage_pipeline'):
        require(common[k] is True, k)
    require(common['max_attack_patterns'] == 3 and common['max_concurrent_casts'] == 1
            and common['hp_bars'] == 1, 'complexity budget')
    bosses, attacks = d['bosses'], d['attacks']
    require(len(bosses) == 4 and len(attacks) == 12, 'record count')
    by_id = {a['id']: a for a in attacks}
    require(len(by_id) == 12, 'duplicate attack ID')
    expected = {'boss-26160302': 'FCR', 'boss-26180101': 'FSH',
                'boss-24080101': 'FEG', 'boss-20051201': 'FHT'}
    require({b['encounter_id'] for b in bosses} == set(expected), 'existing boss IDs')
    assigned = []
    for b in bosses:
        ids = [expected[b['encounter_id']] + f'{i:02d}' for i in (1, 2, 3)]
        require(b['attack_ids'] == ids and b['signature'] == ids[-1], 'ownership/signature')
        require(b['hp_attackable_during_combat'] is True, 'HP lock')
        require(0 <= b['hurtbox_bottom_u'] <= .5, 'low visible hurtbox')
        for mid in ids:
            require(by_id[mid]['encounter_id'] == b['encounter_id'], 'wrong owner')
        assigned.extend(ids)
    require(sorted(assigned) == sorted(by_id), 'orphan attack')
    require(bosses[3]['half_tulpa_combat'] is False and
            bosses[3]['absorption_buffs'] is False, 'new minion/buff logic')
    direct = shots = air_count = 0
    for a in attacks:
        total, lock = a['total_ticks'], a['lock_tick']
        require(type(total) is int and type(lock) is int, 'integer timeline')
        start, end = interval(a['recovery'], total)
        require(end == total and 0 <= lock < start, 'recovery/lock')
        require(a['hp_attackable_during_recovery'] is True, 'fake recovery')
        require(1 <= a['hit_cap'] <= 3, 'hit cap')
        groups, previous = set(), -1
        for w in a['active_windows']:
            lo, hi = interval(w['interval'], total)
            require(lock <= lo and previous <= lo and hi <= start, 'active order')
            previous = hi
            groups.add(w['group']); direct += 1
        for p in a['projectiles']:
            sp, ttl = p['spawn_tick'], p['ttl_ticks']
            require(type(sp) is int and type(ttl) is int and ttl > 0, 'projectile ticks')
            require(lock <= sp < sp + ttl <= start, 'projectile lifetime')
            require(p['direction'] in (-1, 1), 'projectile direction')
            groups.add(p['group']); shots += 1
        require(groups == set(a['group_caps']), 'group reference')
        require(all(x == 1 for x in a['group_caps'].values()), 'one hit per group')
        require(sum(a['group_caps'].values()) == a['hit_cap'], 'group/cast cap')
        for w in a['airborne_windows']:
            lo, hi = interval(w, total)
            require(lock <= lo and hi <= start and hi-lo <= 36, 'airborne budget')
            air_count += 1
    require((direct, shots, air_count) == (13, 10, 2), 'timeline totals')
    require(by_id['FSH03']['hit_cap'] == 1 and
        set(by_id['FSH03']['group_caps']) == {'landing_ring'}, 'landing/ring double hit')
    for b in bosses:
        a = by_id[b['signature']]
        require(a['recovery'][1] - a['recovery'][0] == 144, 'signature recovery')
    gravity = by_id['FEG03']['gravity']
    ga, gb = interval(gravity['admission_window'], by_id['FEG03']['total_ticks'])
    require([ga, gb] == [60, 300] and gravity['gravity_scale'] == .85, 'gravity window/scale')
    require(gravity['jump_velocity_scale'] == 1 and gravity['sample'] == 'basic_jump_takeoff_only', 'jump contract')
    require(gravity['affects_existing_airborne'] is False and gravity['stacking'] is False, 'midair/stacking')
    require(gravity['max_flight_modifier_ticks'] == 96 and
            gb-1+96 <= by_id['FEG03']['total_ticks'], 'modifier outlives cast')
    require(gravity['expiry'] == 'landing_or_cap' and gravity['cleanup_on_exit'] is True
        and gravity['reset_velocity_on_cleanup'] is False and gravity['base_jump_can_evade'] is True, 'gravity cleanup/fallback')
    ps = by_id['FEG03']['projectiles']
    require([p['spawn_tick'] for p in ps] == [132,132,240,240], 'wave spacing')
    require([p['direction'] for p in ps] == [-1,1,-1,1], 'two-sided pulses')
    ints = d['interrupts']
    require(len(ints) == 2 and {i['id'] for i in ints} == {'horn','pearl'}, 'interrupts')
    expected_int = {'horn': ('FCR03', [[60,144],[180,324]], 240),
                    'pearl': ('FSH02', [[48,204]], 180)}
    for i in ints:
        mid, windows, recovery = expected_int[i['id']]
        require(i['attack_id'] == mid and i['accept_windows'] == windows, 'weakpoint windows')
        for w in windows:
            interval(w, by_id[mid]['total_ticks'])
        require(i['recovery_ticks'] == recovery and i['standup_ticks'] == 24, 'interrupt recovery')
        require(i['required_casts'] == 3 and i['progress_unit'] == 'distinct_cast_with_part_collision'
                and i['progress_persists_between_casts'] is True, 'weakpoint progress')
        require(0 <= i['part_center_z_u'] - i['part_radius_u'] <= .5, 'weakpoint reach')
        require(i['rearm_after_recovery_ticks'] == 1200, 'rearm')
        require(i['required_for_victory'] is False and i['extra_hp_damage'] is False, 'optional not mandatory')
        require(i['cancel_parent_timers'] is True and i['clear_parent_projectiles'] is True
                and i['hp_zero_priority'] is True, 'parent cleanup')
    return {'result':'PASS','encounters':4,'attack_patterns':12,'direct_windows':direct,
            'projectile_spawns':shots,'airborne_windows':air_count,'optional_interrupts':2,
            'gravity_fields':1,'runtime_collision_AI_network_visual':'NOT RUN'}


def mutations(d: dict) -> int:
    cases = [
      (['counts','cumulative_encounters'],28),
      (['attacks',1,'id'],'FCR01'),
      (['attacks',0,'encounter_id'],'boss-20051201'),
      (['bosses',0,'signature'],'FCR02'),
      (['bosses',0,'hurtbox_bottom_u'],1.2),
      (['shared','multiplayer_hp_scaling'],True),
      (['shared','required_special_element'],True),
      (['shared','forced_revive_phase'],True),
      (['attacks',0,'lock_tick'],100),
      (['attacks',0,'active_windows',0,'interval'],[102,96]),
      (['attacks',0,'active_windows',1,'interval'],[156,240]),
      (['attacks',1,'projectiles',1,'ttl_ticks'],100),
      (['attacks',5,'group_caps','landing_ring'],2),
      (['attacks',5,'airborne_windows',0],[60,114]),
      (['attacks',8,'projectiles',1,'direction'],-1),
      (['attacks',8,'gravity','gravity_scale'],.5),
      (['attacks',8,'gravity','affects_existing_airborne'],True),
      (['attacks',8,'gravity','stacking'],True),
      (['attacks',8,'gravity','max_flight_modifier_ticks'],300),
      (['attacks',8,'gravity','cleanup_on_exit'],False),
      (['interrupts',0,'required_for_victory'],True),
      (['interrupts',1,'clear_parent_projectiles'],False),
      (['interrupts',0,'required_casts'],20),
      (['bosses',3,'absorption_buffs'],True),
    ]
    for path, value in cases:
        bad = copy.deepcopy(d); node = bad
        for key in path[:-1]: node = node[key]
        node[path[-1]] = value
        try:
            validate(bad)
        except (ValueError, KeyError, TypeError):
            continue
        raise RuntimeError(f'Invalid fixture accepted: {path}')
    return len(cases)


def git_blob(raw: bytes) -> str:
    return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()


if __name__ == '__main__':
    path = Path(__file__).with_name('MANIFEST_FONTAINE_FIELD.json')
    raw = path.read_bytes(); data = json.loads(raw)
    result = validate(data); result['rejected_mutations'] = mutations(data)
    result['manifest_bytes'] = len(raw); result['manifest_blob'] = git_blob(raw)
    result['validator_blob'] = git_blob(Path(__file__).read_bytes())
    print(json.dumps(result, ensure_ascii=False, indent=2))
