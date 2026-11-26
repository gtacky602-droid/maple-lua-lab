"""Check the actual monsters and return route offered by every regional patrol."""
from tools.domain_terrain_test import core, nodes, placements, read, start

config = read('content/daily-quests.json')
for quest in config['quests']:
    if quest['filter']['kind'] != 'region':
        continue
    hub, quest_id = quest['hub'], quest['id']
    state = start(200, [], hub)
    core.dailyBind(state, 'a' * 32, 20800, None)
    core.action(state, 'daily_accept:' + quest_id)
    row = state.daily.ledger.activeSlots[1]
    assert row.id == quest_id
    card = core.frame(state).daily.activeSlots[1]
    fields = list(card.targetNodes.values())
    assert fields and len(fields) == len(set(fields))
    assert [nodes[n]['level'] for n in fields] == sorted(nodes[n]['level'] for n in fields)
    region = config['regions'][quest['region']]
    for field in fields:
        assert nodes[field]['region'] in region['includeRegions']
        assert field not in region.get('excludeNodes', [])
        core.enterStoryNode(state, field)
        candidates = {p['id'] for p in placements[field] if not p.get('dailyExclude')}
        enemy = next(e for e in state.enemies.values() if e.spawnId in candidates)
    row.count = quest['goal'] - 1
    assert core.defeatEnemy(state, enemy, 1) and row.count == quest['goal']
    for day in [20800, 20801]:
        core.dailyBind(state, 'a' * 32, day, None)
        daily = core.frame(state).daily
        complete = (daily.activeSlots if day == 20800 else daily.carrySlots)[1]
        assert complete.reportNode == hub and not complete.canClaim
        core.action(state, 'world_map_focus:' + complete.reportNode)
        assert core.frame(state).worldMap.selected.id == hub
        core.action(state, 'world_map_close')
    core.enterStoryNode(state, hub)
    assert core.frame(state).daily.carrySlots[1].canClaim
    core.action(state, 'daily_carry:' + quest_id)
    assert state.daily.ledger.earnedMora == quest['mora']
    print(quest_id, len(fields))
