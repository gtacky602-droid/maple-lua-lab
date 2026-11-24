"""Exercise the Natlan trial gates and the independent HP and group reward."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


HUB = 'natlan-hub'
SAPPHO = 'legend-natlan_sappho'
TRISTARS = 'legend-natlan_polychrome_tristars'
HOSTS = {SAPPHO: 'nat-wp-72438', TRISTARS: 'nat-wp-72432'}
exits = {node['id']: node['exits'] for node in read('content/story-graph.json')['nodes']}
edges = {(id, edge['to']): edge for id, route in exits.items() for edge in route}
specs = {enemy['id']: enemy for enemy in read('content/field-boss-spawns.json')['fieldBosses']}
lua, core = runtime()
idle = lua.table()
attack = lua.table(attack=True)


def exp(level):
    return LEVELS[level - 1]['maple_reference_total_exp_to_reach']


def start(id, level):
    s = core.new(12)
    core.action(s, 'story_start')
    core.enterStoryNode(s, HUB)
    core.grantExp(s, exp(level), 'quest')
    for slot in (1, 2, 3):
        assert core.giveArtifact(s, slot, 40, 3)
        core.action(s, 'artifact_equip:' + str(slot))
    core.enterStoryNode(s, HOSTS[id])
    return s


def tick(s, count, input=idle):
    for _ in range(count):
        core.step(s, 1 / 60, input)


def enter(id):
    spec = specs[id]
    host, arena, level = HOSTS[id], spec['node'], spec['level']
    s = start(id, level - 1)
    walk = TrailWalk(lua, core, s, edges, exits)
    gate = edges[host, arena]
    walk.approach(gate['x'], 480, arena)
    near = core.frame(s).storyNearbyPortal
    assert near.to == arena and not near.available and str(level) in near.reason
    core.action(s, 'story_nearby_portal')
    assert s.story.node == host
    core.grantExp(s, exp(level) - exp(level - 1), 'quest')
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_layer:hunt')
    core.action(s, 'world_map_select:' + arena)
    guide = core.frame(s).worldMap.guide
    assert guide.status == 'ready' and [p.id for p in guide.stops.values()] == [arena]
    core.action(s, 'world_map_toggle')
    walk.cross(arena)
    return s, walk, spec


def rewards(s):
    return s.kills, s.mora, s.progression.killXp


def defeat(s, walk, body):
    for _ in range(4500):
        if body.hp <= 0:
            return
        assert walk.actor.hp > 0 and s.story.node == specs[body.fieldBoss]['node']
        distance = body.x - walk.actor.x
        if abs(distance) > 72:
            walk.approach(body.x - (44 if distance > 0 else -44), 480, body.id)
        walk.actor.dir = 1 if body.x >= walk.actor.x else -1
        tick(s, 1, attack)
    raise AssertionError((body.id, body.hp, s.t))


def check_clear(s, id, spec, before):
    assert s.fieldSlots[id].phase == 'cleared'
    base = LEVELS[spec['level'] - 1]['normal_enemy_base_exp']
    xp = int(base * RUNTIME_EXP['roles']['field_boss'] + .5)
    assert rewards(s) == (before[0] + 1, before[1] + spec['mora'], before[2] + xp)
    assert s.endgame.bosses[id].clears == 1
    save = validate_save(native(core.checkpoint(s)))
    restored = core.restore(lua.table_from(save, recursive=True), 12)
    assert restored.endgame.bosses[id].clears == 1
    assert id not in save.get('fieldBosses', {})
    return xp


fixture = start(TRISTARS, 120)
core.enterStoryNode(fixture, HOSTS[SAPPHO])
write('work/natlan-first-fixture.json', validate_save(native(core.checkpoint(fixture))))
s, walk, spec = enter(SAPPHO)
slot = s.fieldSlots[SAPPHO]
walk.approach(slot.enemy.x - 44, 480, SAPPHO)
tick(s, 150)
neutral = core.frame(s).fieldBoss
assert neutral.phase == 'available' and neutral.hp == spec['hp'] and '演奏中' in neutral.label
walk.actor.dir = 1
tick(s, 32, attack)
assert slot.enemy.hp < spec['hp'] and slot.phase in ('notice', 'combat')
assert not slot.enemy.noAutoTarget
walk.cross(HOSTS[SAPPHO])
walk.cross(spec['node'])
slot = s.fieldSlots[SAPPHO]
assert slot.phase == 'available' and slot.enemy.hp == spec['hp']
before = rewards(s)
defeat(s, walk, slot.enemy)
sappho_xp = check_clear(s, SAPPHO, spec, before)

s, walk, spec = enter(TRISTARS)
slot = s.fieldSlots[TRISTARS]
s.actors[2].hp = 0
before = rewards(s)
defeat(s, walk, slot.enemy.fieldMembers[1])
assert rewards(s) == before
walk.cross(HOSTS[TRISTARS])
walk.cross(spec['node'])
slot = s.fieldSlots[TRISTARS]
members = list(slot.enemy.fieldMembers.values())
assert len(members) == 3 and sum(member.hp for member in members) == spec['hp']
assert {e.id for e in s.enemies.values()} == {m.id for m in members}
before = rewards(s)
snapshots = []
for i, member in enumerate(members):
    defeat(s, walk, member)
    field = native(core.frame(s).fieldBoss)
    assert all(body['hp'] == 0 if index <= i else 0 < body['hp'] <= body['maxhp']
               for index, body in enumerate(field['bodies']))
    assert field['hp'] == sum(body['hp'] for body in field['bodies'])
    snapshots.append([body['hp'] for body in field['bodies']])
    if i < len(members) - 1:
        assert rewards(s) == before and slot.phase != 'cleared'
        assert s.endgame is None or s.endgame.bosses[TRISTARS] is None
tristars_xp = check_clear(s, TRISTARS, spec, before)
assert not core.defeatEnemy(s, members[-1], 1)
assert s.endgame.bosses[TRISTARS].clears == 1
walk.cross(HOSTS[TRISTARS])
walk.cross(spec['node'])
assert [m.hp for m in s.fieldSlots[TRISTARS].enemy.fieldMembers.values()] == [490, 500, 350]

write('evidence/natlan-first-legends-lua.json', {
    'entrances': HOSTS, 'requiredLevels': {SAPPHO: 112, TRISTARS: 120},
    'sapphoNeutralWithCompanion': True, 'sapphoProvokedByNormalAttack': True,
    'tristarsRemainingHpAfterEachDefeat': snapshots, 'groupRewardsOnlyAfterAllThree': True,
    'savedClearRecordsAndManualRechallenge': True,
    'killXp': {SAPPHO: sappho_xp, TRISTARS: tristars_xp},
})
print('Natlan: both gates, normal attacks, individual HP, and saved group rewards passed')
