#!/usr/bin/env python3
"""Validate Snezhnaya design declarations, not playable Lua behavior or balance.

--check-runtime-source checks the old JSON/Lua migration baseline; omit after migration.
All failures use explicit exceptions, including under python -O. Standard library only.
"""
import argparse
import copy
import json
import math
import re
from pathlib import Path

EXPECTED = {
    'boss-26310501': ('FL', 'field-flugel.lua'),
    'boss-25135202': ('FDS', 'field-drifting-snow.lua'),
    'boss-25140101': ('IC', 'field-immortal-construct.lua'),
    'boss-25134601': ('WB', 'field-wavebinder.lua'),
}
RULES = {'wind_orb': ('FL03', 2), 'ice_coffin': ('FDS03', 3),
         'life_bloom': ('IC03', 3), 'hot_drink': ('WB03', 4)}
ORDER = ['terminal_state_guard', 'prepare_scheduled_windows_and_devices', 'apply_player_damage',
         'boss_hp_zero', 'eligible_counter_contacts', 'optional_interrupt',
         'coffin_threshold_transition_if_no_parent_recovery', 'deadline_cleanup', 'scheduled_enemy_hits']
SOURCES = ['real_player', 'active_companion']
ELEMENTS = {'physical', 'pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro'}
# Presence checks intentionally identify old hooks; they do not prove execution or migration.
OLD_HOOKS = {
    'field-flugel.lua': ['local function arm(', 'function lion.preempt(', 'm[b.mode]',
                         'damageElement=b.mode', 'id=-b.id-i', 's.orbs.bodyHover'],
    'field-drifting-snow.lua': ['function guardian.checkpoint(', 'flags.coffinUsed~=nil',
                              'math.floor(s.hp*s.coffin.threshold)', 's.coffin.heal', 's.coffin.downTicks'],
    'field-immortal-construct.lua': ['function beast.preempt(', 'math.min(s.life.cost,b.hp-1)',
                                   's.life.healBudget-c.healed', 's.life.layerStaggerTicks', 'b.lifeUnits<=s.life.chantUnits'],
    'field-wavebinder.lua': ['function sailor.preempt(', 'b.valiant and m.valiant or m',
                            's.courage.electroDrain', 's.courage.electroDrinkHits', 's.courage.drinkDownTicks'],
}


