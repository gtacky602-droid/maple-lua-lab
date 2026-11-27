"""Verify the 15 Chasm map links and traverse every authored passage with Lua movement."""
import json
from runtime import runtime, ROOT, native
from savegame import validate_save


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
catalog = read('content/map-catalog.json')
coverage = read('content/coverage.json')
links = coverage['map_catalog']['stage_links']
source = read('sources/map-research/chasm-waypoint-reference.json')
map9 = {p['id']: p for p in catalog['nodes'] if p['map_id'] == 9}
stages = {nodes[links[mid]['stage_id']]['id'] for mid in map9}
assert len(stages) == len(map9) == 15
assert source['map_version'] == next(m['map_version'] for m in catalog['maps'] if m['id'] == 9)
assert not any(point.get('point_group') for point in map9.values())
for marker, point in map9.items():
    expected = [
        anchor['id'] for anchor in source['anchors']
        if anchor['l_x'] <= point['x'] <= anchor['r_x'] and anchor['l_y'] <= point['y'] <= anchor['r_y']
    ]
    assert source['overlapping_bounds_by_waypoint'][str(point['source_id'])] == expected
    stage = nodes[links[marker]['stage_id']]
    assert stage['mapPoint'] == marker
    for edge in stage['exits']:
        assert any(other['to'] == stage['id'] for other in nodes[edge['to']]['exits'])
    assert {p for p in links[marker]['gates']} == {
        nodes[edge['to']]['mapPoint'] for edge in stage['exits'] if edge['to'] in stages
    }

lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
core.enterStoryNode(state, 'liyue-harbor')
inputs = {direction: lua.table_from({direction: True}) for direction in ('left', 'right')}
walked = []


def cross(target):
    origin = state.story.node
    edge = next(edge for edge in nodes[origin]['exits'] if edge['to'] == target)
    for _ in range(720):
        actor = state.actors[state.active]
        assert state.story.node == origin and actor.hp > 0, (origin, target, state.story.node)
        if abs(actor.x - edge['x']) < 30:
            break
        core.step(state, 1 / 60, inputs['left' if actor.x > edge['x'] else 'right'])
    else:
        raise AssertionError((origin, target, 'could not reach gate'))
    nearby = core.frame(state, 'sprite', 'legacy').storyNearbyPortal
    assert nearby and nearby.to == target and nearby.available, (origin, target)
    core.action(state, 'story_nearby_portal')
    assert state.story.node == target, (origin, target, state.storyNotice)
    walked.append((origin, target))


cross('liyue-field')
cross('chasm-camp')
fixture = ROOT/'work/chasm-waypoint-fixture.json'
fixture.parent.mkdir(exist_ok=True)
fixture.write_text(json.dumps(validate_save(native(core.checkpoint(state)))), encoding='utf8')
quest_ids = ('chasm-survey', 'chasm-wetland-survey', 'chasm-stonehall-survey', 'chasm-west-survey')
for quest in quest_ids:
    core.action(state, 'story_accept:' + quest)

# Take both directions of every gate, including the second way around the main-mine loop.
covered = {'chasm-camp'}


def explore():
    origin = state.story.node
    for edge in nodes[origin]['exits']:
        target = edge['to']
        if target not in stages or (origin, target) in walked:
            continue
        cross(target)
        if target not in covered:
            covered.add(target)
            explore()
        cross(origin)


explore()
assert covered == stages | {'chasm-camp'}
assert {(a,b) for a,b in walked if a in stages and b in stages} == {
    (stage, edge['to']) for stage in stages for edge in nodes[stage]['exits'] if edge['to'] in stages
}
xp, money = state.progression.questXp, state.mora
quest_rewards = []
quests = {q['id']: q for q in graph['quests']}
for quest in quest_ids:
    assert state.story.quests[quest].count == 1
    core.action(state, 'story_report:' + quest)
    core.action(state, 'story_report:' + quest)
    assert state.story.quests[quest].status == 'complete'
    assert state.story.quests[quest].cycles == 1
    quest_rewards.append(quests[quest])
assert state.progression.questXp - xp == sum(q['xp'] for q in quest_rewards)
assert state.mora - money == sum(q['mora'] for q in quest_rewards)
checkpoint = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(checkpoint, recursive=True))
assert all(restored.story.visited[stage] for stage in stages)
assert all(restored.story.quests[quest].status == 'complete' for quest in quest_ids)

out = {'marker_count': len(stages), 'visited_stages': sorted(stages),
       'directed_gates_walked': [list(gate) for gate in sorted(set(walked))],
       'reported_quests': list(quest_ids), 'save_restored': True,
       'method': 'Normal Lua portal and movement inputs from a Lv20 Liyue hub fixture; all Chasm passages and all four quest rewards.'}
(ROOT/'evidence/chasm-waypoint-test.json').write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print('Walked all 15 linked stages in Lua and verified reports and checkpoint restore')
