#!/usr/bin/env python3
"""Static design validation only; no game Lua, collision, AI, or network execution.
Run: python docs/field-boss-v1/validate_deep_ruins.py
Uses the standard library; explicit errors work with python -O as well.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def interval(value: list, limit: int, name: str) -> tuple[int, int]:
    require(isinstance(value, list) and len(value) == 2, name + ': shape')
    a, b = value
    require(type(a) is int and type(b) is int, name + ': integer ticks')
    require(0 <= a < b <= limit, name + ': bounds')
    return a, b


def validate(d: dict) -> dict:
    require(d['status'] == 'design_only_not_runtime', 'status')
    require(d['tick_rate_hz'] == 60 and d['interval_semantics'] == 'half_open', 'time base')
    bs, moves = d['bosses'], d['attacks']
    require(len(bs) == 4 and len(moves) == 12, 'batch count')
    c = d['counts']
    require((c['encounters'], c['bodies'], c['attack_cards']) == (4, 5, 12), 'counts')
    require((c['cumulative_encounters'], c['cumulative_attack_cards']) == (19, 57), 'cumulative')
    require(c['all_catalog_rows_detailed'] is False, 'completion')
    sh = d['shared']
    for key in ['multiplayer_hp_scaling', 'required_special_element', 'forced_revive_phase',
                'runtime_or_visual_tested', 'invulnerability_bypass']:
        require(sh[key] is False, key)
    require(sh['max_attack_patterns'] == 3 and sh['hp_bars'] == 1, 'scope')
    require(sh['max_concurrent_casts_per_encounter'] == 1, 'concurrency')
    require(sh['hp_zero_priority'] is True and sh['normal_damage_pipeline'] is True, 'damage contract')
    owners = {b['encounter_id']: b for b in bs}
    by_id = {a['id']: a for a in moves}
    require(len(owners) == 4 and len(by_id) == 12, 'duplicate ID')
    require(set(owners) == {'boss-24010401', 'bathysmal-herd', 'boss-26020301', 'boss-24030301'}, 'roster IDs')
    assigned = []
    for b in bs:
        require(len(b['attack_ids']) == 3, 'three patterns')
        require(b['signature'] in b['attack_ids'], 'signature')
        require(0 <= b['ground_hurtbox_bottom_u'] <= 0.5, 'ground hurtbox')
        for move_id in b['attack_ids']:
            require(move_id in by_id, 'missing attack')
            require(by_id[move_id]['encounter_id'] == b['encounter_id'], 'ownership')
        assigned.extend(b['attack_ids'])
    require(sorted(assigned) == sorted(by_id), 'assignment')
    require(sum(b['logical_bodies'] for b in bs) == c['bodies'], 'body count')
    h = owners['bathysmal-herd']
    require(h['shared_hp_receiver'] and h['both_defeated_at_shared_zero'], 'pair HP')
    require(not h['independent_ai'] and not h['active_body_contact'] and not h['energy_drain'], 'pair pressure')
    require(h['same_hit_event_max_hp_applications'] == 1 and h['separate_auras'], 'pair event ownership')
    require(h['dual_hit_resolution'] == 'earliest_intersection_then_body_id_before_damage_and_aura', 'pair arbitration')
    serpent = owners['boss-24010401']
    require(serpent['max_full_hidden_ticks'] == 36 and serpent['min_surface_casts_between_burrows'] >= 2, 'burrow budget')
    require(not serpent['requires_adjuvant'], 'gadget requirement')
    core = owners['boss-26020301']['optional_core']
    require(core['required_for_victory'] is False and core['distinct_casts'] == 3, 'regisvine core')
    require(not owners['boss-26020301']['mandatory_stamens'], 'mandatory stamens')
    require(not owners['boss-24030301']['requires_bow'] and not owners['boss-24030301']['adaptive_resistance'], 'drake gates')
    direct = shots = away_count = 0
    for a in moves:
        total, lock = a['total_ticks'], a['lock_tick']
        require(type(total) is int and type(lock) is int and 0 <= lock < total, 'clock')
        r0, r1 = interval(a['recovery'], total, a['id'] + ' recovery')
        require(r1 == total and lock < r0, 'recovery end')
        require(a['hp_attackable_during_recovery'] is True, 'real opening')
        owner = owners[a['encounter_id']]
        if a['id'] == owner['signature']:
            require(r1-r0 >= 120, 'signature opening')
        allowed = {'cryo', 'electro', 'selected'} if owner['logical_bodies'] == 2 else {'main'}
        groups, hazards = set(), []
        previous = -1
        for w in a['active_windows']:
            s, e = interval(w['window'], r0, 'active')
            require(s >= lock and s >= previous and w['body'] in allowed, 'active order/body')
            groups.add(w['hit_group']); hazards.append((s, e, w['body']))
            previous = e; direct += 1
        for p in a['projectiles']:
            s, ttl = p['spawn_tick'], p['ttl_ticks']
            require(type(s) is int and type(ttl) is int and ttl > 0, 'projectile ticks')
            require(lock <= s < s+ttl <= r0 and p['body'] in allowed, 'projectile lifetime/body')
            groups.add(p['hit_group']); hazards.append((s, s+ttl, p['body'])); shots += 1
        require(1 <= len(groups) == a['hit_cap'] <= 3, 'hit groups/cap')
        away_windows = []
        for q in a['unreachable_intervals']:
            s, e = interval(q['window'], r0, 'unreachable')
            require(lock <= s and e-s <= 36 and q['visual_and_hurtbox_together'] is True, 'away budget')
            require(q['body'] in allowed and q['kind'] in {'airborne','underground'}, 'away type/body')
            away_windows.append((s,e,q['body'])); away_count += 1
            for x,y,body in hazards:
                require(body != q['body'] or e <= x or y <= s, 'invisible damage')
        if owner['logical_bodies'] == 2:
            require(a['partner_contact'] is False, 'idle partner contact')
            for rows in (hazards, away_windows):
                for i,(s,e,body) in enumerate(rows):
                    for x,y,other in rows[i+1:]:
                        require(body == other or e <= x or y <= s, 'pair overlap')
    a = by_id['FRS02']
    require(a['active_windows'][0]['window'][0] - a['unreachable_intervals'][0]['window'][1] == a['pre_hit_visible_ticks'] >= 24, 'emerge warning')
    require(by_id['FER01']['active_windows'][0]['hit_group'] == by_id['FER01']['projectiles'][0]['hit_group'], 'slam/wave dedup')
    require(len(d['interrupts']) == c['conditional_interrupts'] == 1, 'interrupt count')
    for b in d['interrupts']:
        require(b['parent'] in by_id, 'interrupt parent')
        a = by_id[b['parent']]
        interval(b['accept_window'], a['recovery'][0], 'interrupt acceptance')
        require(b['accept_window'] == a['optional_core_window'] == [48,162], 'acceptance agreement')
        require(b['required_for_victory'] is False and b['hits_required'] == 1, 'optional interrupt')
        require(b['cancel_parent_and_projectiles'] is True and b['hp_zero_priority'] is True, 'cancel/kill priority')
        require(b['recovery_relative'] == [0,150] and b['reassemble_ticks'] == 24, 'interrupt timeline')
        require(b['core_center_z_u']-b['core_radius_u'] <= 0.5, 'core height')
    return dict(encounters=4, visible_bodies=5, attack_patterns=12, direct_windows=direct,
                projectile_spawns=shots, unreachable_intervals=away_count, conditional_interrupts=1)


def mutation_test(d: dict) -> list[str]:
    tests = [
      ('duplicate_attack', lambda x: x['attacks'][1].update(id='FRS01')),
      ('wrong_owner', lambda x: x['attacks'][0].update(encounter_id='bathysmal-herd')),
      ('missing_reference', lambda x: x['bosses'][0]['attack_ids'].__setitem__(0,'NONE')),
      ('missing_signature', lambda x: x['bosses'][0].update(signature='NONE')),
      ('fourth_pattern', lambda x: x['bosses'][0]['attack_ids'].append('FRS01')),
      ('second_hp_bar', lambda x: x['shared'].update(hp_bars=2)),
      ('scaled_hp', lambda x: x['shared'].update(multiplayer_hp_scaling=True)),
      ('required_element', lambda x: x['shared'].update(required_special_element=True)),
      ('forced_revive', lambda x: x['shared'].update(forced_revive_phase=True)),
      ('death_not_first', lambda x: x['shared'].update(hp_zero_priority=False)),
      ('late_lock', lambda x: x['attacks'][0].update(lock_tick=109)),
      ('hit_after_recovery', lambda x: x['attacks'][0]['active_windows'][0].update(window=[108,157])),
      ('persistent_projectile', lambda x: x['attacks'][4]['projectiles'][0].update(ttl_ticks=200)),
      ('long_hidden', lambda x: x['attacks'][1]['unreachable_intervals'][0].update(window=[77,114])),
      ('both_airborne', lambda x: x['attacks'][5]['unreachable_intervals'][1].update(window=[90,126])),
      ('independent_pair_ai', lambda x: x['bosses'][1].update(independent_ai=True)),
      ('double_hp_hit', lambda x: x['bosses'][1].update(same_hit_event_max_hp_applications=2)),
      ('iframe_bypass', lambda x: x['shared'].update(invulnerability_bypass=True)),
      ('core_required', lambda x: x['interrupts'][0].update(required_for_victory=True)),
      ('wrong_core_deadline', lambda x: x['interrupts'][0].update(accept_window=[48,163])),
      ('split_slam_wave', lambda x: x['attacks'][6]['projectiles'][0].update(hit_group='extra')),
      ('unknown_body', lambda x: x['attacks'][0]['active_windows'][0].update(body='ghost')),
      ('wrong_cumulative', lambda x: x['counts'].update(cumulative_encounters=20)),
      ('fake_opening', lambda x: x['attacks'][0].update(hp_attackable_during_recovery=False)),
    ]
    rejected=[]
    for name, edit in tests:
        bad=copy.deepcopy(d); edit(bad)
        try: validate(bad)
        except (ValueError, KeyError, TypeError): rejected.append(name)
        else: raise RuntimeError('Mutation accepted: ' + name)
    return rejected


if __name__ == '__main__':
    path=Path(__file__).with_name('MANIFEST_DEEP_RUINS.json')
    raw=path.read_bytes(); data=json.loads(raw)
    results=validate(data)
    rejected=mutation_test(data)
    sha=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    print(json.dumps(dict(result='PASS', **results, rejected_mutations=len(rejected),
                         mutation_names=rejected, manifest_bytes=len(raw), git_blob_sha=sha,
                         scope='Structure and timing declarations only',
                         game_lua_collision_ai_network_visual='NOT RUN'),ensure_ascii=False,indent=2))
