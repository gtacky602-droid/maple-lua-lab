"""Exercise the adopted Field Studio gates through the Lua story input."""
from argparse import ArgumentParser
from collections import Counter
import json
from pathlib import Path

from runtime import ROOT, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from tools.world_design.adopt_runtime_routes import GATE_CONDITIONS, read


def verify():
    graph = read('content/story-graph.json')
    nodes = {node['id']: node for node in graph['nodes']}
    report = read('evidence/field-studio-20261127-runtime-routes.json')
    plan = read('design/world/atlas-route-plan.json')
    reviewed = {frozenset(row['fields']): row for row in plan['sites_only_route_review']}
    lua, core = runtime()
    save = validate_save(read('evidence/remaining-survey-save.json'))
    state = core.restore(lua.table_from(save, recursive=True), 12)
    assert state.progression.level == 200
    state.auto = False
    exits = {id: node['exits'] for id, node in nodes.items()}
    edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
    walk = TrailWalk(lua, core, state, edges, exits)

    counts = Counter()
    conditional = []
    ferry_trips = []
    advance = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')
    problems = []
    for row in report['routes']:
        a, b = row['stages']
        pairs = ((a, b), (b, a))
        if row['operation'] == 'edge_delete':
            assert all((start, end) not in edges for start, end in pairs)
            counts['removed_pairs'] += 1
            continue
        field_ids = frozenset(nodes[id].get('mapPoint') or nodes[id].get('designField') for id in (a, b))
        review = reviewed[field_ids]
        assert review['finding'] == 'field_studio_lab_connection'
        if row['result'] == 'retained_existing_ferry':
            assert all(pair not in edges for pair in pairs)
            for start, deck, end in review['runtime_paths'].values():
                gate = edges[start, deck]
                assert gate['studioRoute'] == row['id'] and gate['studioMode'] == row['mode']
                core.enterStoryNode(state, start)
                walk.cross(deck)
                voyage = state.voyage
                assert voyage.destination == end and voyage.total == 90
                advance(core, state, 5399)
                assert state.story.node == deck
                advance(core, state, 1)
                assert state.story.node == end and not state.voyage
                counts['directions_linked'] += 1
                counts['ferry_directions_ridden'] += 1
                ferry_trips.append({'from': start, 'deck': deck, 'to': end, 'seconds': voyage.total})
            continue
        for start, end in pairs:
            gates = [edge for edge in exits[start]
                     if edge['to'] == end and edge.get('studioRoute') == row['id']]
            assert gates and all(edge['studioMode'] == row['mode'] for edge in gates)
            counts['directions_linked'] += 1
            if row['result'] != 'added_provisional_gates':
                continue
            edge = gates[0]
            core.enterStoryNode(state, start)
            state.enemies = lua.table()
            try:
                conditions = set(edge) & set(GATE_CONDITIONS)
                if conditions:
                    assert conditions == {'visitedOnly'}, (start, edge)
                    state.story.visited[end] = None
                    walk.approach(edge['x'], edge.get('y', 480), end)
                    core.action(state, 'story_nearby_portal')
                    assert state.story.node == start
                    lamp_room = next(node for node in nodes.values() if node.get('localLight')
                                     and any(exit['to'] == end and exit.get('darkOnly') for exit in node['exits']))
                    walk.cross(lamp_room['id'])
                    control = lamp_room['localLight']['controls'][0]
                    walk.approach(control['x'], control['y'], 'lamp')
                    core.action(state, 'story_collect')
                    assert state.storyLightMode == 'dark'
                    walk.cross(end)
                    walk.cross(start)
                    conditional.append({'from': start, 'to': end, 'first_visit_via': lamp_room['id']})
                    counts['visited_shortcuts_checked'] += 1
                walk.cross(end, edge['x'])
                counts['directions_walked'] += 1
            except AssertionError as error:
                problems.append((start, end, str(error)))
    assert not problems, problems
    assert counts['directions_walked'] == 2 * report['counts']['added_provisional_gates']
    quests = {q['id']: q for q in graph['quests']}
    reported = []
    for qid, approach in (
        ('mond-mapped-snowline', {
            2: ['mond-wp-6594', 'mond-wp-6608', 'mond-wp-6609', 'mond-wp-6603'],
        }),
        ('nat-mapped-valley-trail', {
            1: ['natlan-entry', 'nat-wp-72413', 'nat-wp-72414', 'nat-wp-72440', 'nat-wp-72434', 'nat-wp-72435'],
        }),
    ):
        quest = quests[qid]
        state = core.new(12)
        core.action(state, 'story_start')
        core.grantExp(state, sum(core.expNeeded(level) for level in range(1, quest['level'])), 'quest')
        core.enterStoryNode(state, quest['hub'])
        core.action(state, 'story_accept:' + qid)
        state.auto = False
        record = state.story.quests[qid]
        assert record.status == 'active'
        walk = TrailWalk(lua, core, state, edges, exits)
        for i, step in enumerate(quest['itinerary'], 1):
            for stage in approach.get(i, []):
                state.enemies = lua.table()
                walk.cross(stage)
            state.enemies = lua.table()
            if step['kind'] == 'arrive':
                assert state.story.node == step['from']
                walk.cross(step['node'])
            else:
                walk.approach(step['x'], step['y'], qid)
                core.action(state, 'story_collect')
            assert record.count == i, (qid, step['node'], state.storyNotice)
        core.action(state, 'story_fast:' + quest['hub'])
        core.action(state, 'story_report:' + qid)
        assert record.status == 'complete'
        reported.append({'quest': qid, 'level': state.progression.level, 'steps': record.count})
    return {'revision': report['editor_revision'], 'counts': counts, 'conditional': conditional,
            'ferry_trips': ferry_trips, 'quests_reported': reported,
            'setup': 'Lv200 restored save for gates, fresh level-specific fixtures for quests. Movement and portal actions with enemy damage suppressed.'}


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'evidence/field-studio-20261127-lua-travel.json')
    result = verify()
    parser.parse_args().output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(result)
