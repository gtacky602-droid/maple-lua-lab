#!/usr/bin/env python3
"""Check design declarations and timing, not Lua behavior, geometry, or balance.

--check-runtime-source compares the old JSON snapshot; omit after migration.
Explicit exceptions keep all checks enabled under python -O.
"""
import argparse
import copy
import json
import math
from pathlib import Path

EXPECTED = {
    'boss-26301101': ('FMF', 'field-moonfly.lua'),
    'boss-26302101': ('FMG', 'field-moongecko.lua'),
    'boss-24111101': ('FV', 'field-fallen-vigil.lua'),
}
ORDER = ['terminal_state_guard', 'prepare_scheduled_windows_and_devices',
         'expire_status', 'apply_existing_heals_and_status_removal', 'apply_eligible_player_damage',
         'boss_hp_zero', 'eligible_recordings_and_device_contacts', 'optional_interrupt',
         'deadline_cleanup', 'scheduled_enemy_hits_then_surviving_actor_status']
SOURCES = ['real_player', 'active_companion']
ELEMENTS = {'physical', 'pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro'}


class InvalidDesign(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise InvalidDesign(message)


def fields(value, keys, path):
    require(type(value) is dict, path + ': object required')
    missing = sorted(set(keys) - value.keys())
    require(not missing, path + ': missing keys: ' + ', '.join(missing))
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
    require(type(value) is list and len(value) == 2 and all(type(x) is int for x in value),
            path + ': two integer ticks required')
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
    for axis in (['u', 'z'] if value['kind'] == 'locked_rect' else ['z']):
        fields(value, [axis], path)
        v = value[axis]
        require(type(v) is list and len(v) == 2 and all(number(x) for x in v) and 0 <= v[0] < v[1],
                path + '.' + axis + ': invalid extent')
    if value['kind'] == 'locked_target_rect':
        fixed(value, {'center_policy': 'front_target_at_lock', 'arena_clamp': False}, path)
        for key in ['max_center_distance_u', 'width_u']:
            fields(value, [key], path)
            positive(value[key], path + '.' + key)
    else:
        require(value['kind'] == 'locked_rect', path + ': unsupported shape')


def devices(rule, moves, move_id, count, path):
    fields(rule, ['window', 'spawn_tick', 'cleanup_tick', 'devices', 'interrupt', 'allowed_sources',
                  'instance_key', 'cast_dedup_key', 'ordinary_direct_chip'], path)
    fixed(rule, {'move_id': move_id, 'side': 'locked_facing_only', 'contact_damage': 0,
                 'backlash_damage': 0, 'reward_count': 0,
                 'cast_time_basis': 'encounter_tick_minus_parent_start_tick'}, path)
    flags(rule, path, yes=['receives_contact', 'new_direct_casts_only', 'same_epoch_required',
          'requires_actual_overlap', 'cast_start_at_or_after_window_start', 'per_device_break_once',
          'interruption_requires_all_devices'], no=['targetable_as_enemy', 'auto_target', 'is_hp_receiver',
          'body_collision', 'blocks_player_projectiles', 'consumes_pierce_budget', 'transfers_damage_to_boss',
          'counts_as_quest_kill', 'accept_reactions', 'accept_dot_ticks', 'duplicate_cast_counts',
          'emits_duplicate_hit_hooks', 'cleanup_counts_as_break'])
    parent = moves[move_id]
    start, end = span(rule['window'], parent['recovery'][0], path + '.window')
    require(type(rule['spawn_tick']) is int and type(rule['cleanup_tick']) is int and
            start == rule['spawn_tick'] >= parent['lock'] and end == rule['cleanup_tick'], path + ': lifetime/window')
    members(rule['allowed_sources'], SOURCES, path + '.allowed_sources')
    members(rule['instance_key'], ['epoch', 'encounter_id', 'parent_cast_id', 'device_slot'], path + '.instance_key')
    members(rule['cast_dedup_key'], ['epoch', 'parent_cast_id', 'device_slot', 'source_actor_id', 'cast_id'], path + '.cast_dedup_key')
    positive(rule['ordinary_direct_chip'], path + '.ordinary_direct_chip', True)
    ds = rows(rule['devices'], path + '.devices', 'slot')
    require(len(ds) == count, path + ': incorrect device count')
    events = {e['group']: e for e in parent['events']}
    canceled, positions = [], []
    for slot, device in ds.items():
        fields(device, ['center_u', 'shape', 'layers', 'cancels_groups'], path + '.' + slot)
        positive(device['center_u'], path + '.center_u')
        positive(device['layers'], path + '.layers', True)
        require(device['layers'] >= rule['ordinary_direct_chip'], path + ': layers below ordinary chip')
        shape(device['shape'], path + '.shape')
        require(device['shape']['kind'] == 'locked_rect' and
                device['shape']['u'][0] <= device['center_u'] <= device['shape']['u'][1], path + ': device center/shape')
        positions.append(device['center_u'])
        groups = device['cancels_groups']
        require(type(groups) is list and groups and all(type(g) is str and g in events for g in groups), path + ': unknown canceled group')
        canceled.extend(groups)
        for group in groups:
            hit = events[group]
            if count == 1:
                require(hit['owner'] == 'boss' and hit['active'][0] >= end, path + ': release before cleanup')
            else:
                require(hit['owner'] == slot and hit['group'] == slot + '_light', path + ': child owner/group')
                require(start + 30 <= hit['active'][0] < hit['active'][1] <= end, path + ': child outside lifetime/tell')
                require(hit['shape']['kind'] == 'locked_rect' and hit['shape']['u'][0] <= device['center_u'] <= hit['shape']['u'][1], path + ': child origin')
    members(canceled, events, path + '.canceled_groups')
    require(positions == sorted(set(positions)), path + ': front positions must be distinct and ordered')
    interrupt = fields(rule['interrupt'], ['down_ticks', 'standup_ticks'], path + '.interrupt')
    for key in ['down_ticks', 'standup_ticks']:
        positive(interrupt[key], path + '.' + key, True)
    flags(interrupt, path + '.interrupt', yes=['cancel_all_pending_hits', 'once_per_parent_cast', 'returns_to_normal_selector'])
    fixed(interrupt, {'damage_multiplier': 1}, path + '.interrupt')
    return ds


def validate(data, catalog, config=None):
    fields(data, ['counts', 'shared', 'identity_contract', 'bosses', 'attacks', 'radiant_cocoon',
                  'moonstone_anchor', 'elemental_stars', 'monitor', 'migration'], 'manifest')
    fixed(data, {'schema_version': '1.0', 'status': 'design_only_not_runtime', 'tick_rate_hz': 60,
                 'unit_U_pixels': 88, 'interval_semantics': 'half_open'}, 'manifest')
    shared = data['shared']
    fixed(shared, {'max_attack_patterns': 3, 'max_concurrent_casts': 1, 'boss_hp_bars': 1,
          'passive_contact_damage': 0, 'signature_recovery_ticks': 144, 'max_air_ticks': 36, 'full_hidden_ticks': 0,
          'selector': 'two_normals_then_signature_when_not_killed',
          'unreachable_cast_policy': 'cancel_before_lock_reposition_then_new_tell',
          'geometry_origin': 'boss_lock_origin_even_for_child_owners', 'hit_history': 'allocate_by_event_group',
          'same_tick_order': ORDER}, 'shared')
    flags(shared, 'shared', yes=['hp_zero_priority', 'normal_damage_pipeline', 'lock_freezes_facing_and_targets'],
          no=['multiplayer_hp_scaling', 'required_special_element', 'forced_revive_phase', 'runtime_or_visual_tested',
              'hp_lock_to_force_signature', 'all_arena_attack', 'body_blocking_crossing_required'])
    fields(shared, ['retreat_margin_u', 'cleanup'], 'shared')
    require(number(shared['retreat_margin_u']) and shared['retreat_margin_u'] >= .1, 'shared.retreat_margin_u')
    members(shared['cleanup'], ['pending_hits', 'devices', 'source_owned_cocoons', 'records', 'form', 'old_epoch_events'], 'shared.cleanup')
    flags(data['identity_contract'], 'identity', yes=['same_actor', 'same_receiver', 'same_hp', 'preserve_aura',
          'preserve_dot', 'preserve_target', 'air_hurtbox_follows_visible_body'], no=['invisible_ground_receiver'])
    fixed(data['identity_contract'], {'transformation_invulnerable_ticks': 0, 'reward_count': 1}, 'identity')
    bosses, moves = rows(data['bosses'], 'bosses'), rows(data['attacks'], 'attacks')
    members(list(bosses), EXPECTED, 'boss IDs')
    members(list(moves), [p + n for p, _ in EXPECTED.values() for n in ['01', '02', '03']], 'move IDs')
    fields(catalog, ['encounters'], 'catalog')
    originals = rows(catalog['encounters'], 'catalog.encounters')
    for boss_id, (prefix, runtime) in EXPECTED.items():
        boss = fields(bosses[boss_id], ['name', 'preserve_source_fields', 'max_ground_hurtbox_bottom_u'], boss_id)
        fixed(boss, {'attacks': [prefix + n for n in ['01', '02', '03']], 'signature': prefix + '03',
                     'existing_runtime': runtime, 'signature_boss_damage_factor': 1, 'signature_boss_hp_shield': 0}, boss_id)
        saved = fields(boss['preserve_source_fields'], ['controller', 'node', 'storyChallenge', 'level', 'hp', 'mora'], boss_id + '.source')
        for key in ['controller', 'node', 'storyChallenge']:
            require(type(saved[key]) is str and saved[key], boss_id + '.' + key)
        for key in ['level', 'hp', 'mora']:
            positive(saved[key], boss_id + '.' + key, True)
        require(number(boss['max_ground_hurtbox_bottom_u']) and
                0 <= boss['max_ground_hurtbox_bottom_u'] <= .45, boss_id + '.ground_bottom')
        require(boss_id in originals, 'catalog missing ' + boss_id)
        fixed(originals[boss_id], {'name': boss['name'], 'kind': 'normal', 'fieldNode': saved['node']}, 'catalog.' + boss_id)
        fields(originals[boss_id], ['entity_ids'], 'catalog.' + boss_id)
        require(boss_id.removeprefix('boss-') in originals[boss_id]['entity_ids'], 'catalog entity ID')
    for move_id, move in moves.items():
        fields(move, ['total', 'lock', 'recovery', 'events'], move_id)
        positive(move['total'], move_id + '.total', True)
        require(type(move['lock']) is int and 0 <= move['lock'] < move['total'], move_id + '.lock')
        rec, end = span(move['recovery'], move['total'], move_id + '.recovery')
        signature = move_id.endswith('03')
        fixed(move, {'kind': 'signature' if signature else 'normal'}, move_id)
        require(end == move['total'] and move['lock'] < rec and (not signature or end - rec == 144), move_id + ': recovery contract')
        events = rows(move['events'], move_id + '.events', 'group')
        require(events and not move.get('projectiles') and 'hidden' not in move, move_id + ': undeclared route/empty events')
        previous = move['lock']
        for group, hit in events.items():
            path = move_id + '.' + group
            fields(hit, ['active', 'owner', 'shape', 'element', 'source_damage_comparison'], path)
            a, b = span(hit['active'], rec, path + '.active')
            require(a - move['lock'] >= 30, path + ': warning under 30 ticks')
            require(a >= previous, path + ': overlapping windows')
            previous = b
            allowed = {'star_1', 'star_2'} if move_id == 'FV03' else {'boss'}
            require(hit['owner'] in allowed, path + ': invalid owner')
            expected_element = hit['owner'].replace('star_', 'record_') + '_or_physical'
            require(hit['element'] == expected_element if move_id == 'FV03' else hit['element'] in ELEMENTS, path + ': element/record mismatch')
            fixed(hit, {'hit_requests_per_receiver': 1, 'follows_after_lock': False, 'damaging_projectile': False}, path)
            positive(hit['source_damage_comparison'], path + '.damage')
            shape(hit['shape'], path + '.shape')
    air_ids = {k for k, v in moves.items() if 'air' in v}
    require(air_ids == {'FMG02', 'FV02'}, 'air route membership')
    for move_id in air_ids:
        move = moves[move_id]
        a, b = span(move['air'], move['recovery'][0], move_id + '.air')
        require(a >= move['lock'] and b - a == 36, move_id + ': air must last 36 ticks')
        require(b == move['events'][-1]['active'][0], move_id + ': landing must follow air')
        fixed(move, {'body_moves_to_locked_center': True, 'landing_hurtbox_bottom_u': 0}, move_id)
        fields(move, ['lift_u'], move_id)
        positive(move['lift_u'], move_id + '.lift_u')
    vigil = moves['FV02']
    fixed(vigil, {'ground_spear_then_air': True, 'same_center_for_all_events': True}, 'FV02')
    require(len(vigil['events']) == 2 and vigil['events'][0]['active'][1] <= vigil['air'][0], 'FV02: spear must finish before air')
    require(vigil['events'][0]['shape'] == vigil['events'][1]['shape'], 'FV02: centers must stay fixed')
    fly, cocoon = moves['FMF03'], data['radiant_cocoon']
    phases = ['green_wing_window', 'flame_wing_window', 'self_cocoon_window']
    fields(fly, phases, 'FMF03')
    require(len(fly['events']) == 3, 'FMF03: three wing events required')
    cursor = fly['lock']
    for phase, hit, element in zip(phases, fly['events'], ['dendro', 'pyro', 'pyro']):
        a, b = span(fly[phase], fly['recovery'][0], 'FMF03.' + phase)
        require(a == cursor and a <= hit['active'][0] < hit['active'][1] <= b and hit['element'] == element, 'FMF03: phase/element connection')
        cursor = b
    require(cursor == fly['recovery'][0], 'FMF03: form must end before recovery')
    fixed(fly, {'player_hit_overrides_element': False}, 'FMF03')
    fixed(cocoon, {'move_id': 'FMF03', 'application_group': fly['events'][0]['group'], 'incoming_healing_factor': 1,
          'applications_per_parent_cast_per_actor': 1, 'extra_bind_damage': 0,
          'damage_factor_application': 'once_at_damage_resolution_from_source_owner',
          'early_clear': 'authorized_heal_event_with_post_clamp_hp_gain_gt_zero',
          'expiration_clock': 'shared_combat_tick_paused_with_game'}, 'radiant_cocoon')
    appliers = [(mid, e['group']) for mid, m in moves.items() for e in m['events'] if e.get('applies_status')]
    require(appliers == [('FMF03', cocoon['application_group'])] and fly['events'][0]['applies_status'] == 'radiant_cocoon', 'cocoon: unique applying hit')
    flags(cocoon, 'radiant_cocoon', yes=['requires_accepted_hit', 'requires_positive_actual_hp_loss',
          'requires_surviving_same_life_receiver', 'accepts_direct_reaction_dot_damage', 'source_owned_cleanup', 'clear_at_recovery'],
          no=['movement_locked', 'attack_input_locked', 'stacks', 'refreshes', 'shared_between_characters',
          'changes_on_active_actor_swap', 'requires_full_hp', 'overheal_zero_clears', 'max_hp_change_clears',
          'respawn_hp_assignment_clears_as_heal', 'escape_buff', 'cleanup_generates_healing_or_rewards'])
    fields(cocoon, ['max_duration_ticks', 'outgoing_damage_factor', 'instance_key', 'clear_on'], 'radiant_cocoon')
    require(type(cocoon['max_duration_ticks']) is int and 0 < cocoon['max_duration_ticks'] <= 180, 'cocoon: duration cap')
    require(number(cocoon['outgoing_damage_factor']) and 0 < cocoon['outgoing_damage_factor'] <= 1, 'cocoon: damage factor')
    members(cocoon['instance_key'], ['epoch', 'encounter_id', 'parent_cast_id', 'actor_id', 'actor_life_generation'], 'cocoon.instance_key')
    members(cocoon['clear_on'], ['expiry', 'valid_heal', 'actor_death', 'parent_cancel', 'boss_death', 'retreat', 'map_exit', 'reset'], 'cocoon.clear_on')
    anchor, stars = data['moonstone_anchor'], data['elemental_stars']
    devices(anchor, moves, 'FMG03', 1, 'anchor')
    ds = devices(stars, moves, 'FV03', 2, 'stars')
    fields(anchor, ['geo_direct_chip'], 'anchor')
    require(type(anchor['geo_direct_chip']) is int and anchor['ordinary_direct_chip'] <= anchor['geo_direct_chip'] <= anchor['devices'][0]['layers'], 'anchor: bounded Geo chip')
    flags(anchor, 'anchor', no=['full_hp_heal_gate', 'cocoon_on_player', 'geo_exposure_bonus'])
    fixed(stars, {'child_attack_schedule': 'parent_fixed_slots', 'same_element_chip': stars['ordinary_direct_chip'],
                 'other_element_chip': stars['ordinary_direct_chip']}, 'stars')
    fields(stars, ['unrecorded_layers'], 'stars')
    require(all(d['layers'] == stars['unrecorded_layers'] for d in ds.values()), 'stars: record-independent layers')
    flags(stars, 'stars', yes=['break_cancels_own_active_and_future_hits', 'simultaneous_aoe_chips_each_device_once'],
          no=['record_changes_layers', 'record_grants_immunity', 'independent_ai'])
    monitor = fields(data['monitor'], ['windows', 'eligible_elements', 'allowed_sources', 'alters_only'], 'monitor')
    fixed(monitor, {'move_id': 'FV03', 'records': len(ds), 'selection': 'first_eligible_direct_hit_per_window',
          'default_record': 'none', 'default_attack_element': 'physical', 'tie_break': 'authoritative_server_event_sequence',
          'cast_time_basis': 'encounter_tick_minus_parent_start_tick'}, 'monitor')
    flags(monitor, 'monitor', yes=['new_direct_casts_only', 'cast_start_at_or_after_each_window_start',
          'same_epoch_required', 'requires_positive_boss_hp_damage', 'same_element_repeat_allowed',
          'first_hit_seals_window', 'record_resets_each_parent_cast'], no=['accept_reactions', 'accept_dot_ticks', 'old_3_and_6_hit_thresholds'])
    members(monitor['eligible_elements'], ['pyro', 'hydro', 'electro', 'cryo'], 'monitor.elements')
    members(monitor['allowed_sources'], SOURCES, 'monitor.sources')
    members(monitor['alters_only'], ['star_color', 'star_attack_element'], 'monitor.alters_only')
    require(type(monitor['windows']) is list and len(monitor['windows']) == len(ds), 'monitor: two windows required')
    cursor = moves['FV03']['lock']
    for window in monitor['windows']:
        a, b = span(window, stars['spawn_tick'], 'monitor.window')
        require(a == cursor, 'monitor: contiguous ordered windows required')
        cursor = b
    require(cursor <= stars['spawn_tick'], 'monitor: records must precede stars')
    migration = fields(data['migration'], ['source_move_ids', 'source_signature_totals', 'target_signature_totals',
          'source_air_ticks', 'target_air_ticks', 'source_bind_damage'], 'migration')
    flags(migration, 'migration', yes=['keep_existing_ids', 'preserve_level_hp_rewards_save_and_placement',
          'remove_legacy_full_heal_cocoon_hook', 'remove_global_cross_owner_cocoon_cleanup', 'remove_player_hit_element_override',
          'remove_gecko_escape_callback', 'remove_device_backlash_resolve_cast', 'remove_down_damage_multiplier',
          'remove_legacy_star_immunity_and_layer_variants', 'replace_negative_enemy_ids_with_device_instances'], no=['runtime_changes_applied'])
    fixed(migration, {'target_unlisted_bind_damage': 0, 'source_shared_module': 'radiant-cocoon.lua'}, 'migration')
    for boss_id, boss in bosses.items():
        fields(migration['source_move_ids'], [boss_id], 'migration.source_move_ids')
        members(migration['source_move_ids'][boss_id], boss['attacks'], 'migration.' + boss_id)
        for table in ['source_signature_totals', 'target_signature_totals']:
            fields(migration[table], [boss['signature']], 'migration.' + table)
            positive(migration[table][boss['signature']], 'migration.' + table, True)
        require(migration['target_signature_totals'][boss['signature']] == moves[boss['signature']]['total'], 'migration: target total mismatch')
    for move_id in air_ids:
        fields(migration['source_air_ticks'], [move_id], 'migration.source_air_ticks')
        fixed(migration['target_air_ticks'], {move_id: moves[move_id]['air'][1] - moves[move_id]['air'][0]}, 'migration.target_air_ticks')
        positive(migration['source_air_ticks'][move_id], 'migration.source_air_ticks', True)
    fixed(migration['source_bind_damage'], {'boss-26301101': 12, 'boss-26302101': 12}, 'migration.source_bind_damage')
    windows = sum(len(m['events']) for m in moves.values())
    require(windows == 17, 'attacks: expected 17 windows')
    counts = {'encounters': len(bosses), 'attack_cards': len(moves), 'direct_windows': windows,
          'damaging_projectiles': 0, 'air_routes': len(air_ids), 'hidden_routes': 0, 'optional_interrupt_rules': 2,
          'temporary_status_rules': 1, 'cumulative_encounters': 42 + len(bosses), 'cumulative_attack_cards': 126 + len(moves),
          'catalog_reference_rows': 49, 'remaining_reference_rows': 49 - 42 - len(bosses), 'all_catalog_rows_detailed': False}
    fixed(data['counts'], counts, 'counts')
    if config is not None:
        validate_source(config, bosses, moves, migration)
    return {**counts, 'current_normal_rows': sum(r.get('kind') == 'normal' for r in originals.values())}


def validate_source(config, bosses, moves, migration):
    fields(config, ['fieldBosses'], 'runtime')
    source = rows(config['fieldBosses'], 'runtime.fieldBosses')
    for boss_id, boss in bosses.items():
        require(boss_id in source, 'runtime missing ' + boss_id)
        old = fields(source[boss_id], ['moves'], 'runtime.' + boss_id)
        fixed(old, boss['preserve_source_fields'], 'runtime.' + boss_id)
        old_moves = rows(old['moves'], 'runtime.' + boss_id + '.moves')
        members(list(old_moves), boss['attacks'], 'runtime.move_ids')
        for move_id, move in old_moves.items():
            fields(move, ['damage'], 'runtime.' + move_id)
            for event in moves[move_id]['events']:
                require(event['source_damage_comparison'] == move['damage'], 'runtime.' + move_id + '.damage')
            if move_id in migration['source_signature_totals']:
                fixed(move, {'total': migration['source_signature_totals'][move_id]}, 'runtime.' + move_id)
            if move_id in migration['source_air_ticks']:
                fields(move, ['air', 'total'], 'runtime.' + move_id)
                a, b = span(move['air'], move['total'], 'runtime.' + move_id + '.air')
                require(b - a == migration['source_air_ticks'][move_id], 'runtime.' + move_id + '.air duration')
        if boss_id in migration['source_bind_damage']:
            fields(old, ['cocoon'], 'runtime.' + boss_id)
            fixed(old['cocoon'], {'damage': migration['source_bind_damage'][boss_id]}, 'runtime.' + boss_id + '.cocoon')


def self_test(data, catalog, config=None):
    positions = {m['id']: i for i, m in enumerate(data['attacks'])}
    kick, leap, descent, signature = [data['attacks'][positions[k]] for k in ['FMF01', 'FMG02', 'FV02', 'FMF03']]
    early_air_start = descent['events'][0]['active'][1] - 1
    early_air_end = early_air_start + descent['air'][1] - descent['air'][0]
    landing_duration = descent['events'][1]['active'][1] - descent['events'][1]['active'][0]
    wrong_order = ORDER.copy()
    hp_pos, hit_pos = wrong_order.index('boss_hp_zero'), wrong_order.index('scheduled_enemy_hits_then_surviving_actor_status')
    wrong_order[hp_pos], wrong_order[hit_pos] = wrong_order[hit_pos], wrong_order[hp_pos]
    def mp(move, *tail):
        return ('attacks', positions[move], *tail)
    def changed(source, edits):
        result = copy.deepcopy(source)
        for path, value in edits:
            node = result
            for part in path[:-1]:
                node = node[part]
            if value is None:
                del node[path[-1]]
            else:
                node[path[-1]] = value
        return result
    cases = [
        ('missing key', 'missing keys', [(mp('FMF01', 'events', 0, 'owner'), None)]),
        ('duplicate ID', 'duplicate/invalid', [(mp('FMF02', 'id'), 'FMF01')]),
        ('high ground receiver', 'ground_bottom', [(('bosses', 0, 'max_ground_hurtbox_bottom_u'), .46)]),
        ('bool tick', 'integer ticks', [(mp('FMF01', 'events', 0, 'active', 0), True)]),
        ('29 tick warning', 'under 30', [(mp('FMF01', 'lock'), kick['events'][0]['active'][0] - 29)]),
        ('overlap', 'overlapping', [(mp('FMF01', 'events', 1, 'active', 0), kick['events'][0]['active'][1] - 1)]),
        ('REC143', 'recovery contract', [(mp('FMF03', 'recovery', 0), signature['recovery'][0] + 1)]),
        ('air37', '36 ticks', [(mp('FMG02', 'air', 0), leap['air'][0] - 1)]),
        ('air during ground spear', 'spear must finish', [(mp('FV02', 'air'), [early_air_start, early_air_end]),
            (mp('FV02', 'events', 1, 'active'), [early_air_end, early_air_end + landing_duration])]),
        ('extra bind hit', 'extra_bind_damage', [(('radiant_cocoon', 'extra_bind_damage'), 12)]),
        ('shield-only cocoon', 'positive_actual_hp_loss', [(('radiant_cocoon', 'requires_positive_actual_hp_loss'), False)]),
        ('cocoon on dead actor', 'surviving_same_life', [(('radiant_cocoon', 'requires_surviving_same_life_receiver'), False)]),
        ('stacked cocoon', 'stacks', [(('radiant_cocoon', 'stacks'), True)]),
        ('parent-clock expiry', 'expiration_clock', [(('radiant_cocoon', 'expiration_clock'), 'parent_cast_tick')]),
        ('healing penalty', 'incoming_healing_factor', [(('radiant_cocoon', 'incoming_healing_factor'), .7)]),
        ('cleanup break', 'cleanup_counts_as_break', [(('elemental_stars', 'cleanup_counts_as_break'), True)]),
        ('opposite-side device', 'positive number', [(('elemental_stars', 'devices', 0, 'center_u'), -.8)]),
        ('DoT device chip', 'accept_dot_ticks', [(('moonstone_anchor', 'accept_dot_ticks'), True)]),
        ('dedup lacks owner', 'cast_dedup_key', [(('elemental_stars', 'cast_dedup_key'), ['epoch','parent_cast_id','device_slot','cast_id'])]),
        ('wrong star owner', 'invalid owner', [(mp('FV03', 'events', 0, 'owner'), 'boss')]),
        ('monitor overlap', 'contiguous ordered', [(('monitor', 'windows', 1, 0), data['monitor']['windows'][0][1] - 1)]),
        ('recorded immunity', 'record_grants_immunity', [(('elemental_stars', 'record_grants_immunity'), True)]),
        ('enemy hit before HP0', 'same_tick_order', [(('shared', 'same_tick_order'), wrong_order)]),
        ('wrong window count', 'counts.direct_windows', [(('counts', 'direct_windows'), data['counts']['direct_windows'] - 1)]),
    ]
    for name, error_text, edits in cases:
        try:
            validate(changed(data, edits), catalog, config)
        except InvalidDesign as error:
            require(error_text in str(error), name + ': rejected for wrong reason: ' + str(error))
        else:
            raise InvalidDesign('negative fixture accepted: ' + name)
    release_start = data['attacks'][positions['FMG03']]['events'][0]['active'][0]
    positives = [[(mp('FMF01', 'lock'), kick['events'][0]['active'][0] - 30)],
                 [(mp('FMF01', 'events', 1, 'active', 0), kick['events'][0]['active'][1])],
                 [(('moonstone_anchor', 'window', 1), release_start), (('moonstone_anchor', 'cleanup_tick'), release_start)]]
    for edits in positives:
        validate(changed(data, edits), catalog, config)
    runtime_count = 0
    if config is not None:
        idx = next(i for i, b in enumerate(config['fieldBosses']) if b['id'] == 'boss-24111101')
        edits = [([(('fieldBosses', idx, 'moves'), config['fieldBosses'][idx]['moves'][:2])], 'runtime.move_ids'),
                 ([(('fieldBosses', idx, 'hp'), config['fieldBosses'][idx]['hp'] + 1)], 'runtime.boss-24111101.hp')]
        for changes, expected_error in edits:
            try:
                validate(data, catalog, changed(config, changes))
            except InvalidDesign as error:
                require(expected_error in str(error), 'runtime fixture rejected for wrong reason: ' + str(error))
                runtime_count += 1
            else:
                raise InvalidDesign('runtime-source fixture accepted')
    return len(cases), len(positives), runtime_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', nargs='?', type=Path, default=Path(__file__).with_name('MANIFEST_RADIANT_VIGIL.json'))
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check-runtime-source', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        data = json.loads(args.manifest.read_text(encoding='utf-8'))
        catalog = json.loads((root / 'content/encounters.json').read_text(encoding='utf-8'))
        config = json.loads((root / 'content/field-boss-spawns.json').read_text(encoding='utf-8')) if args.check_runtime_source else None
        result = validate(data, catalog, config)
        tests = self_test(data, catalog, config) if args.self_test else None
    except (InvalidDesign, OSError, json.JSONDecodeError) as error:
        parser.exit(1, 'FAIL: ' + str(error) + '\n')
    print('PASS: 3 encounters / 9 attacks / 17 direct windows / 2 air routes / 0 hidden routes')
    print('PASS: design checkpoint 45 encounters / 135 attacks; 49-row reference has 4 rows remaining')
    print(f"PASS: 3 catalog IDs/names/placements checked; current catalog has {result['current_normal_rows']} normal rows")
    print('PASS: REC144, grounded spear then air, cocoon lifetime/healing, device contacts, monitor records, HP0/cleanup declarations')
    if config is not None:
        print('PASS: 9 old move IDs, preserved fields, signature/air timing and old bind-damage snapshots match')
    if tests:
        print(f'PASS: {tests[0]} invalid design fixtures rejected / {tests[1]} valid boundary fixtures accepted / {tests[2]} invalid runtime-source fixtures rejected')
    print('LIMIT: static declarations only; Lua, visuals, damage geometry, evasion, and 45-90 second balance are not tested')


if __name__ == '__main__':
    main()
