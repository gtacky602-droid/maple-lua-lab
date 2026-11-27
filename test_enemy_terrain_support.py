"""Verify enemy support against packed Lua terrain and combat displacement at ledges."""
import json
from runtime import ROOT, runtime

lua, core = runtime()
platforms = lua.execute((ROOT/'content/platform-templates.lua').read_bytes())
graph = json.loads((ROOT/'content/story-graph.json').read_bytes())
nodes = graph['nodes']
by_id = {n['id']: n for n in nodes}
quests = {q['id']: q for q in graph['quests']}
spawns = json.loads((ROOT/'content/enemy-spawns.json').read_bytes())['nodes']
assert set(spawns) == {n['id'] for n in nodes if not n.get('hub') and not n.get('peaceful')}
state = core.new(12)
core.action(state, 'story_start')
total = live = airborne = 0
for node_id, placements in spawns.items():
    ground = platforms(node_id)
    rows = {p['id']: p for p in placements}
    assert len(rows) == len(placements)
    for p in placements:
        support = ground[p['platform'] + 1]
        assert support.x + 24 <= p['x'] <= support.x + support.w - 24, (node_id, p)
        if 'patrolMin' in p or 'patrolMax' in p:
            assert support.x+24 <= p['patrolMin'] <= p['x'] <= p['patrolMax'] <= support.x+support.w-24
        total += 1
    node = by_id[node_id]
    seen = set()
    for phase in sorted({0, *(p.get('questPhase', 0) for p in placements)}):
        if phase:
            quest_id = node.get('clearedBy') or node['stealthRoute']['quest']
            progress = dict(status='active', count=phase)
            if node.get('stealthRoute'):
                progress['stealthEncounter'] = 'engaged'
            elif 'spawnAt' in node:
                progress['count'] = node['spawnAt']
            elif 'returnBox' in node:
                progress['count'] = node['returnBox']['chaseAt'] + 1
            elif quests[quest_id].get('recovery'):
                progress.update(count=quests[quest_id]['goal'] - 1, recovered={})
            state.story.quests[quest_id] = lua.table_from(progress, recursive=True)
        core.enterStoryNode(state, node_id)
        assert state.story.node == node_id
        for enemy in state.enemies.values():
            if not enemy.spawnId:
                continue
            p = rows[enemy.spawnId]
            support = ground[p['platform'] + 1]
            assert enemy.home == p['x'] and enemy.patrolMin <= enemy.x <= enemy.patrolMax, (node_id, p)
            if p.get('flight'):
                assert enemy.flightHome == support.y and enemy.y < support.y
                airborne += 1
            else:
                assert enemy.y == support.y, (node_id, p)
            seen.add(enemy.spawnId)
    assert seen == set(rows), (node_id, set(rows) - seen)
    live += len(seen)

# Drive a real cast at each lip of an elevated platform, then trigger an enemy respawn.
example = next(n for n, placements in spawns.items()
               if any(p['platform'] > 0 and not p.get('questPhase') and not p.get('flight') for p in placements))
core.enterStoryNode(state, example)
enemy = next(e for e in state.enemies.values() if e.spawnId and e.y < 480 and not e.flight)
state.enemies = lua.table_from([enemy])
for effect in ('push', 'pull'):
    for direction in (-1, 1):
        edge = enemy.patrolMin if direction < 0 else enemy.patrolMax
        enemy.x = edge - direction * 3
        hp = enemy.hp
        cast = dict(id=1, atk=1, x=enemy.x, y=enemy.y, dir=direction, range=100, limit=1,
                    mult=1, element='physical', color='#ffffff', gain=0, critRate=0)
        cast[effect] = 90
        cast['pullCenter'] = edge + direction * 100
        core.resolveCast(state, lua.table_from(cast))
        assert enemy.hp < hp and enemy.home == edge and enemy.x == edge, (effect, direction, enemy.x, edge)
        enemy.hp, enemy.respawn = 0, 0
        core.advanceEnemies(state, 1/60)
        assert enemy.hp == enemy.maxhp and enemy.x == edge
result = dict(hostileFields=len(spawns), authoredPlacements=total, liveEntriesChecked=live,
              airborneEntriesChecked=airborne, ledgeField=example, displacementRespawns=4)
(ROOT/'evidence/enemy-terrain-support.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(result)
