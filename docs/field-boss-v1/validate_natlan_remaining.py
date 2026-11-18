#!/usr/bin/env python3
"""Check declarations/timing, not Lua behavior, geometry, or balance.

--check-runtime-source also compares the old move IDs with the current runtime
configuration. This is a migration-source snapshot check; omit it after the
runtime has adopted the new design.
"""
import argparse
import copy
import json
import math
from pathlib import Path


class InvalidDesign(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise InvalidDesign(message)


def integer(value):
    return type(value) is int


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def interval(value, limit, name):
    require(isinstance(value, list) and len(value) == 2, name + ': pair required')
    require(all(integer(x) for x in value), name + ': integer ticks required')
    require(0 <= value[0] < value[1] <= limit, name + ': invalid half-open interval')
    return value


def fixed_values(data, expected, name):
    for key, value in expected.items():
        require(type(data[key]) is type(value) and data[key] == value, name + '.' + key)


def collect_move_ids(value):
    result = []
    if isinstance(value, dict):
        if 'id' in value:
            result.append(value['id'])
        for child in value.values():
            result.extend(collect_move_ids(child))
    elif isinstance(value, list):
        for child in value:
            result.extend(collect_move_ids(child))
    return result


def validate(data, catalog, config=None):
    fixed_values(data, {'schema_version': '1.0', 'status': 'design_only_not_runtime',
                       'tick_rate_hz': 60, 'unit_U_pixels': 88,
                       'interval_semantics': 'half_open'}, 'manifest')
    fixed_values(data['shared'], {'max_attack_patterns': 3, 'max_concurrent_casts': 1,
        'hp_bars': 1, 'multiplayer_hp_scaling': False, 'required_special_element': False,
        'forced_revive_phase': False, 'hp_zero_priority': True, 'normal_damage_pipeline': True,
        'runtime_or_visual_tested': False, 'passive_contact_damage': 0,
        'body_blocking_crossing_required': False,
        'unreachable_cast_policy': 'cancel_before_lock_reposition_then_new_tell'}, 'shared')
    require(set(data['shared']['cleanup']) ==
            {'pending_hits', 'proxy_actors', 'flow', 'morph', 'old_epoch_events'}, 'cleanup')
    expected = {'boss-26270301': ['FLD01', 'FLD02', 'FLD03'],
                'boss-24090501': ['FOV01', 'FOV02', 'FOV03'],
                'boss-25520101': ['FSP01', 'FSP02', 'FSP03']}
    bosses = {b['id']: b for b in data['bosses']}
    moves = {m['id']: m for m in data['attacks']}
    require(len(bosses) == len(data['bosses']) == 3, 'three distinct encounters required')
    require(set(bosses) == set(expected), 'encounter IDs')
    require(len(moves) == len(data['attacks']) == 9, 'nine distinct attacks required')
    require(set(moves) == {x for ids in expected.values() for x in ids}, 'attack IDs')
    require(set(bosses) <= {b['id'] for b in catalog['encounters']}, 'catalog IDs')
    for owner, ids in expected.items():
        b = bosses[owner]
        require(b['attacks'] == ids and b['signature'] == ids[-1], owner + ': three moves/signature')
        require(number(b['hurtbox_bottom_u']) and 0 <= b['hurtbox_bottom_u'] <= .5,
                owner + ': ground-reachable hurtbox declaration')
        for move_id in ids:
            require(moves[move_id]['owner'] == owner, move_id + ': owner')
    windows = 0
    for move_id, m in moves.items():
        total, lock = m['total'], m['lock']
        require(integer(total) and total > 0 and integer(lock) and 0 <= lock < total,
                move_id + ': total/lock ticks')
        rec = interval(m['recovery'], total, move_id + '.recovery')
        require(rec[1] == total and rec[0] > lock, move_id + ': recovery must end cast')
        require(m['projectiles'] == [] and m['air'] == [], move_id + ': no projectile/air route')
        require(m['active'], move_id + ': missing damage event')
        groups, previous_end = [], lock
        for event in m['active']:
            require(len(event) == 3, move_id + ': event shape')
            start, end = interval(event[:2], rec[0], move_id + '.active')
            require(start - lock >= 30 and start >= previous_end, move_id + ': tell/order')
            require(isinstance(event[2], str), move_id + ': named hit group')
            groups.append(event[2])
            previous_end = end
        require(len(set(groups)) == len(groups), move_id + ': duplicate hit group')
        require(set(m['groups']) == set(groups) and
                all(type(v) is int and v == 1 for v in m['groups'].values()), move_id + ': group limits')
        require(integer(m['hit_cap']) and m['hit_cap'] == sum(m['groups'].values()), move_id + ': hit cap')
        if move_id == bosses[m['owner']]['signature']:
            require(total - rec[0] == 144, move_id + ': signature recovery must be 144 ticks')
        z = m['geometry']['z']
        require(len(z) == 2 and all(number(x) for x in z) and 0 <= z[0] < z[1], move_id + ': height')
        windows += len(m['active'])
    fixed_values(data['identity_contract'], {'same_actor': True, 'same_receiver': True,
        'same_hp': True, 'preserve_aura': True, 'preserve_dot': True, 'preserve_target': True,
        'transformation_invulnerable_ticks': 0, 'reward_count': 1}, 'identity')
    lava = moves['FLD03']
    fixed_values(bosses['boss-26270301'], {'heat_gate': False, 'mode_scope': 'signature_cast'}, 'lava')
    fixed_values(lava, {'morph_needs_element': False, 'leaves_damage_trail': False}, 'lava cast')
    morph = interval(lava['morph'], lava['total'], 'lava.morph')
    return_morph = interval(lava['return_morph'], lava['total'], 'lava.return_morph')
    require(morph[0] == 0 and morph[1] <= lava['lock'] and
            lava['active'][-1][1] <= return_morph[0] < return_morph[1] <= lava['recovery'][0],
            'lava: cast-local transformation order')
    fixed_values(bosses['boss-25520101'], {'full_invisible_ticks': 0,
                 'required_reflection_break': False}, 'spiritspeaker')
    reflections = data['reflection_contract']
    fixed_values(reflections, {'parent_move': 'FSP03', 'proxy_count': 2, 'independent_ai': False,
        'receives_damage': False, 'transfers_damage_to_boss': False, 'body_collision': False,
        'targetable': False, 'blocks_player_projectiles': False, 'consumes_pierce_budget': False,
        'contact_damage': 0, 'reward_count': 0, 'full_invisible_ticks': 0,
        'mandatory_shield_layers': 0, 'side': 'locked_facing_only', 'cancel_with_parent': True}, 'proxies')
    spirit = moves['FSP03']
    proxies = spirit['proxies']
    require(len(proxies) == len(spirit['active']) == 2, 'two proxy routes')
    require(integer(reflections['spawn_tick']) and integer(reflections['despawn_tick']), 'proxy lifetime ticks')
    require(spirit['lock'] <= reflections['spawn_tick'] < reflections['despawn_tick'] <= spirit['recovery'][0],
            'proxy lifetime boundaries')
    previous_u, previous_end = 0, spirit['lock']
    for proxy, event in zip(proxies, spirit['active']):
        require(proxy['id'] == event[2] and proxy['active'] == event[:2], 'proxy/event correspondence')
        visible_tell = proxy['minimum_visible_tell_ticks']
        require(proxy['spawn'] == reflections['spawn_tick'] and integer(visible_tell) and visible_tell >= 60,
                'proxy spawn/tell')
        require(proxy['spawn'] <= event[0] - visible_tell and previous_end <= event[0] and
                event[1] <= reflections['despawn_tick'], 'sequential proxy timing')
        u = proxy['u']
        require(len(u) == 2 and all(number(x) for x in u) and previous_u < u[0] < u[1] and
                proxy['side'] == reflections['side'], 'proxy routes must stay on one locked side')
        previous_u, previous_end = u[1], event[1]
    fixed_values(bosses['boss-24090501'], {'required_cryo': False, 'required_nightsoul': False}, 'overseer')
    cooling = data['cooling']
    fixed_values(cooling, {'move_id': 'FOV03', 'initial': 0, 'max': 5, 'accumulate_every_ticks': 50,
        'cryo_reduces': 1, 'freeze_ticks': 72, 'new_direct_casts_only': True,
        'same_epoch_only': True, 'freeze_interval_semantics': 'half_open',
        'accept_reactions': False, 'accept_dot_ticks': False, 'duplicate_cast_counts': False,
        'freeze_refresh': 'max_existing_end_hit_plus_72', 'clock_during_freeze': 'pause_no_catchup',
        'damage_snapshot': 'at_event_start', 'late_cooling_changes_active_event': False,
        'damage_formula': 'base_damage + flow * existing_damage_per_level',
        'resets_at_recovery': True, 'required_for_victory': False, 'interrupts_cast': False,
        'adds_attack_pattern': False}, 'cooling')
    purge = moves['FOV03']
    interval(cooling['window'], purge['total'], 'cooling.window')
    require(cooling['window'] == [purge['lock'], purge['recovery'][0]], 'cooling acceptance boundaries')
    require(integer(cooling['cast_start_min_tick']) and cooling['cast_start_min_tick'] == cooling['window'][0],
            'cooling cast-start boundary')
    require(integer(cooling['first_uncooled_increment_tick']) and
            cooling['first_uncooled_increment_tick'] == cooling['window'][0] + cooling['accumulate_every_ticks'],
            'cooling first uncooled increment boundary')
    require(cooling['allowed_sources'] == ['real_player', 'active_companion'], 'cooling sources')
    require(cooling['same_tick_order'] == ['hp_zero', 'eligible_cooling', 'flow_accumulation',
            'event_damage_snapshot', 'hit'], 'cooling same-tick order')
    migrations = {row['runtime_file']: row for row in data['migration']}
    require(len(migrations) == len(data['migration']) == 3, 'migration rows')
    configured = {row['id']: row for row in config['fieldBosses']} if config is not None else None
    for owner, b in bosses.items():
        row = migrations[b['existing_runtime']]
        old_ids = row['config_ids']
        require(len(set(old_ids)) == len(old_ids), 'duplicate migration source ID')
        require(row['target_ids'] == b['attacks'] and row['status'] == 'pending_runtime', 'migration target/status')
        require(set(b['attacks']) <= set(old_ids), 'migration targets must be declared source IDs')
        retired = row.get('retire_ids', [])
        require(set(retired) == set(old_ids) - set(b['attacks']) and len(set(retired)) == len(retired), 'retired IDs')
        if configured is not None:
            current_ids = collect_move_ids(configured[owner]['moves'])
            require(len(set(current_ids)) == len(current_ids) and set(old_ids) == set(current_ids),
                    'runtime-source snapshot differs; omit --check-runtime-source after migration')
    fixed_values(data['counts'], {'encounters': 3, 'attack_cards': 9, 'direct_windows': windows,
        'damaging_projectiles': 0, 'proxy_routes': 2, 'optional_cooling_rules': 1,
        'cumulative_encounters': 38, 'cumulative_attack_cards': 114,
        'catalog_reference_rows': 49, 'all_catalog_rows_detailed': False}, 'counts')
    require(windows == 17, '17 direct damage windows required')


def self_test(data, catalog, config=None):
    # Each case mutates one design obligation; no combat simulation is used.
    cases = [
        ('duplicate ID', ('attacks', 1, 'id'), 'FLD01'),
        ('wrong owner', ('attacks', 0, 'owner'), 'boss-24090501'),
        ('fourth pattern', ('bosses', 0, 'attacks'), ['FLD01', 'FLD02', 'FLD03', 'FLD04']),
        ('wrong signature', ('bosses', 0, 'signature'), 'FOV03'),
        ('wrong tick rate', ('tick_rate_hz',), 30),
        ('closed intervals', ('interval_semantics',), 'closed'),
        ('fractional ticks', ('attacks', 0, 'active', 0, 0), 108.5),
        ('short tell', ('attacks', 0, 'lock'), 79),
        ('damage in recovery', ('attacks', 0, 'active', 0, 1), 151),
        ('short signature recovery', ('attacks', 2, 'total'), 335),
        ('duplicate hit group', ('attacks', 1, 'active', 1, 2), 'fissure1'),
        ('high hurtbox', ('bosses', 1, 'hurtbox_bottom_u'), .51),
        ('undeclared projectile', ('attacks', 0, 'projectiles'), [{'spawn': 108, 'ttl': 12}]),
        ('overlapping proxies', ('attacks', 8, 'proxies', 1, 'active'), [150, 164]),
        ('opposite proxy side', ('attacks', 8, 'proxies', 1, 'u'), [-2.75, -1.85]),
        ('uncancelled proxy', ('reflection_contract', 'cancel_with_parent'), False),
        ('proxy HP transfer', ('reflection_contract', 'transfers_damage_to_boss'), True),
        ('hidden main body', ('bosses', 2, 'full_invisible_ticks'), 1),
        ('morph after lock', ('attacks', 2, 'morph'), [0, 73]),
        ('replacement actor', ('identity_contract', 'same_actor'), False),
        ('cooling in recovery', ('cooling', 'window'), [60, 373]),
        ('uncapped flow', ('cooling', 'max'), 100),
        ('cooling catchup', ('cooling', 'clock_during_freeze'), 'catchup'),
        ('retroactive damage change', ('cooling', 'late_cooling_changes_active_event'), True),
        ('targetable proxy', ('reflection_contract', 'targetable'), True),
        ('proxy consumes pierce', ('reflection_contract', 'consumes_pierce_budget'), True),
        ('old-epoch cooling', ('cooling', 'same_epoch_only'), False),
        ('early first increment', ('cooling', 'first_uncooled_increment_tick'), 109),
    ]
    for name, path, value in cases:
        bad = copy.deepcopy(data)
        target = bad
        for part in path[:-1]:
            target = target[part]
        target[path[-1]] = value
        if name == 'short signature recovery':
            bad['attacks'][2]['recovery'][1] = value
        if name == 'overlapping proxies':
            bad['attacks'][8]['active'][1] = value + ['echo2']
        try:
            validate(bad, catalog, config)
        except InvalidDesign:
            continue
        raise InvalidDesign('negative fixture accepted: ' + name)
    return len(cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', nargs='?', type=Path,
                        default=Path(__file__).with_name('MANIFEST_NATLAN_REMAINING.json'))
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check-runtime-source', action='store_true',
                        help='compare old source IDs with current config; omit after runtime migration')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        data = json.loads(args.manifest.read_text(encoding='utf-8'))
        catalog = json.loads((root / 'content/encounters.json').read_text(encoding='utf-8'))
        config = (json.loads((root / 'content/field-boss-spawns.json').read_text(encoding='utf-8'))
                  if args.check_runtime_source else None)
        validate(data, catalog, config)
        negatives = self_test(data, catalog, config) if args.self_test else 0
    except (InvalidDesign, KeyError, TypeError, IndexError, OSError, json.JSONDecodeError) as error:
        parser.exit(1, 'FAIL: ' + str(error) + '\n')
    print('PASS: 3 encounters / 9 attacks / 17 direct windows / 2 proxy routes')
    print('PASS: catalog IDs and declared migration IDs checked; Lua behavior not tested')
    if args.check_runtime_source:
        print('PASS: current runtime-source IDs match the migration snapshot')
    if args.self_test:
        print(f'PASS: {negatives} invalid fixtures rejected')


if __name__ == '__main__':
    main()
