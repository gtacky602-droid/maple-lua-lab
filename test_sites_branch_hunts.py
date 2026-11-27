"""Traverse both sides of every supplemental hunting gate at its authored level."""
from collections import Counter
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(file):
    return json.loads((ROOT / file).read_text(encoding='utf8'))


plan = read('sources/map-research/sites-branch-hunts.json')
routes = plan['routes']
specs = {f['field_id']: f for region in ('branch-02', 'branch-05')
         for f in read(f'design/world/placements/{region}.json')['fields'] if f['regular_spawns']}
nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
exits = {id: n['exits'] for id, n in nodes.items()}
edges = {(id, e['to']): e for id, gates in exits.items() for e in gates}
enemy_spawns = read('content/enemy-spawns.json')['nodes']
points = {p['id']: p for a in read('content/world-atlas.json')['regions'] for p in a['points']}
assert {r['field'] for r in routes} == specs.keys()

lua, core = runtime()
crossings = set()


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def ready(level, host):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, exp(level), 'quest')
    camp = nodes[host]['checkpoint']
    core.enterStoryNode(s, camp)
    core.enterStoryNode(s, host)
    return s, TrailWalk(lua, core, s, edges, exits)


def cross(walk, to):
    for actor in walk.state.actors.values():
        actor.inv = 1000
    walk.cross(to)
    crossings.update(walk.crossings)


def verify_spawns(state, source, role):
    stage = state.story.node
    spawned = enemy_spawns[stage]
    assert len(state.enemies) == len(spawned)
    assert Counter(e['designSpawn'] for e in spawned) == {r['id']: r['count'] for r in source}
    source_by_id = {r['id']: r for r in source}
    width = nodes[stage]['width']
    for e, spec in zip(state.enemies.values(), spawned):
        row = source_by_id[spec['designSpawn']]
        platform = nodes[stage]['platforms'][spec['platform']]
        assert platform['x'] + 24 <= e.x <= platform['x'] + platform['w'] - 24
        assert .15*width <= e.patrolMin <= e.x <= e.patrolMax <= .85*width
        assert e.y == platform['y'] and e.level == row['level']
        assert spec['dailyExclude'] is not row['counts_for_daily_kill']
        assert e.respawnSeconds == row['respawn_seconds'] and e.expRole == role
        assert spec['art'] == plan['art_proxies'][row['family']]
    return len(spawned)


counts = Counter()
for row in routes:
    spec = specs[row['field']]
    host, stage, level = row['host'], row['stage'], row['level']
    kind = spec['mode']
    s, walk = ready(level - 1, host)
    assert nodes[host]['level'] < level
    assert level in points[host]['huntLevels'] and points[stage]['huntKind'] == 'field'
    assert not nodes[stage].get('swim'), stage
    quest_before = native(s.story.quests)
    gate = edges[host, stage]
    walk.approach(gate['x'], gate.get('y', 480), stage)
    prompt = core.frame(s).storyNearbyPortal
    assert prompt.to == stage and prompt.level == level and not prompt.available
    core.action(s, 'story_nearby_portal')
    assert s.story.node == host and s.lift is None
    core.grantExp(s, exp(level) - exp(level - 1), 'quest')
    cross(walk, stage)
    assert not s.storySwimming
    counts[kind] += verify_spawns(s, spec['regular_spawns'], 'elite' if kind=='dry_ruin_hunt' else 'normal')
    save = validate_save(native(core.checkpoint(s)))
    restored = core.restore(lua.table_from(save, recursive=True))
    assert restored.story.node == nodes[host]['checkpoint']
    assert len(s.enemies) <= 48
    for pocket, encounter in zip(row['pockets'], spec['optional_pockets'], strict=True):
        peak = nodes[pocket]['level']
        if s.progression.level < peak:
            core.grantExp(s, exp(peak) - exp(s.progression.level), 'quest')
        cross(walk, pocket)
        assert points[pocket]['huntKind'] == 'elite'
        counts['optional'] += verify_spawns(s, [encounter], 'elite')
        cross(walk, stage)
    cross(walk, host)
    assert native(s.story.quests) == quest_before

assert counts == {'hunt':1044, 'dry_ruin_hunt':6, 'optional':30}
assert len(crossings) == 124


def select_route(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_layer:hunt')
    core.action(s, 'world_map_select:' + target)
    return core.frame(s).worldMap


for host, target, level in [('liyue-wp-64825', 'branch-hunt-64825', 75),
                            ('bygone-wp-68600', 'branch-hunt-68600', 142)]:
    s, walk = ready(level - 1, host)
    view = select_route(s, target)
    assert view.layer == 'hunt' and view.guide.status == 'blocked'
    assert view.guide.reason == f'必要Lv{level}'
    core.action(s, 'world_map_close')
    core.grantExp(s, exp(level) - exp(level - 1), 'quest')
    view = select_route(s, target)
    assert view.guide.status == 'ready' and view.guide.stops[1].id == target
    if level == 142:
        assert view.guide.stops[1].label == '水路'
    core.action(s, 'world_map_close')
    if level == 142:
        save = validate_save(native(core.checkpoint(s)))
        (ROOT/'work/sites-branch-hunt-fixture.json').write_text(json.dumps(save, ensure_ascii=False)+'\n', encoding='utf8')
    cross(walk, target)
    e = s.enemies[1]
    a = s.actors[s.active]
    reward = LEVELS[e.level - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles'][e.expRole]
    xp = s.progression.killXp
    a.x, a.y, a.dir, a.lock, e.hp = e.x - 30, e.y, 1, 0, 1
    assert core.attack(s, a, 'normal')
    core.step(s, 1/60, lua.table())
    assert e.hp == 0 and s.progression.killXp - xp == int(reward+.5)
    for actor in s.actors.values():
        actor.x,actor.y = 88,480
    idle = lua.table()
    for _ in range(round(60 * e.respawnSeconds) + 5):
        core.step(s, 1/60, idle)
    assert e.hp == e.maxhp

result = {
    'hunting_rooms':len(routes), 'ordinary_placements':counts['hunt'],
    'dry_ruin_guardians':counts['dry_ruin_hunt'], 'optional_pockets':counts['optional'],
    'directed_crossings':len(crossings), 'all_hunt_level_boundaries': True,
    'early_quest_state_unchanged': True, 'restored_at_entry_camp': True,
    'map_previews_locked_and_available': True, 'real_combat_kill_exp_and_respawn': True,
    'round_trip_movement_isolated_from_combat': True,
}
(ROOT/'evidence/sites-branch-hunts-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