class InvalidDesign(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise InvalidDesign(message)


def fields(value, keys, path):
    require(type(value) is dict, path + ': object required')
    missing = set(keys) - value.keys()
    require(not missing, path + ': missing keys: ' + ', '.join(sorted(missing)))
    return value


def fixed(value, expected, path):
    fields(value, expected, path)
    for key, wanted in expected.items():
        require(type(value[key]) is type(wanted) and value[key] == wanted, path + '.' + key)


def flags(value, path, yes=(), no=()):
    fixed(value, {**dict.fromkeys(yes, True), **dict.fromkeys(no, False)}, path)


def members(value, expected, path):
    require(type(value) is list and all(type(x) is str for x in value), path + ': string array required')
    require(len(value) == len(set(value)) and set(value) == set(expected), path + ': membership/duplicates')


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def positive(value, path, integer=False):
    require((type(value) is int if integer else number(value)) and value > 0, path + ': positive number required')


def span(value, limit, path):
    require(type(value) is list and len(value) == 2 and all(type(x) is int for x in value), path + ': integer tick pair required')
    require(0 <= value[0] < value[1] <= limit, path + ': invalid half-open interval')
    return value


def rows(value, path, key='id'):
    require(type(value) is list, path + ': array required')
    result = {}
    for row in value:
        fields(row, [key], path)
        require(type(row[key]) is str and row[key] and row[key] not in result, path + ': duplicate/invalid ' + key)
        result[row[key]] = row
    return result


def shape(value, path):
    fields(value, ['kind', 'z'], path)
    kind = value['kind']
    require(kind in {'locked_rect', 'locked_target_rect', 'locked_origin_target_lane'}, path + ': unsupported shape')
    axes = ['z', 'u' if kind == 'locked_rect' else 'center_u_bounds']
    fields(value, axes, path)
    for axis in axes:
        pair = value[axis]
        require(type(pair) is list and len(pair) == 2 and all(number(x) for x in pair)
                and 0 <= pair[0] < pair[1], path + '.' + axis + ': positive geometry required')
    if kind == 'locked_target_rect':
        positive(fields(value, ['width_u'], path)['width_u'], path + '.width_u')
    if kind == 'locked_origin_target_lane':
        fixed(value, {'origin_u': 0}, path)
        positive(fields(value, ['endpoint_margin_u'], path)['endpoint_margin_u'], path + '.endpoint_margin_u')


def validate_attacks(moves, shared):
    for mid, move in moves.items():
        fields(move, ['lock', 'total', 'recovery', 'events'], mid)
        positive(move['total'], mid + '.total', True)
        require(type(move['lock']) is int and 0 <= move['lock'] < move['total'], mid + '.lock')
        rec, end = span(move['recovery'], move['total'], mid + '.recovery')
        signature = mid.endswith('03')
        fixed(move, {'kind': 'signature' if signature else 'normal'}, mid)
        require(move['lock'] < rec and end == move['total'] and
                (not signature or end - rec == shared['signature_recovery_ticks']), mid + ': recovery contract')
        require(not set(move) & {'hidden', 'hidden_window', 'projectiles', 'variants', 'valiant', 'extra_attacks'}, mid + ': undeclared route/variant')
        events = rows(move['events'], mid + '.events', 'group')
        require(len(events) == (2 if not signature or mid == 'FL03' else 3), mid + ': event count')
        cursor = move['lock'] + shared['minimum_lock_to_first_hit_ticks']
        for event in events.values():
            path = mid + '.' + event['group']
            fields(event, ['active', 'shape', 'element', 'source_damage_comparison'], path)
            start, stop = span(event['active'], rec, path)
            require(start >= cursor, path + ': overlap or under 30 tick warning')
            cursor = stop
            fixed(event, {'owner': 'boss', 'hit_requests_per_receiver': 1,
                          'follows_after_lock': False, 'damaging_projectile': False}, path)
            require(event['element'] in ELEMENTS, path + ': element')
            positive(event['source_damage_comparison'], path + '.damage')
            shape(event['shape'], path)
        if signature:
            fixed(move, {'grounded_entire_signature': True}, mid)
    require({mid for mid, move in moves.items() if 'air' in move} == {'FL02'}, 'air route membership')
    leap = moves['FL02']
    air = fields(leap['air'], ['active', 'lift_u'], 'FL02.air')
    start, stop = span(air['active'], leap['recovery'][0], 'FL02.air')
    require(leap['lock'] <= start and 0 < stop - start <= shared['max_air_ticks'], 'FL02: air cap 36 ticks')
    require(stop == leap['events'][0]['active'][0], 'FL02: landing follows air')
    fixed(air, {'body_moves_to_locked_target': True, 'hurtbox_follows_body': True,
                'landing_bottom_u': 0, 'same_target_for_all_hits': True}, 'FL02.air')
    positive(air['lift_u'], 'FL02.air.lift_u')
    require(leap['events'][0]['shape'] == leap['events'][1]['shape'], 'FL02: shared locked target')


def validate_counters(data, moves):
    counters = rows(data['counters'], 'counters')
    members(list(counters), RULES, 'counter IDs')
    for cid, (mid, units) in RULES.items():
        rule, move = counters[cid], moves[mid]
        fields(rule, ['window', 'element_bonuses'], cid)
        start, end = span(rule['window'], move['recovery'][0], cid + '.window')
        require(move['lock'] <= start and end <= move['events'][-1]['active'][0], cid + ': counter timing')
        fixed(rule, {'attack_id': mid, 'required_units': units, 'units_per_new_direct_cast': 1,
                     'max_contributions_per_cast': 1, 'success': 'cancel_remaining_events_and_enter_recovery',
                     'recovery_ticks': data['shared']['interrupt_recovery_ticks'], 'recovery_interval': '[success_tick,success_tick+144)',
                     'first_action_after_recovery': 'normal',
                     'stand_ticks': 0, 'extra_down_ticks': 0, 'extra_rest_ticks': 0, 'backlash_damage': 0,
                     'damage_multiplier': 1}, cid)
        flags(rule, cid, yes=['new_cast_must_start_in_window', 'requires_same_epoch', 'requires_live_boss',
              'requires_active_parent_cast', 'closes_on_success', 'success_emitted_once', 'no_progress_during_recovery',
              'success_tick_included_in_recovery'],
              no=['accept_reaction', 'accept_dot', 'cleanup_is_success', 'partial_progress_after_deadline'])
        members(rule['sources'], SOURCES, cid + '.sources')
        members(rule['dedup_key'], ['encounter', 'epoch', 'parent_cast', 'counter_id', 'source_actor', 'cast_id'], cid + '.dedup_key')
        fixed(rule, {'element_bonuses': {'electro': 2} if cid == 'hot_drink' else {}}, cid)
        if cid == 'wind_orb':
            fixed(move, {'device_rule': cid}, mid)
            fixed(rule, {'target': 'wind_orb_device', 'requires_positive_actual_boss_hp_loss': False}, cid)
            dev = fields(rule['device'], ['center_u', 'shape'], cid + '.device')
            fixed(dev, {'count': 1, 'show_contact_segments': units, 'cleanup_tick': end}, cid + '.device')
            flags(dev, cid + '.device', yes=['requires_actual_overlap', 'requires_damage_capable_direct_attack', 'contact_only_without_boss_hp_loss',
                  'position_fixed_until_cleanup', 'regular_damage_to_overlapping_boss_once', 'visual_absorption_is_cleanup_not_success'],
                  no=['independent_hp_enemy', 'enemy_list_member', 'auto_targetable', 'body_blocking',
                      'consumes_player_projectile', 'consumes_pierce_budget', 'elemental_aura', 'on_hit_proc', 'reward_or_quest_credit'])
            shape(dev['shape'], cid + '.device.shape')
            positive(dev['center_u'], cid + '.device.center_u')
            require(dev['shape']['kind'] == 'locked_rect' and dev['shape']['u'][0] <= dev['center_u'] <= dev['shape']['u'][1], cid + ': device center/shape')
        else:
            fixed(move, {'counter_rule': cid}, mid)
            fixed(rule, {'target': 'boss_receiver', 'requires_positive_actual_boss_hp_loss': True,
                         'separate_receiver': False, 'cleanup_tick': end}, cid)
            require('device' not in rule, cid + ': body counter has no separate device')
    fixed(counters['ice_coffin'], {'shield_damage_factor': 1, 'all_elements_including_cryo_accept': True, 'heal_on_timeout': 0}, 'ice_coffin')
    fixed(counters['life_bloom'], {'shield_damage_factor': 1, 'partial_progress_cancels_events': False, 'partial_progress_staggers': False}, 'life_bloom')
    fixed(counters['hot_drink'], {'window': [60, 240], 'bonus_is_total_units_not_additional': True, 'post_window_drain': False}, 'hot_drink')
    return counters


def validate_signatures(data, moves, counters):
    fl = moves['FL03']
    fixed(fl, {'persistent_mode': False, 'element_source': 'per_event'}, 'FL03')
    phases = rows(fl['phases'], 'FL03.phases', 'name')
    require(list(phases) == ['thundercall', 'galeforce'], 'FL03: ordered phases')
    cursor = 0
    for phase, event, element in zip(phases.values(), fl['events'], ['electro', 'anemo']):
        start, end = span(phase['active'], fl['recovery'][0], 'FL03.phase')
        require(start == cursor and start <= event['active'][0] < event['active'][1] <= end, 'FL03: phase/event connection')
        fixed(event, {'element': element}, 'FL03.event')
        cursor = end
    require(cursor == fl['recovery'][0] and counters['wind_orb']['window'][0] == phases['galeforce']['active'][0], 'FL03: gale window/recovery')
    coffin = data['coffin_once']
    fixed(coffin, {'attack_id': 'FDS03', 'hp_fraction': .55, 'condition': '0 < hp <= floor(max_hp * hp_fraction)',
                  'flag': 'coffinUsed', 'start_from_tick': 0, 'restore_missing_flag': 'used_if_hp_at_or_below_threshold',
                  'after_signature': 'normal_moves_only_for_same_spawn_generation'}, 'coffin_once')
    flags(coffin, 'coffin_once', yes=['commit_flag_on_signature_begin', 'cancel_current_normal_cast_before_new_tell',
          'old_hit_reservations_cancelled', 'preserve_next_normal_index', 'hp_zero_before_trigger', 'can_kill_before_signature',
          'preserve_flag_on_cancel_and_exit', 'reset_flag_only_on_new_spawn_generation', 'restore_explicit_flag_as_saved',
          'preflight_before_begin_and_flag_commit', 'prelock_retry_uses_same_activation',
          'retry_clears_old_parent_events_and_contacts', 'respect_existing_recovery_before_trigger'],
          no=['failed_preflight_consumes_flag', 'retry_resets_flag'])
    members(data['shared']['preserve_durable_flags'], [coffin['flag']], 'shared.preserve_durable_flags')
    fixed(moves['FDS03'], {'trigger_rule': 'coffin_once', 'coffin_visual_window': counters['ice_coffin']['window'], 'failure_heal': 0}, 'FDS03')
    life = moves['IC03']
    fixed(life, {'self_hp_cost': 0, 'self_cost_hp_floor': None, 'heal_on_hit': 0, 'heal_budget': 0,
                 'life_shield_units': 0, 'partial_counter_cancels_wave': False, 'dynamic_chant_start': False}, 'IC03')
    pose = span(life['life_pose_window'], life['recovery'][0], 'IC03.life_pose')
    charge = span(life['bloom_charge_window'], life['recovery'][0], 'IC03.bloom_charge')
    require(life['lock'] <= pose[0] <= counters['life_bloom']['window'][0] < pose[1] == charge[0]
            and counters['life_bloom']['window'][1] <= charge[1] == life['events'][-1]['active'][0], 'IC03: pose/charge/release connection')
    drink = moves['WB03']
    fixed(drink, {'drink_window': counters['hot_drink']['window'], 'persistent_courage': False, 'normal_move_variants': False,
                  'post_drink_electro_drain': False, 'drink_progress_is_visual_only': True}, 'WB03')
    valiant = span(drink['valiant_window'], drink['recovery'][0], 'WB03.valiant')
    require(valiant[0] == drink['drink_window'][1] and valiant[1] == drink['recovery'][0]
            and all(valiant[0] <= e['active'][0] < e['active'][1] <= valiant[1] for e in drink['events']), 'WB03: drink/valiant/recovery connection')
    anchor = moves['WB02']
    fixed(anchor, {'anchor_lands_at_locked_center': True, 'anchor_and_chain_extra_hits': 0,
                   'player_pull_or_forced_move': False, 'boss_body_moves': False}, 'WB02')
    flight = span(anchor['anchor_visual_flight'], anchor['recovery'][0], 'WB02.anchor_visual_flight')
    returning = span(anchor['chain_visual_returns'], anchor['recovery'][0], 'WB02.chain_visual_returns')
    require(anchor['lock'] <= flight[0] and flight[1] == anchor['events'][0]['active'][0]
            and returning[0] <= anchor['events'][1]['active'][0] < anchor['events'][1]['active'][1] <= returning[1], 'WB02: visual/hit timing')
    require(anchor['events'][0]['shape']['center_u_bounds'] == anchor['events'][1]['shape']['center_u_bounds'], 'WB02: shared locked target')


def validate_source(data, bosses, moves, config=None, lua_sources=None):
    migration = data['migration']
    flags(migration, 'migration', yes=['keep_existing_ids', 'preserve_level_hp_rewards_save_and_placement',
          'remove_flugel_ward_arm_and_preempt', 'remove_flugel_mode_selector', 'replace_flugel_begin_mode_damage_with_event_element',
          'remove_flugel_five_enemy_orbs', 'remove_flugel_hover_in_signature_recovery', 'remove_coffin_element_immunity_and_heal',
          'preserve_coffin_used_save_flag', 'remove_life_self_cost_and_heal', 'remove_life_units_preempt_and_partial_staggers',
          'remove_dynamic_chant', 'remove_persistent_courage_and_move_variants', 'remove_post_drink_electro_drain',
          'remove_legacy_damage_multipliers', 'replace_old_down_and_rest_with_single_rec144'], no=['runtime_changes_applied'])
    contract = fields(migration['source_config_contract'], EXPECTED, 'source_config_contract')
    require(set(contract) == set(EXPECTED), 'source_config_contract: selected bosses only')
    old_moves = {}
    for bid, (prefix, _) in EXPECTED.items():
        old = contract[bid]
        selected = {'FL': ['ward', 'orbs', 'moves'], 'FDS': ['coffin', 'moves', 'saveFlags'],
                    'IC': ['life', 'moves'], 'WB': ['courage', 'moves']}[prefix]
        fields(old, selected, bid + '.source')
        require(set(old) == set(selected), bid + ': source snapshot field selection')
        parsed = rows(old['moves'], bid + '.source.moves')
        if prefix == 'FDS':
            members(list(parsed), bosses[bid]['attacks'][:2], bid + '.source.normal IDs')
            parsed['FDS03'] = old['coffin']['move']
            members(old['saveFlags'], ['coffinUsed'], bid + '.source.saveFlags')
        members(list(parsed), bosses[bid]['attacks'], bid + '.source.move IDs')
        for mid, move in parsed.items():
            fixed(move, {'id': mid}, bid + '.source.move')
        old_moves.update(parsed)
    source_air = old_moves['FL02']['air']
    span(source_air, old_moves['FL02']['total'], 'source.FL02.air')
    target_air = moves['FL02']['air']['active']
    fixed(migration['source_air_ticks'], {'FL02': source_air[1] - source_air[0]}, 'source_air_ticks')
    fixed(migration['target_air_ticks'], {'FL02': target_air[1] - target_air[0]}, 'target_air_ticks')
    for mid, move in moves.items():
        if mid == 'FL03':
            damages = [old_moves[mid]['electro']['damage'], old_moves[mid]['anemo']['damage']]
        elif mid == 'IC03':
            damages = [old_moves[mid]['damage']] * 2 + [old_moves[mid]['releaseDamage']]
        else:
            damage = old_moves['WB01']['valiant']['damage'] if mid == 'WB03' else old_moves[mid]['damage']
            damages = [damage] * len(move['events'])
        require([e['source_damage_comparison'] for e in move['events']] == damages, mid + ': source damage comparison')
    if config is not None:
        source = rows(config['fieldBosses'], 'runtime.fieldBosses')
        for bid, boss in bosses.items():
            require(bid in source, 'runtime missing ' + bid)
            fixed(source[bid], boss['preserve_source_fields'], 'runtime.' + bid)
            for key, expected in contract[bid].items():
                fields(source[bid], [key], 'runtime.' + bid)
                actual = source[bid][key]
                if key == 'coffin' and 'shortMove' in actual:
                    actual = dict(actual)
                    short = actual.pop('shortMove')
                    design = moves['FDS03']
                    counter = rows(data['counters'], 'counters')['ice_coffin']
                    wanted = {
                        'id': design['id'], 'kind': 'coffinBurst', 'title': design['name'],
                        'lock': design['lock'], 'deploy': counter['window'][0], 'deadline': counter['window'][1],
                        'hitsToBreak': counter['required_units'], 'height': design['events'][0]['shape']['z'][1],
                        'damage': design['events'][0]['source_damage_comparison'],
                        'active': [event['active'] for event in design['events']],
                        'lanes': [event['shape']['u'] for event in design['events']],
                        'recover': design['recovery'][0], 'total': design['total'],
                    }
                    require(json.dumps(short, sort_keys=True) == json.dumps(wanted, sort_keys=True),
                            'runtime.' + bid + '.coffin.shortMove: short coffin differs from design')
                require(json.dumps(actual, sort_keys=True) == json.dumps(expected, sort_keys=True),
                        'runtime.' + bid + '.' + key + ': snapshot differs')
        fields(lua_sources, OLD_HOOKS, 'runtime.Lua')
        for path, markers in OLD_HOOKS.items():
            require(type(lua_sources[path]) is str and all(marker in lua_sources[path] for marker in markers), 'runtime.Lua.' + path + ': old hook marker missing')


def validate(data, catalog, config=None, lua_sources=None):
    try:
        return validate_manifest(data, catalog, config, lua_sources)
    except (KeyError, TypeError, IndexError) as error:
        raise InvalidDesign('malformed declaration: ' + str(error)) from error


def validate_manifest(data, catalog, config, lua_sources):
    fields(data, ['counts', 'shared', 'identity_contract', 'bosses', 'attacks', 'counters', 'coffin_once', 'migration', 'reference_scope'], 'manifest')
    fixed(data, {'schema_version': 'field-boss-snezhnaya-v1', 'status': 'design_only_runtime_not_connected',
                 'source_of_truth': 'SNEZHNAYA_QUARTET_MOVESETS.md', 'tick_rate_hz': 60, 'unit_U_pixels': 88, 'interval_semantics': 'half_open'}, 'manifest')
    require(type(data['source_commit']) is str and re.fullmatch('[0-9a-f]{40}', data['source_commit']), 'manifest.source_commit')
    shared = data['shared']
    fixed(shared, {'max_attack_patterns': 3, 'max_concurrent_casts': 1, 'boss_hp_bars': 1, 'passive_contact_damage': 0,
          'signature_recovery_ticks': 144, 'interrupt_recovery_ticks': 144, 'max_air_ticks': 36, 'full_hidden_ticks': 0,
          'minimum_lock_to_first_hit_ticks': 30, 'same_tick_order': ORDER,
          'unreachable_cast_policy': 'cancel_before_lock_reposition_then_new_tell',
          'geometry_origin': 'boss_lock_origin_even_for_child_owners', 'hit_history': 'allocate_by_event_group'}, 'shared')
    flags(shared, 'shared', yes=['hp_zero_priority', 'normal_damage_pipeline', 'normal_base_resistances_preserved', 'lock_freezes_facing_and_targets'],
          no=['multiplayer_hp_scaling', 'required_special_element', 'forced_revive_phase', 'runtime_or_visual_tested', 'pending_state_saved',
              'hp_lock_to_force_signature', 'all_arena_attack', 'body_blocking_crossing_required', 'target_time_measured'])
    require(number(shared['retreat_margin_u']) and shared['retreat_margin_u'] >= .1, 'shared.retreat_margin_u')
    members(shared['attack_identity_key'], ['encounter_id', 'attack_id'], 'shared.attack_identity_key')
    members(shared['cleanup'], ['pending_hits', 'devices', 'counter_progress', 'form', 'old_epoch_events'], 'shared.cleanup')
    fixed(shared, {'target_time_seconds': [45, 90]}, 'shared')
    flags(data['identity_contract'], 'identity', yes=['same_actor', 'same_receiver', 'same_hp', 'preserve_aura', 'preserve_dot',
          'preserve_target', 'air_hurtbox_follows_visible_body'], no=['invisible_ground_receiver'])
    fixed(data['identity_contract'], {'transformation_invulnerable_ticks': 0, 'reward_count': 1}, 'identity')
    bosses, moves = rows(data['bosses'], 'bosses'), rows(data['attacks'], 'attacks')
    members(list(bosses), EXPECTED, 'boss IDs')
    members(list(moves), [prefix + n for prefix, _ in EXPECTED.values() for n in ['01', '02', '03']], 'attack IDs')
    originals = rows(catalog['encounters'], 'catalog.encounters')
    for bid, (prefix, runtime) in EXPECTED.items():
        boss = bosses[bid]
        fixed(boss, {'attacks': [prefix + n for n in ['01', '02', '03']], 'signature': prefix + '03', 'existing_runtime': runtime,
              'signature_boss_damage_factor': 1, 'signature_boss_hp_shield': 0, 'recovery_damage_factor': 1, 'ground_hurtbox_bottom_u': 0,
              'selector': 'hp55_once_preemption' if prefix == 'FDS' else 'two_normals_then_signature'}, bid)
        saved = fields(boss['preserve_source_fields'], ['controller', 'entity', 'name', 'node', 'storyChallenge', 'level', 'hp', 'mora',
                       'floorY', 'home', 'arenaMin', 'arenaMax', 'respawnTicks', 'contactDamage', 'keepHpOnExit', 'resist'], bid + '.source')
        fixed(saved, {'entity': int(bid[5:]), 'name': boss['name'], 'contactDamage': 0, 'keepHpOnExit': True}, bid + '.source')
        for key in ['controller', 'name', 'node', 'storyChallenge']:
            require(type(saved[key]) is str and saved[key], bid + '.source.' + key)
        for key in ['level', 'hp', 'mora', 'respawnTicks']:
            positive(saved[key], bid + '.source.' + key, True)
        require(all(number(saved[k]) for k in ['floorY', 'home', 'arenaMin', 'arenaMax']) and
                saved['arenaMin'] < saved['home'] < saved['arenaMax'], bid + '.source.arena')
        require(type(saved['resist']) is dict and all(k in ELEMENTS and number(v) for k, v in saved['resist'].items()), bid + '.source.resist')
        require(bid in originals, 'catalog missing ' + bid)
        fixed(originals[bid], {'name': boss['name'], 'kind': 'normal', 'fieldNode': saved['node']}, 'catalog.' + bid)
        require(str(saved['entity']) in originals[bid]['entity_ids'], 'catalog entity ID')
    validate_attacks(moves, shared)
    counters = validate_counters(data, moves)
    validate_signatures(data, moves, counters)
    validate_source(data, bosses, moves, config, lua_sources)
    counts = {'encounters': len(bosses), 'attack_cards': len(moves), 'direct_windows': sum(len(m['events']) for m in moves.values()),
              'damaging_projectiles': 0, 'air_routes': 1, 'hidden_routes': 0, 'optional_interrupt_rules': len(counters),
              'contact_devices': sum('device' in c for c in counters.values()), 'hp_triggered_once_signatures': 1, 'signature_variants': 0,
              'cumulative_encounters': 45 + len(bosses), 'cumulative_attack_cards': 135 + len(moves), 'catalog_reference_rows': 49,
              'remaining_reference_rows': 49 - 45 - len(bosses), 'reference_design_index_complete': True,
              'current_runtime_catalog_complete': False, 'all_game_bosses_complete': False}
    require(counts['direct_windows'] == 27, '27 direct windows required')
    fixed(data['counts'], counts, 'counts')
    return {**counts, 'current_normal_rows': sum(r.get('kind') == 'normal' for r in originals.values())}


def reference_ids(text, heading, pattern, path):
    match = re.search(heading, text, re.M)
    require(match is not None, path + ': section missing')
    tail = text[match.end():]
    section = re.split(r'^#{1,3} ', tail, maxsplit=1, flags=re.M)[0]
    ids = re.findall(pattern, section, re.M)
    require(ids and len(ids) == len(set(ids)), path + ': empty/duplicate IDs')
    return ids


def validate_reference(data, catalog, roster_text=None, master_text=None):
    scope = data['reference_scope']
    fixed(scope, {'roster_file': '../../DESIGN_BOSS_ROSTER_REVIEW_20261117.md', 'roster_section': 'フィールドボス候補（49戦）',
                  'master_file': '../../DESIGN_FIELD_BOSS_MASTER_V01.md'}, 'reference_scope')
    if roster_text is None:
        require(master_text is None, 'reference roster missing while master present')
        return False
    reference = reference_ids(roster_text, r'^### ' + re.escape(scope['roster_section']) + r'\s*$',
                              r'^\|[^|\n]*\|[^|\n]*\|\s*`([^`]+)`\s*\|', 'reference roster')
    require(len(reference) == data['counts']['catalog_reference_rows'], 'reference roster: expected 49 rows')
    normals = {r['id'] for r in catalog['encounters'] if r.get('kind') == 'normal'}
    require(set(reference) <= normals, 'reference IDs missing from normal catalog')
    if master_text is None:
        return False
    master = reference_ids(master_text, r'^## 5\. [^\n]+$', r'^\|\s*([a-z][a-z0-9-]+)\s*\|', 'master')
    members(master, reference, 'master/reference IDs')
    require(len(master) * 3 == data['counts']['cumulative_attack_cards'], 'master: 147 cards derived from 49 encounters')
    return True


def changed(source, edits):
    result = copy.deepcopy(source)
    for path, value in edits:
        node = result
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value
    return result


def rejected(call, expected, name):
    try:
        call()
    except InvalidDesign as error:
        require(expected in str(error), name + ': wrong failure: ' + str(error))
    else:
        raise InvalidDesign('negative fixture accepted: ' + name)


def self_test(data, catalog, config=None, lua_sources=None):
    positions = {m['id']: i for i, m in enumerate(data['attacks'])}
    mp = lambda mid, *keys: ('attacks', positions[mid], *keys)
    cp = lambda cid, *keys: ('counters', next(i for i, c in enumerate(data['counters']) if c['id'] == cid), *keys)
    first = data['attacks'][positions['FL01']]
    wrong_order = ORDER.copy()
    hp, enemy = wrong_order.index('boss_hp_zero'), wrong_order.index('scheduled_enemy_hits')
    wrong_order[hp], wrong_order[enemy] = wrong_order[enemy], wrong_order[hp]
    cases = [
        ('duplicate ID', 'duplicate/invalid', [(mp('FL02', 'id'), 'FL01')]),
        ('boolean tick', 'integer tick pair', [(mp('FL01', 'events', 0, 'active', 0), True)]),
        ('29 tick warning', 'under 30', [(mp('FL01', 'lock'), first['events'][0]['active'][0] - 29)]),
        ('overlapping windows', 'overlap', [(mp('FL01', 'events', 1, 'active', 0), first['events'][0]['active'][1] - 1)]),
        ('REC143', 'recovery contract', [(mp('IC03', 'recovery', 0), data['attacks'][positions['IC03']]['recovery'][0] + 1)]),
        ('air37', 'air cap', [(mp('FL02', 'air', 'active', 0), data['attacks'][positions['FL02']]['air']['active'][0] - 1)]),
        ('landing drift', 'landing follows air', [(mp('FL02', 'air', 'active', 1), 123), (('migration', 'target_air_ticks', 'FL02'), 35)]),
        ('zero geometry', 'positive geometry', [(mp('WB01', 'events', 0, 'shape', 'z'), [0, 0])]),
        ('hidden route', 'undeclared route', [(mp('IC03', 'hidden'), [60, 120])]),
        ('HP protection', 'signature_boss_damage_factor', [(('bosses', 0, 'signature_boss_damage_factor'), .75)]),
        ('damage before HP0', 'same_tick_order', [(('shared', 'same_tick_order'), wrong_order)]),
        ('body shield contact', 'requires_positive_actual_boss_hp_loss', [(cp('life_bloom', 'requires_positive_actual_boss_hp_loss'), False)]),
        ('device needs boss hit', 'requires_positive_actual_boss_hp_loss', [(cp('wind_orb', 'requires_positive_actual_boss_hp_loss'), True)]),
        ('device without overlap', 'requires_actual_overlap', [(cp('wind_orb', 'device', 'requires_actual_overlap'), False)]),
        ('device consumes shot', 'consumes_player_projectile', [(cp('wind_orb', 'device', 'consumes_player_projectile'), True)]),
        ('cleanup success', 'cleanup_is_success', [(cp('wind_orb', 'cleanup_is_success'), True)]),
        ('old cast counts', 'new_cast_must_start_in_window', [(cp('life_bloom', 'new_cast_must_start_in_window'), False)]),
        ('cross-actor dedup', 'dedup_key', [(cp('hot_drink', 'dedup_key'), ['encounter', 'epoch', 'parent_cast', 'counter_id', 'cast_id'])]),
        ('repeated success', 'success_emitted_once', [(cp('ice_coffin', 'success_emitted_once'), False)]),
        ('extra down time', 'extra_down_ticks', [(cp('wind_orb', 'extra_down_ticks'), 180)]),
        ('lost saved flag', 'preserve_flag_on_cancel_and_exit', [(('coffin_once', 'preserve_flag_on_cancel_and_exit'), False)]),
        ('wrong flag fallback', 'restore_missing_flag', [(('coffin_once', 'restore_missing_flag'), 'always_unused')]),
        ('retry replays coffin', 'retry_resets_flag', [(('coffin_once', 'retry_resets_flag'), True)]),
        ('life healing', 'heal_on_hit', [(mp('IC03', 'heal_on_hit'), 18)]),
        ('dynamic chant', 'dynamic_chant_start', [(mp('IC03', 'dynamic_chant_start'), True)]),
        ('partial stagger', 'partial_progress_staggers', [(cp('life_bloom', 'partial_progress_staggers'), True)]),
        ('electro adds two', 'bonus_is_total_units_not_additional', [(cp('hot_drink', 'bonus_is_total_units_not_additional'), False)]),
        ('drink late contact', 'hot_drink.window', [(cp('hot_drink', 'window', 1), 241), (cp('hot_drink', 'cleanup_tick'), 241)]),
        ('persistent courage', 'persistent_courage', [(mp('WB03', 'persistent_courage'), True)]),
        ('damage projectile', 'damaging_projectile', [(mp('WB02', 'events', 0, 'damaging_projectile'), True)]),
        ('unmeasured completion', 'current_runtime_catalog_complete', [(('counts', 'current_runtime_catalog_complete'), True)]),
    ]
    for name, message, edits in cases:
        rejected(lambda: validate(changed(data, edits), catalog, config, lua_sources), message, name)
    positives = [
        [(mp('FL01', 'lock'), first['events'][0]['active'][0] - 30)],
        [(mp('FL01', 'events', 1, 'active', 0), first['events'][0]['active'][1])],
        [(mp('FL02', 'air', 'active', 0), data['attacks'][positions['FL02']]['air']['active'][0] + 1), (('migration', 'target_air_ticks', 'FL02'), 35)],
    ]
    for edits in positives:
        validate(changed(data, edits), catalog, config, lua_sources)
    source_count = 0
    if config is not None:
        for bid, key, value in [('boss-25140101', 'life', {}), ('boss-25135202', 'saveFlags', [])]:
            index = next(i for i, b in enumerate(config['fieldBosses']) if b['id'] == bid)
            bad = changed(config, [(('fieldBosses', index, key), value)])
            rejected(lambda: validate(data, catalog, bad, lua_sources), 'runtime.' + bid + '.' + key, 'old JSON ' + key)
            source_count += 1
        snow = next(i for i, b in enumerate(config['fieldBosses']) if b['id'] == 'boss-25135202')
        if 'shortMove' in config['fieldBosses'][snow]['coffin']:
            bad = changed(config, [(('fieldBosses', snow, 'coffin', 'shortMove', 'deadline'), 301)])
            rejected(lambda: validate(data, catalog, bad, lua_sources), 'short coffin differs from design', 'short coffin deadline')
            source_count += 1
        for filename in ['field-flugel.lua', 'field-wavebinder.lua']:
            bad = dict(lua_sources)
            bad[filename] = bad[filename].replace(OLD_HOOKS[filename][0], 'missing_old_hook(')
            rejected(lambda: validate(data, catalog, config, bad), 'runtime.Lua.' + filename, 'old Lua hook')
            source_count += 1
    return len(cases), len(positives), source_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path(__file__).with_name('MANIFEST_SNEZHNAYA.json'))
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check-runtime-source', action='store_true')
    args = parser.parse_args()
    folder = Path(__file__).resolve().parent
    root = folder.parents[1]
    try:
        data = json.loads(args.manifest.read_text(encoding='utf-8'))
        catalog = json.loads((root / 'content/encounters.json').read_text(encoding='utf-8'))
        config = json.loads((root / 'content/field-boss-spawns.json').read_text(encoding='utf-8')) if args.check_runtime_source else None
        sources = {path: (root / path).read_text(encoding='utf-8') for path in OLD_HOOKS} if config is not None else None
        result = validate(data, catalog, config, sources)
        scope = data['reference_scope']
        paths = [folder / scope[key] for key in ['roster_file', 'master_file']]
        texts = [p.read_text(encoding='utf-8') if p.exists() else None for p in paths]
        reference_checked = validate_reference(data, catalog, *texts)
        tests = self_test(data, catalog, config, sources) if args.self_test else None
    except (InvalidDesign, OSError, json.JSONDecodeError, KeyError) as error:
        parser.exit(1, 'FAIL: ' + str(error) + '\n')
    print('PASS: 4 encounters / 12 attack cards / 27 direct windows / 1 air route / 0 hidden routes or damaging projectiles')
    print('PASS: 4 optional counters / 1 contact device / REC144 / HP0 priority / coffin persistence / no healing or persistent courage')
    print(f"PASS: 4 catalog IDs/names/placements; current catalog has {result['current_normal_rows']} normal rows (not fixed at 49)")
    print('PASS: cumulative design 49 encounters / 147 cards / 49 reference rows / 0 remaining')
    print('PASS: master IDs equal the 49-row reference' if reference_checked else 'SKIP: roster/master files absent; reference equality not checked')
    if config is not None:
        print('PASS: selected old config snapshots, preserved fields, 12 source move IDs, air duration, damage values, and 4 Lua hook snapshots')
        print('PASS: short coffin declarations match the manifest when present')
    if tests:
        print(f'PASS: {tests[0]} invalid design fixtures rejected / {tests[1]} valid boundary fixtures accepted / {tests[2]} invalid source fixtures rejected')
    print('LIMIT: static declarations and old-source markers only; no Lua execution, visual/geometry/evasion tests, or 45-90 second timing measurement')


if __name__ == '__main__':
    main()
