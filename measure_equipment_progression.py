"""Compare available weapons and earned artifacts on the continuous Lv1–200 route."""
from copy import deepcopy
from hashlib import sha256
import json

from runtime import ROOT, runtime
from savegame import validate_save


MILESTONES = (
    (20, 'mondstadt-fresh-route/liyue-save.json', 'liyue-field'),
    (40, 'liyue-fresh-route/inazuma-save.json', 'inazuma-road'),
    (60, 'inazuma-fresh-route/sumeru-save.json', 'sumeru-field'),
    (80, 'sumeru-fresh-route/fontaine-save.json', 'fontaine-field'),
    (100, 'fontaine-fresh-route/natlan-save.json', 'natlan-field'),
    (120, 'natlan-fresh-route/nod-save.json', 'nod-field'),
    (140, 'nod-fresh-route/snezhnaya-save.json', 'snezhnaya-field'),
    (160, 'snez-fresh-route/white-pass-save.json', 'aurora-ice-cut'),
    (200, 'cap-fresh-route/lv200-save.json', 'dawn-crystal-field'),
)
STRATEGIES = (
    ('starter_only', False, False, 0),
    ('route_artifacts', True, False, 0),
    ('owned_weapon', True, True, 0),
    ('owned_weapon_plus_five', True, True, 5),
    ('starter_plus_ten', True, False, 10),
)


def main():
    lua, core = runtime()
    run = lua.execute("""
        return function(C, state, enemy)
            local actor = state.actors[1]
            state.active, state.auto = 1, false
            state.actors[2].hp = 0
            actor.x, actor.y, actor.dir = enemy.x - 50, enemy.y, 1
            actor.ground, actor.vy = true, 0
            local input = {attack=true}
            local start = state.t
            for frame = 1, 60 * 180 do
                C.step(state, 1/60, input)
                if enemy.hp <= 0 then return state.t - start, frame end
            end
        end
        """)
    # Keep the regional target at its authored spawn while measuring a sustained normal attack.
    core.advanceEnemies = lua.eval('function() end')

    def trial(save, node, artifacts, best_weapon, cap):
        data = deepcopy(save)
        data.pop('weapons', None)
        if not artifacts:
            for item in data['inventory']['items']:
                if item['owner'] == 1:
                    item['owner'] = 0
        state = core.restore(lua.table_from(validate_save(data), recursive=True), 12)
        before = state.mora
        catalog = [
            row for row in core.frame(state).weaponView.options.values()
            if row.owned and row.id.startswith('SW')
        ]
        sword = max(catalog, key=lambda row: row.atk).id if best_weapon else 'SW01'
        core.action(state, f'weapon_equip:traveler:{sword}')
        assert core.equippedWeapon(state, 'traveler') == sword
        for _ in range(cap):
            core.action(state, f'weapon_upgrade:{sword}')
        weapon = next(row for row in core.frame(state).weaponView.options.values() if row.id == sword)
        spent = before - state.mora
        core.enterStoryNode(state, node)
        enemy = next(
            (entry for entry in state.enemies.values()
             if not entry.boss and not entry.dailyElite and not entry.flight and entry.x > 70),
            None,
        )
        assert enemy is not None, node
        state.enemies = lua.table_from([enemy])
        atk = state.actors[1].atk
        seconds, frames = run(core, state, enemy) or (None, None)
        return {
            'weapon': sword,
            'upgrade': weapon.level,
            'atk': atk,
            'spentMora': spent,
            'seconds': round(seconds, 3) if seconds is not None else None,
            'frames': frames,
            'enemy': {'spawn': enemy.spawnId, 'level': enemy.level, 'hp': enemy.maxhp},
        }

    samples = []
    for level, path, node in MILESTONES:
        raw = (ROOT / 'work' / path).read_bytes()
        save = validate_save(json.loads(raw))
        assert save['progression']['level'] == level
        variants = {key: trial(save, node, gear, best, cap) for key, gear, best, cap in STRATEGIES}
        target = variants['starter_only']['enemy']
        for variant in variants.values():
            assert variant.pop('enemy') == target
        equipped = sum(item['owner'] == 1 for item in save['inventory']['items'])
        samples.append(dict(level=level, save=f'work/{path}', sha256=sha256(raw).hexdigest(), node=node,
                            enemy=target, earnedMora=save['mora'], equippedArtifacts=equipped, cases=variants))
        print(level, node, {key: (row['atk'], row['seconds'], row['spentMora']) for key, row in variants.items()})

    result = {
        'scope': 'Lua normal-attack benchmark. Each variant uses the same regional enemy and initial combat RNG. '
                 'It places the traveler 50 px from the spawned enemy and disables enemy movement and allied attacks. '
                 'Equipment and Mora come from the named route saves. A null time means the target survived 180 seconds.',
        'samples': samples,
    }
    (ROOT / 'evidence/equipment-progression-lua.json').write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf8',
    )


if __name__ == '__main__':
    main()
