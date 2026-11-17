#!/usr/bin/env python3
"""Validate design indices only; this does not execute Lua or test dodge geometry."""
import hashlib
import json
from pathlib import Path


def validate(path: Path) -> dict:
    raw = path.read_bytes()
    data = json.loads(raw)
    assert data['status'] == 'design_only_not_runtime'
    assert data['tick_rate_hz'] == 60
    assert data['interval_semantics'] == 'half_open'
    bosses, attacks = data['bosses'], data['attacks']
    assert len(bosses) == data['counts']['bosses'] == 4
    assert len(attacks) == data['counts']['attack_cards'] == 12
    by_id = {a['id']: a for a in attacks}
    assert len(by_id) == len(attacks), 'duplicate attack ID'
    assigned = []
    for boss in bosses:
        ids = boss['attack_ids']
        assert 2 <= len(ids) <= data['shared']['max_attack_patterns'] == 3
        assert boss['signature'] in ids
        assert boss['hp_attackable_during_combat'] is True
        assert 0 <= boss['hurtbox_bottom_u'] <= 0.5
        assert not boss.get('forced_revive_phase', False)
        for move_id in ids:
            assert by_id[move_id]['encounter_id'] == boss['encounter_id']
        if 'optional_core' in boss:
            assert boss['optional_core']['required_for_victory'] is False
        assigned.extend(ids)
    assert sorted(assigned) == sorted(by_id), 'unassigned or multiply assigned attack'
    windows = shots = 0
    for a in attacks:
        total, lock = a['total_ticks'], a['lock_tick']
        recovery = a['recovery']
        assert all(type(t) is int for t in [total, lock, *recovery])
        assert 0 <= lock < recovery[0] < recovery[1] == total
        previous_end = -1
        for start, end in a['active_windows']:
            assert type(start) is int and type(end) is int
            assert lock <= start < end <= recovery[0]
            assert start >= previous_end
            previous_end = end
            windows += 1
        for projectile in a['projectiles']:
            ttl = projectile['ttl_ticks']
            assert type(ttl) is int and ttl > 0
            for spawn in projectile['spawn_ticks']:
                assert type(spawn) is int and spawn >= lock
                assert spawn + ttl <= recovery[0]
                shots += 1
        assert a['active_windows'] or a['projectiles']
        assert 1 <= a['hit_cap'] <= 3
        assert a['hp_attackable_during_recovery'] is True
        assert a['detached_damage_hazards'] is False
    assert data['shared']['max_concurrent_casts'] == 1
    assert data['shared']['hp_zero_priority'] is True
    assert data['shared']['multiplayer_hp_scaling'] is False
    assert data['counts']['all_49_detailed'] is False
    sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    return {'result': 'PASS', 'bosses': len(bosses), 'attacks': len(attacks),
            'active_windows': windows, 'projectile_spawns': shots,
            'git_blob_sha': sha, 'bytes': len(raw),
            'scope': 'JSON structure, ownership and temporal bounds only',
            'lua_or_live_playtest': 'NOT RUN', 'geometry_or_balance': 'NOT RUN'}


if __name__ == '__main__':
    print(json.dumps(validate(Path(__file__).with_name('MANIFEST_STARTER.json')),
                     ensure_ascii=False, indent=2))
