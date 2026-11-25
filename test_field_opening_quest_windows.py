"""Check the six atlas previews at the quest stages that open and close the fight."""
import json

from runtime import ROOT, runtime


def read(name):
    return json.loads((ROOT / name).read_bytes())


lua, core = runtime()
openings = read('content/field-boss-openings.json')
quests = {q['id']: q for q in read('content/story-graph.json')['quests']}
report = {}
for boss in read('content/field-boss-spawns.json')['fieldBosses']:
    gate = boss.get('storyWindow')
    if not gate:
        continue
    key, first = gate['quest'], gate['first']
    node = boss['node']
    quest = quests[key]
    step = quest['itinerary'][first]
    assert (step['node'], step['boss']) == (node, boss['id'])
    assert openings[node]['quest'] == {'id': key, 'count': first}
    state = core.new(12)
    core.action(state, 'story_start')
    state.story.quests[key] = lua.table_from({'status': 'active', 'count': first})
    core.enterStoryNode(state, node)
    forward = lua.table_from({'right': True})
    for tick in range(360):
        core.step(state, 1/60, forward)
        current = core.frame(state, 'sprite', 'legacy').fieldBoss
        if current and current.drawCount:
            break
    assert current and current.id == boss['id'] and current.drawCount > 0, node
    cases = [('未受注', None, 0, False), ('依頼戦', 'active', first, True),
             ('討伐後', 'active', gate['after'], False),
             ('報告後', 'complete', quest['goal'], bool(gate.get('repeatAfterReport')))]
    if first:
        cases.append(('直前の目標', 'active', first - 1, False))
    visible = {}
    for label, status, count, expected in cases:
        state.story.quests[key] = lua.table_from({'status': status, 'count': count}) if status else None
        frame = core.frame(state, 'sprite', 'legacy')
        visible[label] = bool(frame.fieldBoss and frame.fieldBoss.drawCount)
        assert visible[label] == expected, (node, label)
    report[node] = dict(quest=quest['name'], objective=step['objective'], visible=visible)

assert set(report) == {node for node, row in openings.items() if row.get('quest')}
(ROOT/'evidence/field-opening-quest-windows.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2)+'\n', 'utf8')
print(len(report), 'quest opening windows verified')
