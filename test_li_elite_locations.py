"""Verify Zhongli's route choices against the elite population that actually spawns."""
from tools.domain_terrain_test import core, nodes, placements, read, start, write

hub = 'liyue-harbor'
quest = 'daily-liyue-relics'
state = start(40, ['liyue-wp-39', 'liyue-wp-42', 'oceanid-approach'], hub)
core.dailyBind(state, 'd72ac5349dd6498f9e25ea3dfff820e1', 20801, None)
core.action(state, 'daily_accept:' + quest)
active = next(row for row in core.frame(state).daily.activeSlots.values() if row.id == quest)
shown = list(active.targetNodes.values())
regions = read('content/daily-quests.json')['regions']['liyue']['includeRegions']
found = {}
for node in nodes.values():
    id = node['id']
    if node['region'] not in regions or not core.atlasNodeVisible(state, id):
        continue
    if not any(e.get('dailyElite') and not e.get('dailyExclude') for e in placements.get(id, [])):
        continue
    core.enterStoryNode(state, id)
    valid = {p['id'] for p in placements[id] if not p.get('dailyExclude')}
    enemy = next((e for e in state.enemies.values() if e.dailyElite and e.spawnId in valid), None)
    if enemy:
        found[id] = enemy.spawnId
assert set(shown) == set(found), (set(shown) ^ set(found))
assert [nodes[id]['level'] for id in shown] == sorted(nodes[id]['level'] for id in shown)
row = next(q for q in state.daily.ledger.activeSlots.values() if q.id == quest)
for count, id in enumerate(['sites-hunt-7114-pocket-1', 'sites-hunt-7121-pocket-1'], 1):
    core.enterStoryNode(state, id)
    enemy = next(e for e in state.enemies.values() if e.spawnId == found[id])
    assert core.defeatEnemy(state, enemy, 1) and row.count == count
assert 'sites-hunt-7114' not in shown and 'sites-hunt-18048-pocket-2' not in shown
write('evidence/li-north-elite-locations.json', {'quest':quest,'locations':found,'verifiedKills':row.count})
print(f'{len(shown)} eligible map locations, both northern elite kills counted.')
