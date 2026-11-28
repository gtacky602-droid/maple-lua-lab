"""Replay the three border hunts from the earned patrol save with Lua game inputs."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def write(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def check_frost_descent(lua, core, checkpoint, edges, exits, frost):
    result = {}
    for case in ('ordinaryAuto', 'ordinaryManual', 'bossAuto'):
        state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
        trail = TrailWalk(lua, core, state, edges, exits)
        trail.follow_atlas(frost)
        trail.approach(530, 391, 'first shelf')
        enemy = next(e for e in state.enemies.values() if e.spawnId == frost+'-1')
        assert enemy.expRole == 'normal' and enemy.y == 480 and abs(enemy.x-trail.actor.x) < 85
        state.enemies = lua.table_from([enemy])
        if case == 'bossAuto':
            enemy.boss = True
        if case != 'ordinaryManual':
            core.action(state, 'auto')
        core.step(state, 1/60, trail.idle)
        dropped = trail.actor.drop > 0 and not trail.actor.ground
        assert dropped == (case == 'ordinaryAuto'), (case, trail.actor.y)
        result[case] = dropped
    return result


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    source = args.checkpoint.read_bytes()
    save = validate_save(json.loads(source))
    hub, cabin, entry, snow = 'nod-town', 'nod-patrol-cabin', 'snezhnaya-entry', 'snezhnaya-hub'
    spruce, frost, pass_ = 'nod-north-spruce-shelves', 'nod-west-frost-slope', 'winter-frontier-switchback'
    statue, north, west = 'nod-wp-88128', 'nod-wp-88145', 'nod-wp-88144'
    assert save['story']['node'] == cabin and save['progression']['level'] == 131
    prior_quests = {id: q for id, q in save['story']['quests'].items() if q['status'] == 'complete'}
    assert 'nod-lantern-patrol' in prior_quests
    inventory = {item['id'] for item in save['inventory']['items']}

    graph = json.loads((ROOT/'content/story-graph.json').read_bytes())
    nodes = {n['id']: n for n in graph['nodes']}
    exits = {id: n['exits'] for id, n in nodes.items()}
    edges = {(id, gate['to']): gate for id, gates in exits.items() for gate in gates}
    lua, core = runtime()
    state = core.restore(lua.table_from(save, recursive=True), 12)
    trail = TrailWalk(lua, core, state, edges, exits)
    farm = lua.eval('''function(C, s, threshold, controls)
        for tick=1,4500 do
            C.step(s, 1/60, controls)
            if s.progression.level>=threshold or s.actors[s.active].hp<65 or #s.inventory.ground>=12 then
                return tick
            end
        end
        return 4500
    end''')

    def frame():
        return core.frame(state, 'sprite', 'legacy')

    def guide(target):
        core.action(state, 'world_map_focus:' + target)
        view = frame().worldMap
        assert view.selected.id == target
        plan = native(view.guide)
        core.action(state, 'world_map_close')
        return plan

    def check_locked(target, level):
        plan = guide(target)
        assert plan['status'] == 'blocked' and plan['reason'] == f'必要Lv{level}', plan

    def collect_pending():
        bag = state.inventory
        items, pending = bag['items'], len(bag.ground)
        spare = sorted((item for item in items.values() if item.owner == 0 and not item.locked),
                       key=lambda item: (item.id in inventory, item.rarity, item.itemLv, item.id))
        slots = max(0, len(items) + pending - 80)
        assert len(spare) >= slots
        for item in spare[:slots]:
            core.action(state, 'artifact_sell:' + str(item.id))
            sold.append(item.id)
        core.action(state, 'artifact_recover')
        assert len(bag.ground) == 0 and not frame().artifactAttackBlocked

    trail.cross(hub)
    check_locked(frost, 133)
    check_locked(pass_, 136)
    check_locked(entry, 140)
    approach = guide(spruce)
    assert [stop['id'] for stop in approach['stops']] == [statue, north, spruce], approach
    town_hint = approach['stops'][0]['hint']
    assert '門の真下からジャンプ' in town_hint
    trail.cross(statue)
    trail.cross(north)

    recovery_trips, inventory_trips, hunts, sold = 0, 0, [], []
    needs_recovery = False
    for stage, parent, threshold, start, placed in (
        (spruce, north, 133, 410, 32),
        (frost, west, 136, 555, 34),
        (pass_, hub, 140, 260, 28),
    ):
        if state.story.node != parent:
            trail.follow_atlas(parent)
        before = (state.kills, state.progression.killXp)
        start_level = state.progression.level
        ticks = sorties = 0
        for attempt in range(180):
            if state.progression.level == threshold:
                break
            low_hp = needs_recovery or trail.actor.hp < 95 or state.actors[2].hp == 0
            backlogged = len(state.inventory.ground) >= 12
            if low_hp or backlogged:
                core.action(state, 'story_fast:' + hub)
                assert state.story.node == hub and trail.actor.hp == trail.actor.maxhp
                if backlogged:
                    collect_pending()
                    inventory_trips += 1
                if parent != hub:
                    core.action(state, 'story_fast:' + parent)
                    assert state.story.node == parent
                recovery_trips += int(low_hp)
            trail.cross(stage)
            assert len(state.enemies) == placed, (stage, len(state.enemies))
            trail.approach(start, 480, 'hunting position')
            core.action(state, 'auto')
            ticks += farm(core, state, threshold, trail.idle)
            core.action(state, 'auto')
            needs_recovery = trail.actor.hp < 65
            sorties += 1
            assert state.returns == 0, stage
            trail.cross(parent)
            if (attempt+1) % 30 == 0:
                print(stage, sorties, state.kills-before[0], state.progression.level,
                      round(trail.actor.hp, 1), round(state.actors[2].hp, 1), flush=True)
        assert state.progression.level == threshold, (stage, state.progression.level)
        kills = state.kills - before[0]
        xp = state.progression.killXp - before[1]
        assert kills > 0 and xp == kills * LEVELS[nodes[stage]['level']-1]['normal_enemy_base_exp']
        hunts.append(dict(stage=stage, levels=[start_level, threshold], placed=placed,
                          kills=kills, xp=xp, seconds=round(ticks/60, 2), sorties=sorties))
        print(hunts[-1], flush=True)
        write(args.output/f'hunt-lv{threshold}.json', validate_save(native(core.checkpoint(state))))

    assert state.story.node == hub and state.progression.questXp == save['progression']['questXp']
    write(args.output/'snow-ready-save.json', validate_save(native(core.checkpoint(state))))
    trail.cross(pass_)
    plan = guide(snow)
    assert plan['status'] == 'ready' and [s['id'] for s in plan['stops']] == [entry, snow], plan
    trail.cross(entry)
    landing = [trail.actor.x, trail.actor.y]
    assert landing == [295, 380]
    trail.cross(snow)
    final = validate_save(native(core.checkpoint(state)))
    restored = core.restore(lua.table_from(final, recursive=True), 12)
    assert restored.story.node == snow and restored.progression.level == 140
    for id, q in prior_quests.items():
        assert final['story']['quests'][id] == q, id
    remaining = {item['id'] for item in final['inventory']['items']}
    assert inventory - remaining == inventory.intersection(sold)
    protected = {item['id'] for item in save['inventory']['items'] if item['owner'] or item.get('locked')}
    assert protected <= remaining
    assert final['companion'] == save['companion']

    frost_checkpoint = validate_save(json.loads((args.output/'hunt-lv133.json').read_bytes()))
    descent = check_frost_descent(lua, core, frost_checkpoint, edges, exits, frost)
    write(args.output/'snow-town-save.json', final)
    write(args.output/'lua.json', dict(sourceSha256=sha256(source).hexdigest(), hunts=hunts,
          lockedLevels=[133, 136, 140], townHint=town_hint, recoveryTrips=recovery_trips,
          frostDescent=descent, inventoryTrips=inventory_trips, soldOriginalSpares=len(inventory-remaining),
          borderPlan=plan['stops'], upperLanding=landing, priorQuests=len(prior_quests),
          inventoryKept=len(inventory & remaining), protectedKept=len(protected),
          companion=final['companion'], wipes=state.returns,
          destination=snow, restoredLevel=restored.progression.level))


if __name__ == '__main__':
    main()
