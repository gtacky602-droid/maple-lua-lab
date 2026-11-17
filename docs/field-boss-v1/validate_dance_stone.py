#!/usr/bin/env python3
"""Static design checks only. No Lua, collision, AI, audio or multiplayer execution.
Run: python docs/field-boss-v1/validate_dance_stone.py
Uses only the standard library; explicit errors also work with python -O.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path


def require(ok, message):
    if not ok:
        raise ValueError(message)


def integer(value):
    return type(value) is int


def interval(value, low, high, label):
    require(len(value) == 2 and all(integer(x) for x in value), label)
    require(low <= value[0] < value[1] <= high, label)


def validate(data):
    require(data['status'] == 'design_only_not_runtime', 'status')
    require(data['tick_rate_hz'] == 60 and data['unit_U_pixels'] == 88, 'units')
    require(data['interval_semantics'] == 'half_open', 'interval convention')
    expected = {'encounters':4, 'attack_cards':12, 'cumulative_encounters':31,
                'cumulative_attack_cards':93, 'catalog_reference_rows':49,
                'all_catalog_rows_detailed':False}
    require(data['counts'] == expected, 'counts')
    shared = data['shared']
    for key, value in {'max_attack_patterns':3, 'max_concurrent_casts':1,
                       'hp_bars':1, 'multiplayer_hp_scaling':False,
                       'required_special_element':False, 'forced_revive_phase':False,
                       'hp_zero_priority':True, 'normal_damage_pipeline':True,
                       'runtime_or_visual_tested':False}.items():
        require(type(shared[key]) is type(value) and shared[key] == value, key)
    bosses = {b['encounter_id']:b for b in data['bosses']}
    moves = {a['id']:a for a in data['attacks']}
    require(len(bosses) == len(data['bosses']) == 4, 'boss IDs')
    require(len(moves) == len(data['attacks']) == 12, 'move IDs')
    assigned = []
    for b in bosses.values():
        require(len(b['attack_ids']) == 3, 'three patterns')
        require(b['signature'] in b['attack_ids'], 'signature')
        require(b['hp_attackable_during_combat'] is True, 'HP access')
        require(0 <= b['hurtbox_bottom_u'] <= 0.5, 'ground target definition')
        for mid in b['attack_ids']:
            require(mid in moves and moves[mid]['encounter_id'] == b['encounter_id'], 'ownership')
        assigned.extend(b['attack_ids'])
    require(sorted(assigned) == sorted(moves), 'coverage')
    pair = data['pair_contract']
    for key, value in {'shared_hp':True, 'single_selector':True, 'passive_contact':False,
                       'aura_per_body':True, 'reward_count':1,
                       'performance_locked_for_encounter':True}.items():
        require(type(pair[key]) is type(value) and pair[key] == value, 'pair '+key)
    require(pair['dedup_key'] == ['encounterEpoch','sourceActorId','castId','hitEventId','sharedReceiverId'], 'dedup')
    require(pair['reaction_selection'] == 'earliest_collision_then_stable_body_id', 'reaction ordering')
    windows = shots = airborne = pair_routes = 0
    for a in moves.values():
        boss = bosses[a['encounter_id']]
        total, lock = a['total'], a['lock']
        require(integer(total) and integer(lock) and 0 <= lock < total, 'clock')
        interval(a['recovery'], lock, total, 'recovery')
        require(a['recovery'][1] == total, 'terminal recovery')
        end_attack = a['recovery'][0]
        events = []
        previous_end = lock
        for start, end, body, group in a['active']:
            interval([start,end], lock, end_attack, 'active bounds')
            require(start >= previous_end, 'direct order')
            require(body in boss['bodies'] and bool(group), 'event owner/group')
            events.append((start,end,body,group))
            previous_end = end
            windows += 1
        for start, ttl, body, group in a['projectiles']:
            require(integer(ttl) and ttl > 0, 'projectile TTL')
            interval([start,start+ttl], lock, end_attack, 'projectile bounds')
            require(body in boss['bodies'] and bool(group), 'projectile owner/group')
            events.append((start,start+ttl,body,group))
            shots += 1
        require(bool(events), 'empty attack')
        require(integer(a['hit_cap']) and a['hit_cap'] == len({e[3] for e in events}), 'hit groups')
        for i, e in enumerate(events):
            for f in events[i+1:]:
                require(e[2] == f[2] or max(e[0],f[0]) >= min(e[1],f[1]), 'pair attacks overlap')
        if len(boss['bodies']) == 2:
            pair_routes += 1
        for start, end, body, mode, distance in a['motion']:
            interval([start,end], lock, end_attack, 'motion bounds')
            require(body in boss['bodies'] and 0 < distance <= 1.4, 'motion geometry declaration')
            require(mode in ('airborne','ground_attack_move','non_damage_ground_move'), 'motion mode')
            if mode == 'airborne':
                require(end-start <= 36, 'airborne duration')
                airborne += 1
        if a['id'] == boss['signature']:
            require(total-end_attack == 144, 'signature recovery')
    require((windows,shots,airborne,pair_routes) == (15,10,1,6), 'event counts')
    require(len(data['interrupts']) == 1, 'interrupt count')
    x = data['interrupts'][0]
    require(x['parent'] == 'FLG03' and x['mechanism'] == 'resonator', 'interrupt owner')
    require(x['spawn_tick'] == 48 and x['accept'] == [60,300], 'interrupt window')
    require(x['required_distinct_new_casts'] == 3, 'interrupt cast count')
    require(x['progress_scope'] == 'current_resonator_instance', 'progress scope')
    require(x['relative_stagger'] == [0,180] and x['standup_ticks'] == 24, 'relative recovery')
    require(x['rearm_after_stagger_ticks'] == 1200, 'rearm')
    require(0 <= x['minimum_target_bottom_u'] <= 0.5, 'mechanism height')
    for key in ('required_for_victory','hold_progress_to_next_cast','damage_transfer_to_boss','reward_on_destroy'):
        require(x[key] is False, key)
    for key in ('any_attack_element','cancel_parent_events','clear_projectiles','death_priority'):
        require(x[key] is True, key)
    require(data['damage_contract'] == {'group_max_hits_per_target':1,
            'normal_iframes_preserved':True,'lifetime_before_recovery':True,
            'cleanup_on_epoch_end':True,'element_from_explicit_tag_not_color':True}, 'damage contract')
    require('mandatory_arkhe' in data['exclusions'] and 'mandatory_suanni_freeze' in data['exclusions'], 'exclusions')
    return {'encounters':4,'patterns':12,'direct_windows':windows,'projectile_spawns':shots,
            'airborne_intervals':airborne,'pair_routes':pair_routes,'optional_interrupts':1}


def mutate(data, path, value):
    result = copy.deepcopy(data)
    target = result
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return result


def main():
    path = Path(__file__).with_name('MANIFEST_DANCE_STONE.json')
    raw = path.read_bytes()
    data = json.loads(raw)
    result = validate(data)
    cases = [
        (['attacks',1,'id'],'FIC01'),
        (['attacks',0,'encounter_id'],'boss-26140101'),
        (['attacks',0,'active',0,2],'unknown'),
        (['bosses',0,'signature'],'missing'),
        (['bosses',0,'attack_ids'],['FIC01','FIC02']),
        (['bosses',0,'hurtbox_bottom_u'],1.2),
        (['shared','required_special_element'],True),
        (['shared','forced_revive_phase'],True),
        (['shared','hp_zero_priority'],False),
        (['counts','cumulative_encounters'],32),
        (['attacks',0,'lock'],105),
        (['attacks',0,'active',0,1],90),
        (['attacks',1,'projectiles',1,1],100),
        (['attacks',1,'projectiles',0,1],0),
        (['attacks',0,'recovery'],[280,276]),
        (['attacks',0,'hit_cap'],1),
        (['attacks',8,'projectiles',0,3],'second_hit'),
        (['attacks',2,'active',1],[132,140,'coppelius','ice_glide']),
        (['pair_contract','passive_contact'],True),
        (['pair_contract','dedup_key'],['castId','sharedReceiverId']),
        (['pair_contract','single_selector'],False),
        (['pair_contract','reward_count'],2),
        (['interrupts',0,'required_for_victory'],True),
        (['interrupts',0,'accept'],[60,40]),
        (['interrupts',0,'hold_progress_to_next_cast'],True),
        (['interrupts',0,'cancel_parent_events'],False),
        (['interrupts',0,'minimum_target_bottom_u'],1.0),
        (['interrupts',0,'reward_on_destroy'],True),
        (['attacks',11,'motion',0,1],200),
        (['attacks',4,'motion',0,0],20),
        (['attacks',0,'total'],277),
        (['damage_contract','normal_iframes_preserved'],False)
    ]
    for i, (path_keys,value) in enumerate(cases,1):
        try:
            validate(mutate(data,path_keys,value))
        except (ValueError,KeyError,TypeError):
            continue
        raise RuntimeError(f'mutation {i} was accepted: {path_keys}')
    result.update(result='PASS', rejected_mutations=len(cases), manifest_bytes=len(raw),
                  manifest_git_blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),
                  scope='Static structure, timing and declared contracts only',
                  live_game_collision_ai_network='NOT RUN')
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
