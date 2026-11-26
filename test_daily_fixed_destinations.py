"""Compare fixed daily destinations with spawns before and after the story reports."""
from tools.domain_terrain_test import core, lua, placements, read, start

quests = [q for q in read('content/daily-quests.json')['quests'] if q['filter'].get('nodes')]
save = read('evidence/remaining-survey-save.json')


def qualifies(q, p):
    if p.get('dailyExclude'):
        return False
    rule = q['filter']
    if rule['kind'] == 'elite':
        return bool(p.get('dailyElite'))
    if rule['kind'] == 'species':
        return p['art'] in {item['art'] for item in q['observation']}
    return not rule.get('art') or p.get('dailySpecies', p['art']) in rule['art']


def inspect(state):
    core.dailyBind(state, 'e' * 32, 20800, None)
    results = {}
    for q in quests:
        hub = q['hub']
        core.enterStoryNode(state, hub)
        card = next(r for r in core.frame(state).daily.dailyChoices.values() if r.id == q['id'])
        expected = []
        for field in q['filter']['nodes']:
            visible = core.atlasNodeVisible(state, field)
            core.enterStoryNode(state, field)
            eligible = {p['id'] for p in placements[field] if qualifies(q, p)}
            ids = {e.spawnId for e in state.enemies.values() if e.spawnId in eligible}
            present = bool(ids)
            if visible and present:
                expected.append(field)
            atlas = core.dailyAtlasQuests(state, field)
            shown = {i for r in atlas.values() if r.id == q['id'] and r.role == 'field' for i in r.targets.values()}
            assert ids == shown, (field, q['id'], ids, shown)
        assert list(card.targetNodes.values()) == expected, (q['id'], expected)
        results[q['id']] = expected
    return results


early = inspect(start(200, [], 'mond-town'))
late = inspect(core.restore(lua.table_from(save, recursive=True)))
print(len(quests), 'fixed dailies;', sum(map(len, early.values())), 'early options;', sum(map(len, late.values())), 'after reports')
for q in quests:
    missing = [f for f in q['filter']['nodes'] if f not in early[q['id']] or f not in late[q['id']]]
    if missing:
        print(q['id'], missing)
